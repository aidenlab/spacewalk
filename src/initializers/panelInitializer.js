import Panel, { doInspectPanelVisibilityCheckbox } from "../panel.js"
import IGVPanel from "../IGVPanel.js"
import JuiceboxPanel from "../juicebox/juiceboxPanel.js"
import LiveContactMapService from "../juicebox/liveContactMapService.js"
import LiveDistanceMapService from "../juicebox/liveDistanceMapService.js"
import configureContactMapLoaders from '../widgets/contactMapLoad.js'

/**
 * Attaches the companion panels (IGV, Juicebox) and their services to an
 * assembled 3D viewer (see viewer.js). IGV drives the viewer's signal port;
 * the live maps read the ensemble out through the matrix port.
 */
class PanelInitializer {
    constructor(appContext) {
        this.appContext = appContext;
    }

    /**
     * Initialize all panels and related services
     * @param {HTMLElement} container - Root container element
     * @param {Viewer} viewer - the assembled 3D viewer the panels attach to
     * @returns {Object} Object containing initialized panels and services
     */
    async initialize(container, viewer) {
        const { colorRampMaterialProvider, trackMaterialProvider, ensembleManager, genomicNavigator, sceneManager } = viewer;
        const panelObjects = {};

        // Initialize IGV Panel (mini-app)
        panelObjects.igvPanel = new IGVPanel({
            container,
            panel: document.querySelector('#spacewalk_igv_panel'),
            isHidden: doInspectPanelVisibilityCheckbox('spacewalk_igv_panel'),
            colorRampMaterialProvider,
            trackMaterialProvider,
            ensembleManager,
            genomicNavigator,
            sceneManager
        });
        // Populate module-level variable BEFORE initialization (event handlers may need it)
        this.appContext.populatePanelVariable('igvPanel', panelObjects.igvPanel);
        await panelObjects.igvPanel.initialize();

        // Initialize Juicebox Panel (mini-app)
        panelObjects.juiceboxPanel = new JuiceboxPanel({
            container,
            panel: document.getElementById('spacewalk_juicebox_panel'),
            isHidden: doInspectPanelVisibilityCheckbox('spacewalk_juicebox_panel'),
            ensembleManager,
            sceneManager,
            genomicNavigator
        });
        // Populate module-level variable BEFORE initialization (event handlers need it)
        this.appContext.populatePanelVariable('juiceboxPanel', panelObjects.juiceboxPanel);
        await panelObjects.juiceboxPanel.initialize(
            document.querySelector('#spacewalk_juicebox_root_container')
        );

        // NOW initialize live map services (these depend on panels being ready AND module-level variables populated)
        // Distance service first — contact service receives it as a dependency.
        panelObjects.liveDistanceMapService = new LiveDistanceMapService({
            liveMapView: panelObjects.juiceboxPanel.liveMapView
        });
        panelObjects.liveContactMapService = new LiveContactMapService({
            ensembleManager,
            igvPanel: panelObjects.igvPanel,
            liveMapView: panelObjects.juiceboxPanel.liveMapView,
            getJuiceboxBrowser: () => panelObjects.juiceboxPanel.browser,
            liveDistanceMapService: panelObjects.liveDistanceMapService
        });

        // Late-wire: juiceboxPanel needs liveContactMapService for live-tab repaints
        // and Juicebox color-swatch change callbacks.
        panelObjects.juiceboxPanel.wireDependencies({
            liveContactMapService: panelObjects.liveContactMapService
        });

        // Configure contact map loaders
        this.configureContactMapLoaders(panelObjects.juiceboxPanel);

        // Set up panel dictionary for inter-panel communication
        Panel.setPanelDictionary([panelObjects.igvPanel, panelObjects.juiceboxPanel]);

        return panelObjects;
    }

    configureContactMapLoaders(juiceboxPanel) {
        const contactMapLoadConfig = {
            rootContainer: document.getElementById('spacewalk-main'),
            localFileInput: document.querySelector('input[name="contact-map"]'),
            urlLoadModalId: 'hic-load-url-modal',
            dataModalId: 'hic-contact-map-modal',
            encodeHostedModalId: 'hic-encode-hosted-contact-map-modal',
            dropboxButton: document.getElementById('hic-contact-map-dropdown-dropbox-button'),
            mapMenu: JuiceboxPanel.defaultConfig.contactMapMenu,
            loadHandler: (path, name, mapType) => juiceboxPanel.loadHicFile(path)
        };

        configureContactMapLoaders(contactMapLoadConfig);
    }
}

export default PanelInitializer;

