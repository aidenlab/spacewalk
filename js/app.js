import EnsembleManager from "./ensembleManager.js"
import ColorMapManager from "./utils/colorMapManager.js"
import TrackMaterialProvider from "./trackMaterialProvider.js"
import ColorRampMaterialProvider from "./colorRampMaterialProvider.js"
import { appleCrayonColorRGB255 } from "./utils/colorUtils.js"
import { getUrlParams, loadSession, uncompressSessionURL } from "./sessionServices.js"
import SpacewalkEventBus from "./spacewalkEventBus.js"
import { showGlobalSpinner, hideGlobalSpinner } from './utils/utils.js'
import { defaultColormapName } from "./utils/colorMapManager.js"
import ThreeJSInitializer from "./initializers/threeJSInitializer.js"
import UIBootstrapper from "./initializers/uiBootstrapper.js"
import PanelInitializer from "./initializers/panelInitializer.js"

// Module-level variables - the single source of truth for shared application state
// These are populated by the App class during initialization
let ensembleManager;
let sceneManager;
let trackMaterialProvider;
let colorRampMaterialProvider;
let colorMapManager;
let liveContactMapService;
let liveDistanceMapService;
let juiceboxPanel;
let igvPanel;
let genomicNavigator;
let googleEnabled = false;
let cameraLightingRig;
let camera;
let scene;

function getThreeJSContainerRect() {
    const container = document.querySelector('#spacewalk-threejs-canvas-container');
    return container.getBoundingClientRect();
}

