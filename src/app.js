import EnsembleManager from "./ensembleManager.js"
import ColorMapManager from "./utils/colorMapManager.js"
import TrackMaterialProvider from "./trackMaterialProvider.js"
import ColorRampMaterialProvider from "./colorRampMaterialProvider.js"
import { appleCrayonColorRGB255 } from "./utils/colorUtils.js"
import { SessionService } from "./sessionServices.js"
import SessionBootstrapper from "./sessionBootstrapper.js"
import { showGlobalSpinner, hideGlobalSpinner } from './utils/utils.js'
import { defaultColormapName } from "./utils/colorMapManager.js"
import ThreeJSInitializer from "./initializers/threeJSInitializer.js"
import UIBootstrapper from "./initializers/uiBootstrapper.js"
import PanelInitializer from "./initializers/panelInitializer.js"
import EnsembleIngestionController from "./ensembleIngestionController.js"
import { calculateProjectedBounds, nmPerPixel } from "./utils/projectedBounds.js"

/**
 * Main application class that orchestrates Spacewalk initialization.
 * All shared state lives on the App instance and is passed to consumers
 * via constructor injection.
 */
class App {
    constructor() {

        // Core managers
        this.ensembleManager = null;
        this.colorMapManager = null;
        this.sceneManager = null;
        this.trackMaterialProvider = null;
        this.colorRampMaterialProvider = null;
        this.guiManager = null;

        // Services
        this.liveContactMapService = null;
        this.liveDistanceMapService = null;
        this.scaleBarService = null;
        this.referenceRuler = null;
        this.sceneFixtures = null;
        this.ensembleIngestionController = null;
        this.sessionService = null;
        this.sessionBootstrapper = null;

        // Panels
        this.juiceboxPanel = null;
        this.igvPanel = null;

        // Navigation and selection
        this.traceSelector = null;
        this.genomicNavigator = null;

        // Three.js core objects
        this.renderer = null;
        this.cameraLightingRig = null;
        this.camera = null;
        this.scene = null;
        this.picker = null;
        // Observers
        this.renderContainerResizeObserver = null;

        // Configuration
        this.googleEnabled = false;

        // Initializers
        this.threeJSInitializer = null;
        this.uiBootstrapper = null;
        this.panelInitializer = null;
    }

    async initialize() {
        showGlobalSpinner();

        // Initialize core managers
        await this.initializeCoreManagers();

        // Initialize Three.js scene, camera, and renderer
        const container = document.getElementById('spacewalk-threejs-canvas-container')
        this.threeJSInitializer = new ThreeJSInitializer(container);
        const threeJSObjects = this.threeJSInitializer.initialize({
            colorRampMaterialProvider: this.colorRampMaterialProvider,
            ensembleManager: this.ensembleManager
        });
        this.assignThreeJSObjects(threeJSObjects);

        // Enable drag-and-drop of .sw files onto the 3D viewer
        this.initializeDragAndDrop(container);

        // Initialize UI components
        this.uiBootstrapper = new UIBootstrapper(this);
        const uiComponents = await this.uiBootstrapper.initialize(document.getElementById('spacewalk-root-container'));
        this.assignUIComponents(uiComponents);

        // Initialize track widgets (needs to be done after UI but before panels)
        this.uiBootstrapper.initializeTrackWidgets();

        // Initialize panels and their services
        this.panelInitializer = new PanelInitializer(this);
        const panelObjects = await this.panelInitializer.initialize(document.getElementById('spacewalk-root-container'));
        this.assignPanelObjects(panelObjects);

        // Configure resize observer and fullscreen mode
        const traceContainer = document.getElementById('spacewalk-threejs-trace-navigator-container');
        this.renderContainerResizeObserver = this.uiBootstrapper.initializeResizeObserver(traceContainer, threeJSObjects);
        this.uiBootstrapper.initializeFullscreenMode(traceContainer);

        // Load session from URL parameters if present
        await this.sessionBootstrapper.run(window.location.href);

        hideGlobalSpinner();

        // Signal readiness to opener (e.g., swtool) and listen for incoming files
        this.initializePostMessageListener();

        // Start the render loop
        this.startRenderLoop();
    }

    async initializeCoreManagers() {
        this.ensembleManager = new EnsembleManager();

        this.trackMaterialProvider = new TrackMaterialProvider(appleCrayonColorRGB255('snow'), appleCrayonColorRGB255('blueberry'), this.ensembleManager);

        this.colorMapManager = new ColorMapManager();
        await this.colorMapManager.configure();

        this.colorRampMaterialProvider = new ColorRampMaterialProvider(defaultColormapName, this.colorMapManager);
    }

    assignThreeJSObjects(threeJSObjects) {
        this.sceneManager = threeJSObjects.sceneManager;
        this.picker = threeJSObjects.picker;
        this.renderer = threeJSObjects.renderer;
        this.cameraLightingRig = threeJSObjects.cameraLightingRig;
        this.camera = threeJSObjects.camera;
        this.scene = threeJSObjects.scene;
        this.sceneFixtures = threeJSObjects.sceneFixtures;
    }

    assignUIComponents(uiComponents) {
        this.guiManager = uiComponents.guiManager;
        this.traceSelector = uiComponents.traceSelector;
        this.genomicNavigator = uiComponents.genomicNavigator;
    }

