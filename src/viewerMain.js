/**
 * Entry point for the viewer-only page (viewer.html): the 3D viewer filling the
 * window, with no navbar, no IGV and no Juicebox. Given ?room= it shows what its
 * Room says (roomAttachment.js). Otherwise it opens either the ensemble named by
 * ?file=, or a snapshot URL: a spacewalk session string beside a viewer-settings
 * parameter, with no Room (snapshot.js). Hand loading and saving sessions belong
 * to the full app.
 *
 * The bundle for this page contains no igv and no juicebox.js; the build fails
 * if it does (build/viewerBoundary.mjs). See
 * development-notes/spacewalk-mcp-viewer-carve-out.md.
 */
import 'bootstrap'
import 'bootstrap/dist/css/bootstrap.min.css'
import './styles/app.scss'
import './styles/viewer_page.scss'
import assembleViewer from "./viewer.js"
import { parseLaunchIntent } from "./launchIntent.js"
import { readSnapshot } from "./snapshot.js"
import { attachViewerToRoom } from "./roomAttachment.js"
import { restoreSpacewalkSession } from "./spacewalkSessionRestore.js"
import { withSpinner } from "./utils/utils.js"
import AlertSingleton from "./widgets/alertSingleton.js"
import SettingsOverlay from "./settingsOverlay.js"
import { isInColorPicker } from "./utils/sharedColorPicker.js"
import { presentResourceError, installGlobalErrorNet } from "./widgets/presentResourceError.js"

installGlobalErrorNet()

// The spacewalk-mcp Worker. Deployed builds set it; `wrangler dev` listens here.
const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:8787'

document.addEventListener("DOMContentLoaded", async () => {

    AlertSingleton.init(document.body)

    const canvasContainer = document.getElementById('spacewalk-threejs-canvas-container')
    const traceContainer = document.getElementById('spacewalk-threejs-trace-navigator-container')
    const viewer = await withSpinner(() => assembleViewer({ canvasContainer, traceContainer }))

    const settingsOverlay = new SettingsOverlay({
        toggle: document.getElementById('spacewalk-viewer-toolbar-settings-button'),
        overlay: document.getElementById('spacewalk-settings-dropdown')
    })

    dismissOverlaysOnEscape(viewer.guiManager, settingsOverlay)

    const intent = parseLaunchIntent(window.location.href)
    if ('room' === intent.kind) {
        attachViewerToRoom(viewer, {
            server: SERVER_URL,
            room: intent.room,
            onStatus: status => {
                if ('ended' === status.type) AlertSingleton.present(status.message)
            }
        })
    } else {
        await openLaunchIntent(viewer, intent)
    }

    viewer.startRenderLoop()
})

// The overlays cover the canvas, so there is no background to click away to:
// Escape dismisses whichever are open. An open color-ramp menu or color picker
// takes the first Escape — checked capturing on window, ahead of Bootstrap,
// whose delegated handlers capture on document and would already have closed
// the menu. The color picker listens on its own popup, which holds focus.
function dismissOverlaysOnEscape(guiManager, settingsOverlay) {
    window.addEventListener('keydown', event => {
        if ('Escape' !== event.key) {
            return
        }
        if (guiManager.isPanelMenuOpen() || isInColorPicker(event.target)) {
            return
        }
        if (guiManager.isPanelPresented()) {
            guiManager.setPanelPresented(false)
        }
        if (settingsOverlay.isPresented()) {
            settingsOverlay.setPresented(false)
        }
    }, { capture: true })
}

async function openLaunchIntent(viewer, intent) {

    if ('session' === intent.kind) {
        await openSnapshot(viewer, intent)
        return
    }

    if ('file' !== intent.kind) {
        return
    }

    const { fileURL, traceKey, ensembleGroupKey } = intent
    try {
        await withSpinner(() => viewer.ensembleIngestionController.ingestEnsemblePath(fileURL, traceKey, ensembleGroupKey))
    } catch (error) {
        presentResourceError(error, { what: fileURL.split('/').pop().split('?')[0], url: fileURL })
    }
}

// A snapshot URL: the spacewalk session block, read as the full app reads it,
// then the camera it was taken from. Viewer settings come from their own
// parameter. The igv and juicebox sessions, if any, are not this page's.
async function openSnapshot(viewer, intent) {

    let snapshot
    try {
        snapshot = readSnapshot(intent)
    } catch (error) {
        presentResourceError(error, { what: 'the Spacewalk session' })
        return
    }

    if (undefined === snapshot) {
        console.warn('The viewer page opens a Spacewalk session only; this URL carries none.')
        return
    }

    const { spacewalk, viewerSettings } = snapshot

    if (viewerSettings) {
        viewer.viewerSettings.receive(viewerSettings)
    }

    try {
        await withSpinner(() => restoreSpacewalkSession(viewer, spacewalk))
    } catch (error) {
        presentResourceError(error, { what: 'the Spacewalk ensemble', url: spacewalk.url })
        return
    }

    // Ingesting framed the ensemble; the snapshot's camera replaces that framing.
    // ⌂ still returns to it.
    if (spacewalk.cameraLightingRig) {
        try {
            viewer.cameraLightingRig.setState(spacewalk.cameraLightingRig)
        } catch (error) {
            console.warn('Ignoring a camera the viewer cannot read:', error.message)
        }
    }
}
