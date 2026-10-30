import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventDispatcher, Vector3 } from 'three'
import ViewerSettings from './viewerSettings.js'
import { attachViewerToRoom } from './roomAttachment.js'

// Invisible bookkeeping between a Viewer and its Room: what a state makes the page
// do, what a hand change proposes, what gets reported. The real attachRemote runs
// over a fake socket, so the assertions are the messages on the wire. What the page
// then looks like is checked by eye.

vi.mock('./guiManager.js', () => ({
    default: {
        updateRenderStyleWidgetState: vi.fn(),
        updateStructureAppearanceWidgetState: vi.fn(),
    },
}))

vi.mock('./ballAndStick.js', () => ({ default: { renderStyle: 'render-style-ball-stick' } }))
vi.mock('./ribbon.js', () => ({ default: { renderStyle: 'render-style-ribbon' } }))

vi.mock('./utils/utils.js', () => ({ withSpinner: fn => fn() }))

const URL_A = 'https://host/a.sw'

function roomState(overrides = {}) {
    return {
        ensemble: null,
        renderStyle: 'ball-and-stick',
        structureAppearance: appearance(),
        viewerSettings: new ViewerSettings().get(),
        camera: null,
        ...overrides,
    }
}

function appearance(overrides = {}) {
    return {
        ballRadiusIndex: 5,
        stickRadiusIndex: 5,
        sticksVisible: true,
        pointSizeRadiusFraction: null,
        pointOpacity: 0.375,
        colorRamp: 'ramp',
        isCircular: false,
        ...overrides,
    }
}

function ensemble(overrides = {}) {
    return { url: URL_A, groupKey: null, traceKey: null, kind: null, ...overrides }
}

class FakeRig extends EventDispatcher {
    object = { position: new Vector3(1, 2, 3) }
    target = new Vector3(0, 0, 0)
    resetCamera = vi.fn()
    setPose = vi.fn((position, target) => {
        this.object.position.copy(position)
        this.target.copy(target)
    })
    orbitTo(x) {
        this.dispatchEvent({ type: 'start' })
        this.object.position.x = x
        this.dispatchEvent({ type: 'change' })
        this.dispatchEvent({ type: 'end' })
    }
}

function fakeViewer() {
    const viewer = {
        ensembleManager: { datasource: undefined },
        sceneManager: {
            renderStyle: undefined,
            structureAppearance: appearance(),
            setStructureAppearance: vi.fn(),
            applyStructureAppearance: vi.fn(function (value) { this.structureAppearance = value }),
            configureRenderStyle: vi.fn(function (style) { this.renderStyle = style }),
        },
        ensembleIngestionController: {
            ingestEnsemblePath: vi.fn(async () => { viewer.ensembleManager.datasource = { isPointCloud: false } }),
            ingestEnsembleGroup: vi.fn(async () => {}),
        },
        traceSelector: { selectTrace: vi.fn(async () => {}) },
        cameraLightingRig: new FakeRig(),
        viewerSettings: new ViewerSettings(),
    }
    return viewer
}

function attached(viewer, options = {}) {
    const sockets = []
    const createSocket = url => {
        const socket = {
            url,
            readyState: 1,
            sent: [],
            send(data) { this.sent.push(JSON.parse(data)) },
            close() {},
        }
        sockets.push(socket)
        return socket
    }
    const onStatus = vi.fn()
    const remote = attachViewerToRoom(viewer, { server: 'http://localhost:8787', room: 'ROOM', createSocket, onStatus, ...options })
    const socket = sockets[0]
    socket.onopen()
    const room = {
        socket,
        // A state from the Room, settled: drawn and reported.
        async sends(state, version = 1) {
            socket.onmessage({ data: JSON.stringify({ type: 'state', version, state }) })
            await vi.advanceTimersByTimeAsync(0)
        },
        realized: () => socket.sent.filter(({ type }) => 'realized' === type),
        proposals: () => socket.sent.filter(({ type }) => 'propose' === type).map(({ proposal }) => proposal),
        remote,
        onStatus,
    }
    return room
}

