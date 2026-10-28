import { igvxhr } from 'igv-utils'
import { fetchJSON } from '../net/remoteResource.js'
import { createSessionWidgets } from '../widgets/sessionWidgets.js'
import { createTrackWidgetsWithTrackRegistry } from '../widgets/trackWidgets.js'
import { createSpacewalkFileLoaders } from '../spacewalkFileLoadWidgetServices.js'
import { createShareWidgets, shareWidgetConfigurator } from '../share/shareWidgets.js'
import { configureDrag } from "../utils/draggable.js"
import Panel from "../panel.js"
import { showRelease } from "../utils/release.js"
import { spacewalkConfig } from "../spacewalk-config.js"
import { presentResourceError } from "../widgets/presentResourceError.js"

/**
 * Bootstraps the app chrome around the 3D viewer: navbar, hand loading,
 * sessions, sharing, track menus. The viewer's own widgets are assembled in viewer.js.
 */
class UIBootstrapper {
    constructor(appContext) {
        this.appContext = appContext;
    }

    /**
     * Initialize the app chrome
     * @param {HTMLElement} container - Root container element
     */
    async initialize(container) {
        // Display release information
        await this.initializeReleaseInfo();

        // Initialize popovers
        this.initializePopovers();

        // Initialize file loaders
        this.initializeFileLoaders();

        // Initialize session widgets
        this.initializeSessionWidgets();

        // View menu: show/hide the companion panels
        this.initializePanelToggles();

        // Initialize drag functionality
        this.initializeDragControls(container);

        // Initialize share widgets
        createShareWidgets(
            shareWidgetConfigurator(spacewalkConfig.urlShortener),
            () => this.appContext.sessionService
        );

        // Show navbar
        document.querySelector('.navbar').style.display = '';
    }

    async initializeReleaseInfo() {
        try {
            const releaseData = await showRelease();
            if (releaseData && releaseData.tag_name) {
                const tag_name = releaseData.tag_name;
                const releaseElement = document.getElementById('spacewalk-help-menu-release');
                if (releaseElement) {
                    releaseElement.innerHTML = `Spacewalk release ${tag_name}`;
                }
                console.log(`Spacewalk release ${tag_name}`);
            }
        } catch (error) {
            console.error('Error initializing release info:', error);
        }
    }

    initializePopovers() {
        // About button popover
        const aboutConfig = {
            trigger: 'focus',
            content: document.getElementById('spacewalk-about-button-content').innerHTML,
            html: true,
            template: '<div class="popover spacewalk-popover-about" role="tooltip"><div class="arrow"></div><h3 class="popover-header"></h3><div class="popover-body"></div></div>'
        };
        const aboutButton = document.getElementById('spacewalk-about-button');
        new bootstrap.Popover(aboutButton, aboutConfig);

        // Help button popover
        const helpConfig = {
            trigger: 'focus',
            content: document.getElementById('spacewalk-help-button-content').innerHTML,
            html: true,
            template: '<div class="popover spacewalk-popover-help" role="tooltip"><div class="arrow"></div><h3 class="popover-header"></h3><div class="popover-body"></div></div>'
        };
        const helpButton = document.getElementById('spacewalk-help-button');
        new bootstrap.Popover(helpButton, helpConfig);
    }

    initializeFileLoaders() {
        const fileLoader = {
            load: async fileOrPath => {
                try {
                    await this.appContext.ensembleIngestionController.ingestEnsemblePath(fileOrPath, '0', undefined);
                } catch (error) {
                    const url = typeof fileOrPath === 'string' ? fileOrPath : undefined
                    const what = typeof fileOrPath === 'string'
                        ? fileOrPath.split('/').pop().split('?')[0]
                        : fileOrPath.name
                    presentResourceError(error, { what, url })
                }
            }
        };

        const spacewalkFileLoadConfig = {
            rootContainer: document.getElementById('spacewalk-main'),
            localFileInput: document.getElementById('spacewalk-sw-load-local-input'),
            urlLoadModalId: 'spacewalk-sw-load-url-modal',
            traceModalId: 'spacewalk-sw-load-select-modal',
            ensembleGroupModalId: 'spacewalk-ensemble-group-select-modal',
            dropboxButton: document.getElementById('spacewalk-sw-dropbox-button'),
            fileLoader,
            getEnsembleIngestionController: () => this.appContext.ensembleIngestionController
        };

        createSpacewalkFileLoaders(spacewalkFileLoadConfig);
    }

