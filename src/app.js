import { SessionService } from "./sessionServices.js"
import SessionBootstrapper from "./sessionBootstrapper.js"
import { showGlobalSpinner, hideGlobalSpinner } from './utils/utils.js'
import UIBootstrapper from "./initializers/uiBootstrapper.js"
import PanelInitializer from "./initializers/panelInitializer.js"
import assembleViewer from "./viewer.js"

/**
 * The full Spacewalk app: the 3D viewer, assembled by assembleViewer(), plus
 * the app chrome (navbar, hand loading, sessions, sharing) and the companion
 * panels (IGV, Juicebox) attached to the viewer through the ports.
 * All shared state lives on the App instance and is passed to consumers
 * via constructor injection.
 */
class App {
    constructor() {

        // The 3D viewer and the parts of it the app reaches for
        this.viewer = null;
        this.ensembleManager = null;
        this.sceneManager = null;
        this.trackMaterialProvider = null;
        this.colorRampMaterialProvider = null;
        this.genomicNavigator = null;
        this.cameraLightingRig = null;
        this.ensembleIngestionController = null;

        // Services
        this.liveContactMapService = null;
        this.liveDistanceMapService = null;
        this.sessionService = null;
        this.sessionBootstrapper = null;

        // Panels
        this.juiceboxPanel = null;
        this.igvPanel = null;

        // Initializers
        this.uiBootstrapper = null;
        this.panelInitializer = null;
    }

    async initialize() {
        showGlobalSpinner();

        // The 3D viewer, whole on its own
        const canvasContainer = document.getElementById('spacewalk-threejs-canvas-container')
        const traceContainer = document.getElementById('spacewalk-threejs-trace-navigator-container');
        this.viewer = await assembleViewer({ canvasContainer, traceContainer, storage: localStorage });
        this.assignViewer(this.viewer);

        // Enable drag-and-drop of .sw files onto the 3D viewer
        this.initializeDragAndDrop(canvasContainer);

        // App chrome: navbar, hand loading, sessions, sharing
        const rootContainer = document.getElementById('spacewalk-root-container')
        this.uiBootstrapper = new UIBootstrapper(this);
        await this.uiBootstrapper.initialize(rootContainer);

        // Initialize track widgets (needs to be done after UI but before panels)
        this.uiBootstrapper.initializeTrackWidgets();

        // Attach the companion panels (IGV, Juicebox) to the viewer
        this.panelInitializer = new PanelInitializer(this);
        const panelObjects = await this.panelInitializer.initialize(rootContainer, this.viewer);
        this.assignPanelObjects(panelObjects);

        this.uiBootstrapper.initializeFullscreenMode(traceContainer);

        // Load session from URL parameters if present
        await this.sessionBootstrapper.run(window.location.href);

        hideGlobalSpinner();

        // Signal readiness to opener (e.g., swtool) and listen for incoming files
        this.initializePostMessageListener();

        this.viewer.startRenderLoop();
    }

    assignViewer(viewer) {
        this.ensembleManager = viewer.ensembleManager;
        this.sceneManager = viewer.sceneManager;
        this.trackMaterialProvider = viewer.trackMaterialProvider;
        this.colorRampMaterialProvider = viewer.colorRampMaterialProvider;
        this.genomicNavigator = viewer.genomicNavigator;
        this.cameraLightingRig = viewer.cameraLightingRig;
        this.ensembleIngestionController = viewer.ensembleIngestionController;
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
}

export default App