/**
 * Main application class that orchestrates Spacewalk initialization and manages application state.
 * Populates module-level variables for backward compatibility with existing code.
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
        const threeJSObjects = this.threeJSInitializer.initialize(this.colorRampMaterialProvider);
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
        await this.consumeURLParams(getUrlParams(window.location.href));

        hideGlobalSpinner();

        // Signal readiness to opener (e.g., swtool) and listen for incoming files
        this.initializePostMessageListener();

        // Start the render loop
        this.startRenderLoop();
    }

    async initializeCoreManagers() {
        this.ensembleManager = new EnsembleManager();
        ensembleManager = this.ensembleManager;

        this.trackMaterialProvider = new TrackMaterialProvider(appleCrayonColorRGB255('snow'), appleCrayonColorRGB255('blueberry'), this.ensembleManager);
        trackMaterialProvider = this.trackMaterialProvider;

        this.colorMapManager = new ColorMapManager();
        await this.colorMapManager.configure();
        colorMapManager = this.colorMapManager;

        this.colorRampMaterialProvider = new ColorRampMaterialProvider(defaultColormapName, this.colorMapManager);
        colorRampMaterialProvider = this.colorRampMaterialProvider;
    }

    assignThreeJSObjects(threeJSObjects) {
        this.sceneManager = threeJSObjects.sceneManager;
        this.picker = threeJSObjects.picker;
        this.renderer = threeJSObjects.renderer;
        this.cameraLightingRig = threeJSObjects.cameraLightingRig;
        this.camera = threeJSObjects.camera;
        this.scene = threeJSObjects.scene;
        // Populate module-level variables
        sceneManager = this.sceneManager;
        cameraLightingRig = this.cameraLightingRig;
        camera = this.camera;
        scene = this.scene;
    }

    assignUIComponents(uiComponents) {
        this.guiManager = uiComponents.guiManager;
        this.traceSelector = uiComponents.traceSelector;
        this.genomicNavigator = uiComponents.genomicNavigator;

        // Populate module-level variables
        genomicNavigator = this.genomicNavigator;
    }

    /**
     * Early population of panel variables (called during panel initialization for timing)
     */
    populatePanelVariable(name, value) {
        this[name] = value;
        // Populate module-level variable immediately
        if (name === 'igvPanel') {
            igvPanel = value;
        } else if (name === 'juiceboxPanel') {
            juiceboxPanel = value;
        }
    }

    assignPanelObjects(panelObjects) {
        // Panels were already assigned via populatePanelVariable
        this.liveContactMapService = panelObjects.liveContactMapService;
        this.liveDistanceMapService = panelObjects.liveDistanceMapService;

        // Populate module-level variables
        liveContactMapService = this.liveContactMapService;
        liveDistanceMapService = this.liveDistanceMapService;
    }

    async consumeURLParams(params) {
        // Mode 1: Direct file URL (e.g., ?file=https://example.com/data.sw)
        if (params.file) {
            const fileURL = extractFileParam(window.location.href);
            const traceKey = params.traceKey || '0';
            const ensembleGroupKey = params.ensembleGroupKey || undefined;
            try {
                await this.sceneManager.ingestEnsemblePath(fileURL, traceKey, ensembleGroupKey);
                const data = ensembleManager.createEventBusPayload();
                SpacewalkEventBus.globalBus.post({ type: "DidLoadEnsembleFile", data });
            } catch (error) {
                console.error('Failed to load file from URL params:', error)
                hideGlobalSpinner()
            }
            return;
        }

        // Mode 2: Compressed share session (existing logic)
        const { sessionURL: igvSessionURL, session: juiceboxSessionURL, spacewalkSessionURL } = params;

        let acc = {};

    // spacewalk
    if (spacewalkSessionURL) {
            const spacewalk = JSON.parse(uncompressSessionURL(spacewalkSessionURL));
            acc = { ...acc, spacewalk };
    }

    // juicebox
    if (juiceboxSessionURL) {
            const juicebox = JSON.parse(uncompressSessionURL(juiceboxSessionURL));
            acc = { ...acc, juicebox };
    }

    // igv
    if (igvSessionURL) {
            const igv = JSON.parse(uncompressSessionURL(igvSessionURL));
            acc = { ...acc, igv };
    }

        const result = 0 === Object.keys(acc).length ? undefined : acc;

    if (result) {
            await loadSession(result);
        }
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
                await this.sceneManager.ingestEnsemblePath(file, '0', undefined);
                const payload = ensembleManager.createEventBusPayload();
                SpacewalkEventBus.globalBus.post({ type: "DidLoadEnsembleFile", data: payload });
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
                await this.sceneManager.ingestEnsemblePath(file, '0', undefined)
                const payload = ensembleManager.createEventBusPayload()
                SpacewalkEventBus.globalBus.post({ type: "DidLoadEnsembleFile", data: payload })
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
            this.sceneManager.getGroundPlane().renderLoopHelper();
            this.sceneManager.getGnomon().renderLoopHelper();

            // Get mouse coordinates from ThreeJS initializer
            const { x, y } = this.threeJSInitializer.getMouseCoordinates();
            this.picker.intersect({ x, y, scene: this.scene, camera: this.camera });

            this.renderer.render(this.scene, this.camera);

            const convexHull = this.sceneManager.getConvexHull();

        if (convexHull) {
                this.sceneManager.getScaleBarService().scaleBarAnimationLoopHelper(convexHull.mesh, this.camera);
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

// Extract the file URL from the raw query string, preserving its own query parameters.
// The file URL may contain '&' characters (e.g., Dropbox links with rlkey, st, dl params)
// that would otherwise be split apart by standard query string parsing.
const spacewalkParams = new Set(['traceKey', 'ensembleGroupKey']);

function extractFileParam(href) {
    const queryString = decodeURIComponent(href.slice(href.indexOf('?') + 1));
    const fileIndex = queryString.indexOf('file=');
    if (fileIndex === -1) return undefined;

    const valueStart = fileIndex + 'file='.length;
    const rest = queryString.slice(valueStart);

    // Scan for '&key=' where key is a known Spacewalk parameter
    let endIndex = rest.length;
    for (const param of spacewalkParams) {
        const marker = `&${param}=`;
        const idx = rest.indexOf(marker);
        if (idx !== -1 && idx < endIndex) {
            endIndex = idx;
        }
    }

    return rest.slice(0, endIndex);
}

export default App

export {
    getThreeJSContainerRect,
    scene,
    camera,
    cameraLightingRig,
    googleEnabled,
    ensembleManager,
    sceneManager,
    colorRampMaterialProvider,
    colorMapManager,
    trackMaterialProvider,
    juiceboxPanel,
    liveContactMapService,
    liveDistanceMapService,
    igvPanel,
    genomicNavigator,
}
