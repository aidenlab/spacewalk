import igv from 'igv'
import {installShim} from './igvTrackMaterialProviderShim.js';
import IGVCursorGuide from './igvCursorGuide.js';
import MaterialProviderController from './materialProviderController.js';
import {createIGVTrackEnvironment} from './igvTrackEnvironment.js';
import Panel from './panel.js';
import SpacewalkEventBus from './spacewalkEventBus.js';
import { unsetDataMaterialProviderCheckbox } from './utils/utils.js';
import { presentResourceError } from './widgets/presentResourceError.js';
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
            // IGV doesn't own the current material provider — it plugs the
            // active one into the viewer through the signal port.
            onActiveProviderChanged: provider => {
                this.sceneManager.setMaterialProvider(provider);
                this.genomicNavigator.repaint();
            }
        });

        // IGV follows ensemble loads (full load and group switch) as a listener;
        // ingestion has no knowledge of IGV. See followEnsemble().
        this.ensembleFollow = Promise.resolve();
        SpacewalkEventBus.globalBus.subscribe('DidLoadEnsembleFile', this);

        // const dragHandle = panel.querySelector('.spacewalk_card_drag_container')
        // makeDraggable(panel, dragHandle)

        // The IGV cursor guide (igvCursorGuide) is the producer and self-clears on
        // its own column mouseleave; the panel only needs to refresh the ramp.
        this.panel.addEventListener('mouseleave', (event) => {
            event.stopPropagation();
            this.genomicNavigator.repaint()
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

        if ('DidLoadEnsembleFile' === type) {
            this.ensembleFollow = this.followEnsemble(data);
        }
    }

    // Bring IGV in line with a freshly loaded ensemble. The bus doesn't await
    // subscribers, so the in-flight follow is kept on ensembleFollow for callers
    // that must not touch the browser until it settles (session restore calls
    // browser.loadSession, which would race loadGenome). Never rejects — a
    // failure here is IGV's to report, and the ensemble itself loaded fine.
    async followEnsemble({ genomeAssembly, chr, genomicStart, genomicEnd }) {

        // Synchronously, before the first await: the prior ensemble's checked
        // tracks are stale. Clear them before loadGenome removes tracks, or
        // trackremoved would re-select the (now empty) track provider and
        // repaint through it.
        unsetDataMaterialProviderCheckbox(this);

        try {
            if (genomeAssembly !== this.browser.genome.id) {
                console.log(`Genome swap from ${ this.browser.genome.id } to ${ genomeAssembly }. Call igv_browser.loadGenome`)
                await this.browser.loadGenome(genomeAssembly)
            }
        } catch (error) {
            presentResourceError(error, { what: `the ${ genomeAssembly } genome in IGV` })
            return
        }

        await this.locusDidChange({ chr, genomicStart, genomicEnd })
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

        installShim(this.browser, this)

        this.browser.on('trackremoved', track => {
            this.materialController.removeTrack(track);
        });

        // Spacewalk owns the IGV cursor guide + highlight producer (see igvCursorGuide.js),
        // rather than relying on igv's internal cursorGuide. Create once; (re-)attach producer
        // listeners each time IGV rebuilds its DOM.
        if (!this.cursorGuide) {
            this.cursorGuide = new IGVCursorGuide({
                getBrowser: () => this.browser,
                ensembleManager: this.ensembleManager,
                highlightController: this.sceneManager.highlightController
            })
        }
        this.cursorGuide.attach(this.browser.columnContainer)
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
