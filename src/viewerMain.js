/**
 * Entry point for the viewer-only page (viewer.html): the 3D viewer filling the
 * window, with no navbar, no IGV and no Juicebox. It loads the ensemble named by
 * ?file= and nothing else — hand loading and sessions belong to the full app.
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
import { withSpinner } from "./utils/utils.js"
import AlertSingleton from "./widgets/alertSingleton.js"
import SettingsOverlay from "./settingsOverlay.js"
import { isInColorPicker } from "./utils/sharedColorPicker.js"
import { presentResourceError, installGlobalErrorNet } from "./widgets/presentResourceError.js"

installGlobalErrorNet()

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

    await loadEnsembleFromURL(viewer, window.location.href)

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

async function loadEnsembleFromURL(viewer, href) {

    const intent = parseLaunchIntent(href)

    if ('session' === intent.kind) {
        console.warn('The viewer page loads an ensemble from ?file= only; ignoring session parameters.')
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