describe('attachViewerToRoom', () => {

    beforeEach(() => { vi.useFakeTimers() })
    afterEach(() => { vi.useRealTimers() })

    it('joins the Room over a WebSocket on the server', () => {
        const { socket } = attached(fakeViewer(), { server: 'https://mcp.example' })
        expect(socket.url).toBe('wss://mcp.example/ws?room=ROOM')
        expect(socket.sent[0]).toMatchObject({ type: 'join' })
    })

    describe('drawing a state', () => {

        it('reports an empty Room drawn, with no kind', async () => {
            const room = attached(fakeViewer())
            await room.sends(roomState())
            expect(room.realized()).toEqual([{ type: 'realized', version: 1, kind: null, result: { outcome: 'drawn' } }])
        })

        it('loads the ensemble, with the first trace by default, and reports its kind', async () => {
            const viewer = fakeViewer()
            const room = attached(viewer)
            await room.sends(roomState({ ensemble: ensemble() }))
            expect(viewer.ensembleIngestionController.ingestEnsemblePath).toHaveBeenCalledWith(URL_A, '0', undefined)
            expect(room.realized()[0]).toMatchObject({ kind: 'trace', result: { outcome: 'drawn' } })
        })

        it('reports a point cloud', async () => {
            const viewer = fakeViewer()
            viewer.ensembleIngestionController.ingestEnsemblePath = vi.fn(async () => { viewer.ensembleManager.datasource = { isPointCloud: true } })
            const room = attached(viewer)
            await room.sends(roomState({ ensemble: ensemble() }))
            expect(room.realized()[0].kind).toBe('point-cloud')
        })

        it('reports a load that fails once, without fetching it again, and draws the rest of later states', async () => {
            const viewer = fakeViewer()
            viewer.ensembleIngestionController.ingestEnsemblePath = vi.fn(async () => { throw new Error('404') })
            const room = attached(viewer)
            await room.sends(roomState({ ensemble: ensemble() }))
            await room.sends(roomState({ ensemble: ensemble(), structureAppearance: appearance({ ballRadiusIndex: 8 }) }), 2)
            expect(room.realized()[0]).toMatchObject({ kind: null, result: { outcome: 'failed', reason: '404' } })
            expect(room.realized()[1]).toMatchObject({ kind: null, result: { outcome: 'drawn' } })
            expect(viewer.ensembleIngestionController.ingestEnsemblePath).toHaveBeenCalledTimes(1)
            expect(viewer.sceneManager.structureAppearance.ballRadiusIndex).toBe(8)
        })

        it('does not report the kind of the ensemble still shown after another fails to load', async () => {
            const viewer = fakeViewer()
            const room = attached(viewer)
            await room.sends(roomState({ ensemble: ensemble() }))
            viewer.ensembleIngestionController.ingestEnsemblePath = vi.fn(async () => { throw new Error('404') })
            await room.sends(roomState({ ensemble: ensemble({ url: 'https://host/b.sw' }) }), 2)
            await room.sends(roomState({ ensemble: ensemble({ url: 'https://host/b.sw' }) }), 3)
            expect(room.realized()[2].kind).toBe(null)
        })

        it('leaves viewer settings it already shows alone', async () => {
            const viewer = fakeViewer()
            const room = attached(viewer)
            const receive = vi.spyOn(viewer.viewerSettings, 'receive')
            await room.sends(roomState())
            expect(receive).not.toHaveBeenCalled()
        })

        it('a resync of what is shown redraws nothing', async () => {
            const viewer = fakeViewer()
            const room = attached(viewer)
            const state = roomState({ ensemble: ensemble(), camera: { position: { x: 9, y: 9, z: 9 }, target: { x: 0, y: 0, z: 0 } } })
            await room.sends(state)
            viewer.cameraLightingRig.setPose.mockClear()
            await room.sends(state)
            expect(viewer.ensembleIngestionController.ingestEnsemblePath).toHaveBeenCalledTimes(1)
            expect(viewer.traceSelector.selectTrace).not.toHaveBeenCalled()
            expect(viewer.cameraLightingRig.setPose).not.toHaveBeenCalled()
            expect(room.realized()).toHaveLength(2)
        })

        it('steps to another trace without loading again', async () => {
            const viewer = fakeViewer()
            const room = attached(viewer)
            await room.sends(roomState({ ensemble: ensemble() }))
            await room.sends(roomState({ ensemble: ensemble({ traceKey: '12' }) }), 2)
            expect(viewer.traceSelector.selectTrace).toHaveBeenCalledWith(12)
            expect(viewer.ensembleIngestionController.ingestEnsemblePath).toHaveBeenCalledTimes(1)
        })

        it('chooses another group, whose trace is its default', async () => {
            const viewer = fakeViewer()
            const room = attached(viewer)
            await room.sends(roomState({ ensemble: ensemble({ traceKey: '12' }) }))
            await room.sends(roomState({ ensemble: ensemble({ groupKey: 'g2' }) }), 2)
            expect(viewer.ensembleIngestionController.ingestEnsembleGroup).toHaveBeenCalledWith('g2')
            expect(viewer.traceSelector.selectTrace).not.toHaveBeenCalled()
        })

        it('loads whole a group and trace that change together', async () => {
            const viewer = fakeViewer()
            const room = attached(viewer)
            await room.sends(roomState({ ensemble: ensemble() }))
            await room.sends(roomState({ ensemble: ensemble({ groupKey: 'g2', traceKey: '3' }) }), 2)
            expect(viewer.ensembleIngestionController.ingestEnsemblePath).toHaveBeenLastCalledWith(URL_A, '3', 'g2')
        })

        it('applies structure appearance and viewer settings to what is shown', async () => {
            const viewer = fakeViewer()
            const room = attached(viewer)
            const settings = roomState().viewerSettings
            settings.gnomon.visible = true
            await room.sends(roomState({ structureAppearance: appearance({ ballRadiusIndex: 8 }), viewerSettings: settings }))
            expect(viewer.sceneManager.structureAppearance.ballRadiusIndex).toBe(8)
            expect(viewer.viewerSettings.get().gnomon.visible).toBe(true)
        })

        it('changes the render style', async () => {
            const viewer = fakeViewer()
            const room = attached(viewer)
            await room.sends(roomState({ ensemble: ensemble() }))
            await room.sends(roomState({ ensemble: ensemble(), renderStyle: 'ribbon' }), 2)
            expect(viewer.sceneManager.renderStyle).toBe('render-style-ribbon')
        })

        it('a point cloud keeps being one, and reports a new render style as failed', async () => {
            const viewer = fakeViewer()
            viewer.ensembleIngestionController.ingestEnsemblePath = vi.fn(async () => { viewer.ensembleManager.datasource = { isPointCloud: true } })
            const room = attached(viewer)
            await room.sends(roomState({ ensemble: ensemble(), renderStyle: 'ribbon' }))
            expect(room.realized()[0].result.outcome).toBe('drawn')
            await room.sends(roomState({ ensemble: ensemble(), renderStyle: 'ball-and-stick' }), 2)
            expect(room.realized()[1]).toMatchObject({ kind: 'point-cloud', result: { outcome: 'failed' } })
            expect(viewer.sceneManager.configureRenderStyle).not.toHaveBeenCalled()
        })
    })

    describe('the camera a state carries', () => {

        const pose = { position: { x: 9, y: 8, z: 7 }, target: { x: 1, y: 1, z: 1 } }

        it('is put on the rig after the ensemble loads', async () => {
            const viewer = fakeViewer()
            const room = attached(viewer)
            await room.sends(roomState({ ensemble: ensemble(), camera: pose }))
            expect(viewer.cameraLightingRig.object.position.toArray()).toEqual([ 9, 8, 7 ])
            expect(viewer.cameraLightingRig.target.toArray()).toEqual([ 1, 1, 1 ])
        })

        it('going to null frames the structure again', async () => {
            const viewer = fakeViewer()
            const room = attached(viewer)
            await room.sends(roomState({ ensemble: ensemble(), camera: pose }))
            await room.sends(roomState({ ensemble: ensemble() }), 2)
            expect(viewer.cameraLightingRig.resetCamera).toHaveBeenCalledTimes(1)
        })

        it('survives a trace step, which frames the new trace', async () => {
            const viewer = fakeViewer()
            const room = attached(viewer)
            await room.sends(roomState({ ensemble: ensemble(), camera: pose }))
            viewer.cameraLightingRig.setPose.mockClear()
            await room.sends(roomState({ ensemble: ensemble({ traceKey: '2' }), camera: pose }), 2)
            expect(viewer.cameraLightingRig.setPose).toHaveBeenCalledTimes(1)
        })

        it('that arrived during a click is drawn when the click is over', async () => {
            const viewer = fakeViewer()
            const room = attached(viewer)
            await room.sends(roomState({ ensemble: ensemble() }))
            viewer.cameraLightingRig.dispatchEvent({ type: 'start' })
            await room.sends(roomState({ ensemble: ensemble(), camera: pose }), 2)
            viewer.cameraLightingRig.dispatchEvent({ type: 'end' })
            await vi.advanceTimersByTimeAsync(500)
            expect(viewer.cameraLightingRig.object.position.toArray()).toEqual([ 9, 8, 7 ])
            expect(room.proposals()).toEqual([])
        })

        it('waits while a person is moving the camera', async () => {
            const viewer = fakeViewer()
            const room = attached(viewer)
            await room.sends(roomState({ ensemble: ensemble() }))
            viewer.cameraLightingRig.dispatchEvent({ type: 'start' })
            await room.sends(roomState({ ensemble: ensemble(), camera: pose }), 2)
            expect(viewer.cameraLightingRig.setPose).not.toHaveBeenCalled()
        })
    })

    describe('a hand change', () => {

        it('of the trace is proposed, and its echo redraws nothing', async () => {
            const viewer = fakeViewer()
            const room = attached(viewer)
            await room.sends(roomState({ ensemble: ensemble() }))
            viewer.onHandChange({ type: 'trace', index: 7 })
            expect(room.proposals()).toEqual([{ type: 'select-trace', key: '7' }])
            await room.sends(roomState({ ensemble: ensemble({ traceKey: '7' }) }), 2)
            expect(viewer.traceSelector.selectTrace).not.toHaveBeenCalled()
        })

        it('of the trace keeps the Room\'s camera, which the step framed away', async () => {
            const viewer = fakeViewer()
            const room = attached(viewer)
            const camera = { position: { x: 9, y: 8, z: 7 }, target: { x: 1, y: 1, z: 1 } }
            await room.sends(roomState({ ensemble: ensemble(), camera }))
            viewer.cameraLightingRig.object.position.set(0, 0, 100)
            viewer.onHandChange({ type: 'trace', index: 7 })
            expect(viewer.cameraLightingRig.object.position.toArray()).toEqual([ 9, 8, 7 ])
        })

        it('that a resync contradicts is put back', async () => {
            const viewer = fakeViewer()
            const room = attached(viewer)
            await room.sends(roomState({ ensemble: ensemble() }))
            viewer.onHandChange({ type: 'trace', index: 7 })
            await room.sends(roomState({ ensemble: ensemble() }), 1)
            expect(viewer.traceSelector.selectTrace).toHaveBeenCalledWith(0)
        })

        it('of the render style is proposed in the Room\'s terms', async () => {
            const viewer = fakeViewer()
            const room = attached(viewer)
            await room.sends(roomState({ ensemble: ensemble() }))
            viewer.sceneManager.renderStyle = 'render-style-ribbon'
            viewer.onHandChange({ type: 'render-style', style: 'render-style-ribbon' })
            expect(room.proposals()).toEqual([{ type: 'set-render-style', style: 'ribbon' }])
        })

        it('of structure appearance proposes only what changed, once the gesture ends', async () => {
            const viewer = fakeViewer()
            const room = attached(viewer)
            await room.sends(roomState())
            viewer.sceneManager.structureAppearance = appearance({ ballRadiusIndex: 6 })
            viewer.onHandChange({ type: 'structure-appearance' })
            viewer.sceneManager.structureAppearance = appearance({ ballRadiusIndex: 7, sticksVisible: false })
            viewer.onHandChange({ type: 'structure-appearance' })
            expect(room.proposals()).toEqual([])
            await vi.advanceTimersByTimeAsync(300)
            expect(room.proposals()).toEqual([{ type: 'set-structure-appearance', patch: { ballRadiusIndex: 7, sticksVisible: false } }])
        })

        it('of the structure appearance a ramp the build lacks fell back from is not news', async () => {
            const viewer = fakeViewer()
            viewer.sceneManager.applyStructureAppearance = vi.fn(function (value) { this.structureAppearance = { ...value, colorRamp: 'default' } })
            const room = attached(viewer)
            await room.sends(roomState({ structureAppearance: appearance({ colorRamp: 'unknown' }) }))
            viewer.sceneManager.structureAppearance = { ...viewer.sceneManager.structureAppearance, ballRadiusIndex: 6 }
            viewer.onHandChange({ type: 'structure-appearance' })
            await vi.advanceTimersByTimeAsync(300)
            expect(room.proposals()).toEqual([{ type: 'set-structure-appearance', patch: { ballRadiusIndex: 6 } }])
        })

        it('of viewer settings proposes the change, and the Room becomes their store', async () => {
            const viewer = fakeViewer()
            const room = attached(viewer)
            await room.sends(roomState())
            viewer.viewerSettings.update({ gnomon: { visible: true } })
            await vi.advanceTimersByTimeAsync(300)
            expect(room.proposals()).toEqual([{ type: 'set-viewer-settings', patch: { gnomon: { visible: true } } }])
        })

        it('that the Room sends back in viewer settings does not propose again', async () => {
            const viewer = fakeViewer()
            const room = attached(viewer)
            const settings = roomState().viewerSettings
            settings.gnomon.visible = true
            await room.sends(roomState({ viewerSettings: settings }))
            await vi.advanceTimersByTimeAsync(300)
            expect(room.proposals()).toEqual([])
        })

        it('to the camera is proposed once it has settled, drift included', async () => {
            const viewer = fakeViewer()
            const room = attached(viewer)
            await room.sends(roomState({ ensemble: ensemble() }))
            const rig = viewer.cameraLightingRig
            rig.orbitTo(50)
            await vi.advanceTimersByTimeAsync(100)
            expect(room.proposals()).toEqual([])
            rig.object.position.x = 60
            rig.dispatchEvent({ type: 'change' })
            await vi.advanceTimersByTimeAsync(500)
            expect(room.proposals()).toEqual([{ type: 'set-camera', camera: { position: { x: 60, y: 2, z: 3 }, target: { x: 0, y: 0, z: 0 } } }])
        })

        it('to the camera does not wait out drift too small to see', async () => {
            const viewer = fakeViewer()
            const room = attached(viewer)
            await room.sends(roomState({ ensemble: ensemble() }))
            const rig = viewer.cameraLightingRig
            rig.orbitTo(50)
            for (let i = 0; i < 10; i++) {
                await vi.advanceTimersByTimeAsync(100)
                rig.object.position.x += 1e-6
                rig.dispatchEvent({ type: 'change' })
            }
            expect(room.proposals()).toHaveLength(1)
        })

        it('to the camera, once proposed, is not undone by its echo', async () => {
            const viewer = fakeViewer()
            const room = attached(viewer)
            await room.sends(roomState({ ensemble: ensemble() }))
            viewer.cameraLightingRig.orbitTo(50)
            await vi.advanceTimersByTimeAsync(500)
            const { camera } = room.proposals()[0]
            await room.sends(roomState({ ensemble: ensemble(), camera }), 2)
            expect(viewer.cameraLightingRig.setPose).not.toHaveBeenCalled()
        })

        it('a click on the canvas does not move the camera, and proposes nothing', async () => {
            const viewer = fakeViewer()
            const room = attached(viewer)
            await room.sends(roomState({ ensemble: ensemble() }))
            viewer.cameraLightingRig.dispatchEvent({ type: 'start' })
            viewer.cameraLightingRig.dispatchEvent({ type: 'end' })
            await vi.advanceTimersByTimeAsync(500)
            expect(room.proposals()).toEqual([])
        })

        it('a change the page makes to the camera itself proposes nothing', async () => {
            const viewer = fakeViewer()
            const room = attached(viewer)
            await room.sends(roomState({ ensemble: ensemble() }))
            viewer.cameraLightingRig.dispatchEvent({ type: 'change' })
            await vi.advanceTimersByTimeAsync(500)
            expect(room.proposals()).toEqual([])
        })

        it('of the home button resets the camera', async () => {
            const viewer = fakeViewer()
            const room = attached(viewer)
            await room.sends(roomState({ ensemble: ensemble(), camera: { position: { x: 9, y: 8, z: 7 }, target: { x: 1, y: 1, z: 1 } } }))
            viewer.onHandChange({ type: 'camera-reset' })
            expect(room.proposals()).toEqual([{ type: 'reset-camera' }])
            await room.sends(roomState({ ensemble: ensemble() }), 2)
            expect(viewer.cameraLightingRig.resetCamera).not.toHaveBeenCalled()
        })
    })

    it('passes the Room letting it go on to the page', async () => {
        const room = attached(fakeViewer())
        room.socket.onmessage({ data: JSON.stringify({ type: 'error', code: 'room-expired' }) })
        expect(room.onStatus).toHaveBeenCalledWith(expect.objectContaining({ type: 'ended', message: 'This Room has expired.' }))
    })
})
