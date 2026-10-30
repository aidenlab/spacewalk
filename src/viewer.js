import EnsembleManager from "./ensembleManager.js"
import ColorMapManager, { defaultColormapName } from "./utils/colorMapManager.js"
import TrackMaterialProvider from "./trackMaterialProvider.js"
import ColorRampMaterialProvider from "./colorRampMaterialProvider.js"
import { appleCrayonColorRGB255, highlightColor } from "./utils/colorUtils.js"
import ThreeJSInitializer from "./initializers/threeJSInitializer.js"
import EnsembleIngestionController from "./ensembleIngestionController.js"
import GUIManager from "./guiManager.js"
import SettingsMenu from "./settingsMenu.js"
import ViewerSettings, { viewerSettingsStore } from "./viewerSettings.js"
import ReferenceRuler, { referenceRulerAnchorStore } from "./referenceRuler.js"
import { noStore } from "./utils/jsonStorageStore.js"
import TraceSelector from "./traceSelector.js"
import GenomicNavigator from "./genomicNavigator.js"
import { calculateProjectedBounds, nmPerPixel } from "./utils/projectedBounds.js"

/**
 * The 3D viewer, whole on its own: scene, ensemble manager, ingestion, the
 * visualizations, the genomic navigator, the picker, camera and lighting, and
 * scene fixtures. It imports nothing from igv or juicebox.js (viewer.test.js
 * holds that line).
 *
 * Companion viewers attach through the ports (see CONTEXT.md, Port). The one
 * already shaped as a call is the signal port: sceneManager.setMaterialProvider().
 * The full app assembles a viewer, then attaches its panels; a viewer-only page
 * assembles a viewer and stops.
 */
class Viewer {

    constructor(parts) {
        Object.assign(this, parts)
    }

    render() {
        if (this.sceneManager.isGood2Go()) {
            this.sceneManager.renderLoopHelper();
            this.genomicNavigator.renderLoopHelper();
            this.cameraLightingRig.renderLoopHelper();
            this.sceneFixtures.getGroundPlane().renderLoopHelper();
            this.sceneFixtures.getGnomon().renderLoopHelper();

            const { x, y } = this.threeJSInitializer.getMouseCoordinates();
            this.picker.intersect({ x, y, scene: this.scene, camera: this.camera });

            this.renderer.render(this.scene, this.camera);

            const convexHull = this.sceneManager.getConvexHull();

            if (convexHull && this.referenceRuler.visible) {
                const bounds = calculateProjectedBounds(convexHull.mesh, this.camera, this.renderer.domElement.parentElement);
                this.referenceRuler.render(nmPerPixel(bounds));
            }
        }
    }

    startRenderLoop() {
        const renderLoop = () => {
            requestAnimationFrame(renderLoop);
            this.render();
        };
        renderLoop();
    }
}

/**
 * Assemble the 3D viewer into the existing viewer DOM (canvas container,
 * navigator, widget and settings panels, toolbar).
 *
 * @param {HTMLElement} canvasContainer - holds the WebGL canvas
 * @param {HTMLElement} traceContainer  - canvas + navigator; resizing it resizes the viewer
 * @param {Storage} [storage]           - where viewer settings and the ruler's anchor persist
 *                                        (localStorage in the full app); omit to persist nothing
 * @returns {Promise<Viewer>}
 */
async function assembleViewer({ canvasContainer, traceContainer, storage }) {

    // Hand changes at the viewer's controls, as opposed to changes made by calling it,
    // reach whoever sets viewer.onHandChange: a Room (roomAttachment.js). The camera's
    // own gestures are the rig's events.
    const onHandChange = change => viewer.onHandChange?.(change);

    const viewerSettings = new ViewerSettings({ store: storage ? viewerSettingsStore(storage) : noStore });

    // Core managers
    const ensembleManager = new EnsembleManager();

    // Hosted here, plugged in through the signal port by whoever drives it.
    const trackMaterialProvider = new TrackMaterialProvider(appleCrayonColorRGB255('snow'), appleCrayonColorRGB255('blueberry'), ensembleManager);

    const colorMapManager = new ColorMapManager();
    await colorMapManager.configure();

    const colorRampMaterialProvider = new ColorRampMaterialProvider(defaultColormapName, colorMapManager);

    // Three.js scene, camera, renderer, picker, lighting, fixtures, SceneManager
    const threeJSInitializer = new ThreeJSInitializer(canvasContainer);
    const { sceneManager, picker, renderer, cameraLightingRig, camera, scene, sceneFixtures } = threeJSInitializer.initialize({
        colorRampMaterialProvider,
        ensembleManager,
        viewerSettings
    });

    // Widget panel
    const guiManager = new GUIManager({
        settingsButton: document.querySelector('#spacewalk-threejs-settings-button-container'),
        panel: document.querySelector('#spacewalk_ui_manager_panel'),
        sceneManager,
        ensembleManager,
        colorMapManager,
        onHandChange
    });

    const referenceRuler = new ReferenceRuler(canvasContainer, viewerSettings, storage ? referenceRulerAnchorStore(storage) : noStore);
    referenceRuler.insertDOM();

    const settingsMenu = new SettingsMenu(viewerSettings);

    const traceSelector = new TraceSelector(document.querySelector('#spacewalk_trace_select_input'), ensembleManager, onHandChange);
    const genomicNavigator = new GenomicNavigator(
        document.querySelector('#spacewalk-trace-navigator-container'),
        highlightColor,
        ensembleManager,
        sceneManager
    );

    // Late-bound: these need the navigator, which needs the SceneManager.
    sceneManager.createHighlighters({ ensembleManager, genomicNavigator });
    picker.wireDependencies({ sceneManager, genomicNavigator });
    cameraLightingRig.wireDependencies({ sceneFixtures });

    const ensembleIngestionController = new EnsembleIngestionController({
        ensembleManager,
        sceneManager,
        colorRampMaterialProvider,
        genomicNavigator,
        trackMaterialProvider,
    });

    const viewer = new Viewer({
        ensembleManager,
        colorMapManager,
        trackMaterialProvider,
        colorRampMaterialProvider,
        threeJSInitializer,
        sceneManager,
        picker,
        renderer,
        cameraLightingRig,
        camera,
        scene,
        sceneFixtures,
        guiManager,
        referenceRuler,
        viewerSettings,
        settingsMenu,
        traceSelector,
        genomicNavigator,
        ensembleIngestionController,
    });

    initializeHomeButton(cameraLightingRig, onHandChange);
    viewer.resizeObserver = observeResize(traceContainer, canvasContainer, viewer);

    return viewer;
}

function initializeHomeButton(cameraLightingRig, onHandChange) {
    const button = document.getElementById('spacewalk-threejs-home-button');

    // Prevent the drag container from starting a drag when the button is pressed
    button.addEventListener('pointerdown', e => e.stopPropagation());
    button.addEventListener('mousedown', e => e.stopPropagation());

    button.addEventListener('click', () => {
        cameraLightingRig.resetCamera?.();
        onHandChange({ type: 'camera-reset' });
    });
}

function observeResize(traceContainer, canvasContainer, viewer) {
    const resizeObserver = new ResizeObserver(() => {
        const { width, height } = canvasContainer.getBoundingClientRect();
        viewer.renderer.setSize(width, height);
        viewer.camera.aspect = width / height;
        viewer.camera.updateProjectionMatrix();

        // Re-clamp the ruler so it stays inside the resized container
        viewer.referenceRuler.applyAnchor();

        viewer.render();
    });

    resizeObserver.observe(traceContainer);
    return resizeObserver;
}

export { Viewer }
export default assembleViewer
