import * as THREE from 'three'
import { attachRemote } from '@aidenlab/spacewalk-remote'
import BallAndStick from './ballAndStick.js'
import GUIManager from './guiManager.js'
import Ribbon from './ribbon.js'
import { restoreSpacewalkSession } from './spacewalkSessionRestore.js'
import { withSpinner } from './utils/utils.js'

const RENDER_STYLE_ON_PAGE = {
    'ball-and-stick': BallAndStick.renderStyle,
    'ribbon': Ribbon.renderStyle,
}

const RENDER_STYLE_IN_ROOM = {
    [ BallAndStick.renderStyle ]: 'ball-and-stick',
    [ Ribbon.renderStyle ]: 'ribbon',
}

// OrbitControls' damping carries the camera on after the pointer lifts: a gesture
// is over once the camera has been still this long. Damping fires changes long after
// they stop showing, so a step under this fraction of the distance to the target is still.
const CAMERA_SETTLE_MS = 200
const CAMERA_STILL_FRACTION = 1e-4

/**
 * Attach a viewer to its Room (spacewalk-mcp ADR 0001): the page shows what the Room
 * broadcasts and proposes what is changed by hand. The Room is also the viewer-settings
 * store (ADR 0002). The ruler's anchor and which overlays are open stay with the window.
 *
 * Every state is drawn, the same version again on a resync, so drawing changes only
 * what differs from what the page shows; that leaves a hand change's echo with nothing
 * to do, and puts back a hand change the Room did not take.
 *
 * @param {Viewer} viewer - from assembleViewer
 * @param {object} options
 * @param {string} options.server - the spacewalk-mcp Worker, an http(s) URL
 * @param {string} options.room - the Room id, from the Room link
 * @param {function} [options.onStatus] - told how the connection stands (attachRemote's Status)
 * @param {function} [options.createSocket] - defaults to the platform WebSocket
 * @returns {Remote} attachRemote's handle
 */
