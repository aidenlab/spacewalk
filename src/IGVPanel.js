import igv from 'igv'
import SpacewalkEventBus from './spacewalkEventBus.js'
import {installShim} from './igvTrackMaterialProviderShim.js';
import MaterialProviderController from './materialProviderController.js';
import {createIGVTrackEnvironment} from './igvTrackEnvironment.js';
import Panel from './panel.js';
import { getPathsWithTrackRegistry, updateTrackMenusWithTrackConfigurations } from './widgets/trackWidgets.js'
import genomes from './resources/genomes.json'
import trackRegistry from './resources/tracks/trackRegistry.json'


let resizeObserver
let resizeTimeout
const RESIZE_DEBOUNCE_DELAY = 200
class IGVPanel extends Panel {

    constructor ({ container, panel, isHidden, colorRampMaterialProvider, trackMaterialProvider, ensembleManager, genomicNavigator, sceneManager }) {

        const xFunction = (wc, wp) => {
            return (wc - wp)/2;
        };

        const yFunction = (hc, hp) => {
            return hc - (hp * 1.1);
        };

        super({ container, panel, isHidden, xFunction, yFunction })

        this.colorRampMaterialProvider = colorRampMaterialProvider;
        this.trackMaterialProvider = trackMaterialProvider;
        this.ensembleManager = ensembleManager;
        this.genomicNavigator = genomicNavigator;
        this.sceneManager = sceneManager;

        // Owns the track -> material-provider state machine (checked set, active-provider
        // switch, session state). IGV/DOM access is isolated behind the track environment
        // port; the browser is read lazily because it doesn't exist until initialize().
        this.materialController = new MaterialProviderController({
            trackProvider: trackMaterialProvider,
            colorRampProvider: colorRampMaterialProvider,
            env: createIGVTrackEnvironment(() => this.browser),
            onActiveProviderChanged: provider => {
                this.materialProvider = provider;
                this.sceneManager.updateMaterialProvider(provider);
                this.genomicNavigator.repaint();
            }
        });

        // const dragHandle = panel.querySelector('.spacewalk_card_drag_container')
        // makeDraggable(panel, dragHandle)

        this.panel.addEventListener('mouseenter', (event) => {
            event.stopPropagation();
            SpacewalkEventBus.globalBus.post({ type: 'DidEnterGenomicNavigator', data: 'DidEnterGenomicNavigator' });
        });

        this.panel.addEventListener('mouseleave', (event) => {
            event.stopPropagation();
            this.genomicNavigator.repaint()
            SpacewalkEventBus.globalBus.post({ type: 'DidLeaveGenomicNavigator', data: 'DidLeaveGenomicNavigator' });
        });
    }

