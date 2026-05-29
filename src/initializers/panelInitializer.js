import Panel, { doInspectPanelVisibilityCheckbox } from "../panel.js"
import IGVPanel from "../IGVPanel.js"
import JuiceboxPanel from "../juicebox/juiceboxPanel.js"
import LiveContactMapService from "../juicebox/liveContactMapService.js"
import LiveDistanceMapService from "../juicebox/liveDistanceMapService.js"
import configureContactMapLoaders from '../widgets/contactMapLoad.js'

/**
 * Initializer class responsible for setting up IGV and Juicebox panels
 * and their associated services.
 */
class PanelInitializer {
    constructor(appContext) {
        this.appContext = appContext;
    }

    /**
     * Initialize all panels and related services
     * @param {HTMLElement} container - Root container element
     * @returns {Object} Object containing initialized panels and services
     */
    async initialize(container) {
        const panelObjects = {};

        // Initialize IGV Panel (mini-app)
        panelObjects.igvPanel = new IGVPanel({
            container,
            panel: document.querySelector('#spacewalk_igv_panel'),
            isHidden: doInspectPanelVisibilityCheckbox('spacewalk_igv_panel'),
            colorRampMaterialProvider: this.appContext.colorRampMaterialProvider,
            trackMaterialProvider: this.appContext.trackMaterialProvider,
            ensembleManager: this.appContext.ensembleManager,
            genomicNavigator: this.appContext.genomicNavigator,
            sceneManager: this.appContext.sceneManager
        });
        panelObjects.igvPanel.materialProvider = this.appContext.colorRampMaterialProvider;
        // Populate module-level variable BEFORE initialization (event handlers may need it)
        this.appContext.populatePanelVariable('igvPanel', panelObjects.igvPanel);
        await panelObjects.igvPanel.initialize();

        // Initialize Juicebox Panel (mini-app)
        panelObjects.juiceboxPanel = new JuiceboxPanel({
            container,
            panel: document.getElementById('spacewalk_juicebox_panel'),
            isHidden: doInspectPanelVisibilityCheckbox('spacewalk_juicebox_panel'),
            ensembleManager: this.appContext.ensembleManager,
            sceneManager: this.appContext.sceneManager,
            genomicNavigator: this.appContext.genomicNavigator
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
            ensembleManager: this.appContext.ensembleManager,
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