function attachViewerToRoom(viewer, { server, room, onStatus, createSocket }) {

    const { ensembleManager, sceneManager, ensembleIngestionController, traceSelector, cameraLightingRig, viewerSettings } = viewer

    // The page's place in the ensemble and its camera, in the Room's terms. A null
    // camera means framed. The render style and appearance are read from the scene.
    const shown = { url: undefined, groupKey: null, traceKey: '0', renderStyle: undefined, camera: null }

    // What the scene's appearance was when last in step with the Room; a hand change is the difference.
    let appearanceInStep = sceneManager.structureAppearance

    let cameraGesture = false

    // The camera the Room last sent, drawn late if a gesture was in the way.
    let roomCamera = null

    // The place in an ensemble that would not load. The Room keeps naming it; fetching
    // it again for every later version would not help, and it is reported once.
    let failedPlace = null

    // The camera this page proposed and the Room has not yet sent back. The states ahead
    // of it still carry the camera it replaced, which would pull the view back to it.
    let cameraOnItsWay = null

    const isPointCloud = () => true === ensembleManager.datasource?.isPointCloud

    const kind = () => {
        if (failedPlace || !ensembleManager.datasource) return null
        return isPointCloud() ? 'point-cloud' : 'trace'
    }

    // Resolves to whether the structure was rebuilt, which frames it.
    async function drawEnsemble({ url, groupKey, traceKey }, renderStyle, structureAppearance) {

        const key = traceKey ?? '0'

        // Back to a default group, or a group and trace at once, is a load as much as a new ensemble is.
        const isGroupChange = groupKey !== shown.groupKey
        if (url !== shown.url || (isGroupChange && (null === groupKey || null !== traceKey))) {
            await withSpinner(() => restoreSpacewalkSession(viewer, {
                url,
                traceKey: key,
                ensembleGroupKey: groupKey ?? undefined,
                renderStyle: RENDER_STYLE_ON_PAGE[ renderStyle ],
                structureAppearance,
            }))
        } else if (isGroupChange) {
            await ensembleIngestionController.ingestEnsembleGroup(groupKey)
        } else if (key !== shown.traceKey) {
            await traceSelector.selectTrace(parseInt(key, 10))
        } else {
            return false
        }

        Object.assign(shown, { url, groupKey, traceKey: key })
        return true
    }

    // The draw goes on without the ensemble: what else the state says can still be shown.
    // Resolves to whether the structure was rebuilt, and why it could not be, if so.
    async function tryDrawEnsemble(ensemble, renderStyle, structureAppearance) {

        const place = ensemble && { url: ensemble.url, groupKey: ensemble.groupKey, traceKey: ensemble.traceKey }

        if (failedPlace && isSame(place, failedPlace)) return { didRebuild: false }
        failedPlace = null

        if (!ensemble) return { didRebuild: false }

        try {
            return { didRebuild: await drawEnsemble(ensemble, renderStyle, structureAppearance) }
        } catch (error) {
            failedPlace = place
            return { didRebuild: false, failure: error.message }
        }
    }

    function drawRenderStyle(renderStyle, didRebuild) {

        const before = shown.renderStyle
        shown.renderStyle = renderStyle

        if (isPointCloud()) {
            // Until the Room knows the kind it cannot refuse this; the Viewer says so instead.
            const isNewChoice = !didRebuild && undefined !== before && renderStyle !== before
            return isNewChoice ? 'The ensemble is a point cloud, which is always drawn as a point cloud.' : undefined
        }

        const style = RENDER_STYLE_ON_PAGE[ renderStyle ]
        GUIManager.updateRenderStyleWidgetState(style)
        if (style !== sceneManager.renderStyle) {
            sceneManager.configureRenderStyle(style)
        }
        return undefined
    }

    function drawCamera(camera, didRebuild) {

        // The gesture's own proposal is coming; it decides.
        if (cameraGesture) return

        if (cameraOnItsWay) {
            if (!isSame(camera, cameraOnItsWay)) return
            cameraOnItsWay = null
        }

        if (camera) {
            if (didRebuild || !isSame(camera, shown.camera)) {
                applyPose(cameraLightingRig, camera)
            }
        } else if (shown.camera && !didRebuild) {
            cameraLightingRig.resetCamera?.()
        }
        shown.camera = camera
    }

    async function draw({ ensemble, renderStyle, structureAppearance, viewerSettings: settings, camera }) {

        if (!isSame(settings, viewerSettings.get())) {
            viewerSettings.receive(settings)
        }

        roomCamera = camera

        const { didRebuild, failure: ensembleFailure } = await tryDrawEnsemble(ensemble, renderStyle, structureAppearance)

        sceneManager.applyStructureAppearance(structureAppearance)
        GUIManager.updateStructureAppearanceWidgetState(structureAppearance)
        appearanceInStep = sceneManager.structureAppearance

        const renderStyleFailure = drawRenderStyle(renderStyle, didRebuild)

        drawCamera(camera, didRebuild)

        const failure = ensembleFailure ?? renderStyleFailure

        return undefined === failure ? { kind: kind() } : { kind: kind(), failure }
    }

    function commitCamera() {
        const camera = poseOf(cameraLightingRig)
        if (isSame(camera, shown.camera)) return
        shown.camera = cameraOnItsWay = camera
        remote.propose({ type: 'set-camera', camera })
    }

    // Traces lie at their own places in the nucleus, many radii apart, so a pose held
    // still looks at where the last trace was and the new one is off screen. What holds
    // is the view of the trace: its direction, distance and pan move with the trace.
    function carryViewToSteppedTrace() {
        if (!shown.camera && !cameraGesture) return

        const { position, target, centerBefore, center } = cameraLightingRig.lastFraming
        const shift = center.clone().sub(centerBefore)
        cameraLightingRig.setPose(position.clone().add(shift), target.clone().add(shift))

        // A gesture's own commit will send this, once the camera has settled.
        if (!cameraGesture) commitCamera()
    }

    const remote = attachRemote({
        url: roomSocketURL(server),
        room,
        draw,
        createSocket,
        onStatus: status => {
            // A proposal may have been lost with the connection; the resync decides.
            if ('open' === status.type) cameraOnItsWay = null
            onStatus?.(status)
        },
    })

    viewerSettings.useStore({
        load: () => null,
        save: (values, patch) => remote.propose({ type: 'set-viewer-settings', patch }),
    })

    viewer.onHandChange = change => {
        switch (change.type) {

            case 'trace':
                shown.traceKey = String(change.index)
                remote.propose({ type: 'select-trace', key: shown.traceKey })
                carryViewToSteppedTrace()
                break

            case 'render-style':
                shown.renderStyle = RENDER_STYLE_IN_ROOM[ change.style ]
                remote.propose({ type: 'set-render-style', style: shown.renderStyle })
                break

            case 'structure-appearance': {
                const current = sceneManager.structureAppearance
                const patch = changedFields(appearanceInStep, current)
                appearanceInStep = current
                if (Object.keys(patch).length > 0) {
                    remote.propose({ type: 'set-structure-appearance', patch })
                }
                break
            }

            case 'camera-reset':
                shown.camera = null
                remote.propose({ type: 'reset-camera' })
                break
        }
    }

    followCameraGestures(cameraLightingRig, {
        began: () => { cameraGesture = true },
        ended: didMove => {
            cameraGesture = false
            if (didMove) {
                commitCamera()
            } else {
                drawCamera(roomCamera, false)
            }
        },
    })

    return remote
}