    /**
     * Panel assignment hook called during panel initialization so dependent
     * services (e.g. live map services) can resolve panels via appContext
     * before assignPanelObjects runs.
     */
    populatePanelVariable(name, value) {
        this[name] = value;
    }

    assignPanelObjects(panelObjects) {
        // Panels were already assigned via populatePanelVariable
        this.liveContactMapService = panelObjects.liveContactMapService;
        this.liveDistanceMapService = panelObjects.liveDistanceMapService;

        // Wire deferred dependencies now that panels and navigator exist.
        this.sceneManager.wireDependencies({
            igvPanel: this.igvPanel,
        });

        this.sceneManager.createHighlighters({
            ensembleManager: this.ensembleManager,
            igvPanel: this.igvPanel,
            genomicNavigator: this.genomicNavigator,
        });

        this.picker.wireDependencies({
            sceneManager: this.sceneManager,
            genomicNavigator: this.genomicNavigator,
        });

        this.genomicNavigator.wireDependencies({
            igvPanel: this.igvPanel,
        });

        this.cameraLightingRig.wireDependencies({
            sceneFixtures: this.sceneFixtures,
        });

        this.ensembleManager.wireDependencies({
            igvPanel: this.igvPanel,
        });

        this.ensembleIngestionController = new EnsembleIngestionController({
            ensembleManager: this.ensembleManager,
            sceneManager: this.sceneManager,
            igvPanel: this.igvPanel,
            colorRampMaterialProvider: this.colorRampMaterialProvider,
            genomicNavigator: this.genomicNavigator,
            trackMaterialProvider: this.trackMaterialProvider,
        });

        this.sessionService = new SessionService({
            ensembleManager: this.ensembleManager,
            sceneManager: this.sceneManager,
            igvPanel: this.igvPanel,
            juiceboxPanel: this.juiceboxPanel,
            trackMaterialProvider: this.trackMaterialProvider,
            cameraLightingRig: this.cameraLightingRig,
            ensembleIngestionController: this.ensembleIngestionController,
        });

        this.sessionBootstrapper = new SessionBootstrapper({
            ensembleIngestionController: this.ensembleIngestionController,
            sessionService: this.sessionService,
        });
    }

    initializePostMessageListener() {
        if (window.opener) {
            window.opener.postMessage({ type: 'spacewalk-ready' }, '*');
        }

        window.addEventListener('message', async (event) => {
            const { data } = event;
            if (data?.type !== 'spacewalk-load') return;

            const { bytes, filename } = data;
            if (!(bytes instanceof Uint8Array) || typeof filename !== 'string') {
                console.warn('spacewalk-load: invalid payload, expected { bytes: Uint8Array, filename: string }');
                return;
            }

            const file = new File([bytes], filename);
            try {
                await this.ensembleIngestionController.ingestEnsemblePath(file, '0', undefined);
            } catch (error) {
                console.error('Failed to load file from postMessage:', error)
                hideGlobalSpinner()
            }
        });
    }

    initializeDragAndDrop(container) {

        container.addEventListener('dragover', (e) => {
            e.preventDefault()
            e.dataTransfer.dropEffect = 'copy'
            container.classList.add('sw-drag-over')
        })

        container.addEventListener('dragleave', (e) => {
            e.preventDefault()
            container.classList.remove('sw-drag-over')
        })

        container.addEventListener('drop', async (e) => {
            e.preventDefault()
            container.classList.remove('sw-drag-over')

            const file = e.dataTransfer.files[0]
            if (!file) return

            const extension = file.name.split('.').pop().toLowerCase()
            if (extension !== 'sw') {
                console.warn(`Drag-and-drop: unsupported file type ".${extension}", expected ".sw"`)
                return
            }

            try {
                await this.ensembleIngestionController.ingestEnsemblePath(file, '0', undefined)
            } catch (error) {
                console.error('Failed to load dropped file:', error)
                hideGlobalSpinner()
            }
        })
    }

    render() {
        if (this.sceneManager.isGood2Go()) {
            this.sceneManager.renderLoopHelper();
            this.genomicNavigator.renderLoopHelper();
            this.cameraLightingRig.renderLoopHelper();
            this.sceneFixtures.getGroundPlane().renderLoopHelper();
            this.sceneFixtures.getGnomon().renderLoopHelper();

            // Get mouse coordinates from ThreeJS initializer
            const { x, y } = this.threeJSInitializer.getMouseCoordinates();
            this.picker.intersect({ x, y, scene: this.scene, camera: this.camera });

            this.renderer.render(this.scene, this.camera);

            const convexHull = this.sceneManager.getConvexHull();

            // Project the hull once and hand the same bounds to both widgets
            if (convexHull && (this.scaleBarService.visible || this.referenceRuler.visible)) {
                const bounds = calculateProjectedBounds(convexHull.mesh, this.camera, this.renderer.domElement.parentElement);
                this.scaleBarService.render(bounds);
                this.referenceRuler.render(nmPerPixel(bounds));
            }
        }
    }

    assignScaleBarService(service) {
        this.scaleBarService = service
    }

    assignReferenceRuler(referenceRuler) {
        this.referenceRuler = referenceRuler
    }

    startRenderLoop() {
        const renderLoop = () => {
            requestAnimationFrame(renderLoop);
            this.render();
        };
        renderLoop();
    }
}

export default App