    initializeSessionWidgets() {
        const initializeDropbox = () => true;

        createSessionWidgets(
            document.getElementById('spacewalk-main'),
            'spacewalk',
            'igv-main-dropdown-local-session-file-input',
            initializeDropbox,
            'igv-main-dropdown-dropbox-session-file-button',
            'spacewalk-session-url-modal',
            'spacewalk-session-save-modal',
            async config => {
                const urlOrFile = config.url || config.file;
                try {
                    // A pasted/launch URL goes through the remote-resource boundary
                    // (classified errors, Dropbox masquerade); a local File still
                    // reads via igvxhr (fetch can't read a File object).
                    const json = typeof urlOrFile === 'string'
                        ? await fetchJSON(urlOrFile)
                        : await igvxhr.loadJson(urlOrFile);
                    await this.appContext.sessionService.loadSession(json);
                } catch (e) {
                    presentResourceError(e, { what: 'the session', url: typeof urlOrFile === 'string' ? urlOrFile : undefined });
                }
            },
            () => this.appContext.sessionService.toJSON()
        );
    }

    initializePanelToggles() {
        const checkboxDropdownMenu = document.querySelector('#spacewalk-viewers-dropdown-menu')

        for (const inputElement of checkboxDropdownMenu.querySelectorAll('input')) {
            inputElement.addEventListener('change', event => {
                event.stopPropagation()
                Panel.toggleById(inputElement.dataset.target)
            })
        }
    }

    initializeDragControls(container) {
        const navbarConstraint = { topConstraint: document.querySelector('.navbar') };

        configureDrag(
            document.getElementById('spacewalk-threejs-container'),
            document.getElementById('spacewalk-threejs-drag-container'),
            container,
            navbarConstraint
        );

        configureDrag(
            document.getElementById('spacewalk_ui_manager_panel'),
            document.getElementById('spacewalk_ui_manager_panel'),
            container,
            navbarConstraint
        );
    }

    initializeFullscreenMode(traceContainer) {
        document.getElementById('spacewalk-fullscreen-button').addEventListener('click', () => {
            if (!document.fullscreenElement) {
                traceContainer.requestFullscreen().then(() => {
                    document.body.classList.add('fullscreen');
                }).catch(err => {
                    alert(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
                });
            } else {
                document.exitFullscreen().then(() => {
                    document.body.classList.remove('fullscreen');
                }).catch(err => {
                    alert(`Error attempting to exit full-screen mode: ${err.message} (${err.name})`);
                });
            }
        });

        document.addEventListener('fullscreenchange', () => {
            if (!document.fullscreenElement) {
                document.body.classList.remove('fullscreen');
            }
        });
    }

    initializeTrackWidgets() {
        const initializeDropbox = () => true;

        const trackMenuHandler = configList => {
            const idSet = new Set(
                this.appContext.igvPanel.browser.tracks
                    .filter(track => undefined !== track.id)
                    .map(track => track.id)
            );

            for (const { element, trackConfiguration } of configList) {
                const id = trackConfiguration.id === undefined ? trackConfiguration.name : trackConfiguration.id;
                if (idSet.has(id)) {
                    element.setAttribute('disabled', true);
                } else {
                    element.removeAttribute('disabled');
                }
            }
        };

        createTrackWidgetsWithTrackRegistry(
            document.getElementById('spacewalk_igv_panel'),
            document.getElementById('spacewalk-track-dropdown-menu'),
            document.getElementById('hic-local-track-file-input'),
            initializeDropbox,
            document.getElementById('spacewalk-track-dropbox-button'),
            ['spacewalk-encode-signals-chip-modal', 'spacewalk-encode-signals-other-modal', 'spacewalk-encode-others-modal'],
            'spacewalk-track-load-url-modal',
            undefined,
            undefined,
            spacewalkConfig.trackRegistry,
            (configurations) => this.appContext.igvPanel.loadTrackList(configurations),
            trackMenuHandler
        );
    }
}

export default UIBootstrapper;