    async initialize(igvConfig = IGVPanel.defaultConfig) {

        igvConfig = { ...igvConfig }

        igvConfig.listeners = {

            'genomechange': async ({genome, trackConfigurations}) => {

                let configs = await getPathsWithTrackRegistry(genome.id, trackRegistry)

                if (undefined === configs) {
                    configs = trackConfigurations
                }

                if (configs) {
                    await updateTrackMenusWithTrackConfigurations(genome.id, undefined, configs, document.getElementById('spacewalk-track-dropdown-menu'))
                }
            }
        }

        this.browser = undefined

        const root = this.panel.querySelector('#spacewalk_igv_root_container')

        if (undefined === igvConfig.genomeList) {
            igvConfig.genomeList = [ ...IGVPanel.defaultConfig.genomeList ]
        }
        try {
            const result = await igv.createBrowser( root, igvConfig )
            this.browser = result.browser ?? result
            this.knownGenomes = Object.fromEntries((igvConfig.genomeList || []).map(g => [g.id, g]))
        } catch (e) {
            console.error(e.message)
            alert(e.message)
        }

        if (this.browser) {
            // Ensure cursor guide callback fires: spacewalk branch removed the doShowCursorGuide
            // guard from rulerViewport.mouseMove so customMouseHandler always receives position.
            // Master wraps that logic in if(doShowCursorGuide); without this, callback never fires.
            this.browser.doShowCursorGuide = true
            this.configureMouseHandlers()
            installShim(this.browser, this)
        }

        resizeObserver = new ResizeObserver(entries => {

            for (let entry of entries) {
                const DOMElement = entry.target;

                // Updated panel dimensions
                const { width, height } = entry.contentRect;

                if (resizeTimeout) {
                    clearTimeout(resizeTimeout)
                }

                // Set a new timeout to execute code after resizing has "stopped"
                resizeTimeout = setTimeout(() => {

                    const container = DOMElement.querySelector('#spacewalk_igv_container')

                    if (container) {
                        container.style.width = `${width}px`;
                        container.style.height = `${height}px`;

                        if (this.ensembleManager.locus) {
                            console.log(`Panel resized to width: ${width}, height: ${height}`)
                            const { chr, genomicStart, genomicEnd } = this.ensembleManager.locus
                            this.browser.search(`${ chr }:${ genomicStart }-${ genomicEnd }`)
                        }

                    } // if (container)

                }, RESIZE_DEBOUNCE_DELAY);

            }
        })

        resizeObserver.observe(this.panel)

    }

    getClassName(){ return 'IGVPanel' }

    receiveEvent({ type, data }) {
        super.receiveEvent({ type, data });
    }

    async locusDidChange({ chr, genomicStart, genomicEnd }) {
        try {
            if ('all' === chr) {
                await this.browser.search(chr)
            } else {
                await this.browser.search(`${ chr }:${ genomicStart }-${ genomicEnd }`)
            }

        } catch (e) {
            console.error(e.message)
            alert(e.message)
        }

    }

    configureMouseHandlers () {

        // Re-apply cursor guide after IGV rebuilds (loadSession, etc.). Same pattern as track
        // material provider re-injection: IGV's DOM lifecycle can affect visibility/state.
        this.browser.doShowCursorGuide = true
        this.browser.setCursorGuideVisibility(true)

        installShim(this.browser, this)

        this.browser.on('trackremoved', track => {
            this.materialController.removeTrack(track);
        });

        this.browser.setCustomCursorGuideMouseHandler(({ bp, start, end, interpolant }) => {

            if (undefined === this.ensembleManager || undefined === this.ensembleManager.locus) {
                return
            }

            const { genomicStart, genomicEnd } = this.ensembleManager.locus

            const xRejection = start > genomicEnd || end < genomicStart || bp < genomicStart || bp > genomicEnd;

            if (xRejection) {
                return;
            }

            this.sceneManager.delegateGenomicInterpolant({ interpolantList: [ interpolant ] })
            this.genomicNavigator.highlightFromInterpolant([ interpolant ])

        })

    }

    // Track -> material-provider state machine lives in MaterialProviderController.
    // These delegators keep the panel's public surface (and its callers) stable.

    setTrackChecked(track, checked) {
        return this.materialController.setTrackChecked(track, checked);
    }

    clearMaterialProviderSessionState() {
        this.materialController.clear();
    }

    async loadTrackList(configurations) {

        let tracks = [];
        try {
            this.present()
            tracks = await this.browser.loadTrackList( configurations );
        } catch (e) {
            console.error(e.message)
            alert(e.message)
        }

        for (let { trackView, config } of tracks) {
            trackView.setTrackLabelName(trackView, config.name);
        }

    }

    getSessionState() {
        return this.materialController.serialize();
    }

    async restoreSessionState(state) {
        return this.materialController.restore(state);
    }
}

IGVPanel.defaultConfig = {
    genome: 'hg19',
    locus: 'all',
    genomeList: genomes,
    showTrackLabels: true,
    showControls: false,
    showCursorGuide: true,
    queryParametersSupported: false,
    tracks: []
}

export default IGVPanel