// began() when a person takes hold of the camera; ended(didMove) when they have let
// go and it has stopped. Changes made outside a gesture are the page's own.
function followCameraGestures(rig, { began, ended }) {

    let inGesture = false
    let released = false
    let didMove = false
    let timer
    const lastPosition = new THREE.Vector3()

    const settleAfterRelease = () => {
        clearTimeout(timer)
        timer = setTimeout(() => {
            const moved = didMove
            inGesture = released = didMove = false
            ended(moved)
        }, CAMERA_SETTLE_MS)
    }

    rig.addEventListener('start', () => {
        clearTimeout(timer)
        inGesture = true
        released = false
        began()
    })

    rig.addEventListener('change', () => {
        if (!inGesture) return
        didMove = true
        if (!released) return
        const { position } = rig.object
        const isStill = position.distanceTo(lastPosition) <= CAMERA_STILL_FRACTION * position.distanceTo(rig.target)
        lastPosition.copy(position)
        if (!isStill) settleAfterRelease()
    })

    rig.addEventListener('end', () => {
        released = true
        lastPosition.copy(rig.object.position)
        settleAfterRelease()
    })
}

function roomSocketURL(server) {
    const url = new URL('/ws', server)
    url.protocol = 'https:' === url.protocol ? 'wss:' : 'ws:'
    return url.toString()
}

function poseOf({ object: { position }, target }) {
    return {
        position: { x: position.x, y: position.y, z: position.z },
        target: { x: target.x, y: target.y, z: target.z },
    }
}

function applyPose(rig, { position, target }) {
    rig.setPose(new THREE.Vector3(position.x, position.y, position.z), new THREE.Vector3(target.x, target.y, target.z))
}

// Field by field: the Room's records and the page's list their fields in different orders.
function isSame(a, b) {
    if ('object' !== typeof a || 'object' !== typeof b || null === a || null === b) return a === b
    const keys = Object.keys(a)
    return keys.length === Object.keys(b).length && keys.every(key => isSame(a[ key ], b[ key ]))
}

function changedFields(before, after) {
    return Object.fromEntries(Object.entries(after).filter(([ key, value ]) => value !== before[ key ]))
}

export { attachViewerToRoom }
