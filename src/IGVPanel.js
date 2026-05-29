import igv from 'igv'
import SpacewalkEventBus from './spacewalkEventBus.js'
import {installShim} from './igvTrackMaterialProviderShim.js';
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

        /** Map of trackId (name|index) -> true for material provider checkbox state. Single source of truth. */
        this.materialProviderCheckedTracks = new Map();

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
            const id = this.getUniqueTrackId(track);
            const wasChecked = id.endsWith('|-1') ? (track.embeddingCheckboxChecked || track.trackView?.materialProviderInput?.checked) : this.materialProviderCheckedTracks.has(id);
            if (!id.endsWith('|-1')) {
                this.materialProviderCheckedTracks.delete(id);
            }
            if (wasChecked) {
                this.removeTrackFromMaterialProvider(track);
            }
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

    async activateTrackMaterialProvider(track) {
        // Check if track can be used (zoom level check)
        if (!this.canUseTrackForMaterial(track)) {
            console.warn(`Track ${track.name} zoom level too low. Cannot add to material provider.`);
            track.embeddingCheckboxChecked = false;
            if (track.trackView?.materialProviderInput) {
                track.trackView.materialProviderInput.checked = false;
            }
            return;
        }

        // Add this track to the material provider
        await this.trackMaterialProvider.configure(track);

        // Switch to track material provider if not already using it
        if (this.materialProvider !== this.trackMaterialProvider) {
            this.materialProvider = this.trackMaterialProvider;
        }

        this.sceneManager.updateMaterialProvider(this.trackMaterialProvider);
        this.genomicNavigator.repaint();
        console.log(`Active tracks: ${this.trackMaterialProvider.getTrackNames().join(', ')}`);
    }

    async deactivateTrackMaterialProvider(track) {
        // Remove this track from the material provider
        this.removeTrackFromMaterialProvider(track);
    }

    removeTrackFromMaterialProvider(track) {
        this.trackMaterialProvider.removeTrackInstance(track);

        // If no tracks remain, switch back to color ramp provider
        if (this.trackMaterialProvider.getTrackNames().length === 0) {
            this.materialProvider = this.colorRampMaterialProvider;
            this.sceneManager.updateMaterialProvider(this.colorRampMaterialProvider);
            this.genomicNavigator.repaint();
            console.log('No active tracks. Switched to color ramp provider.');
        } else {
            // Tracks remain - ensure we're using trackMaterialProvider and trigger repaint
            this.materialProvider = this.trackMaterialProvider;
            this.sceneManager.updateMaterialProvider(this.trackMaterialProvider);
            this.genomicNavigator.repaint();
            console.log(`Active tracks: ${this.trackMaterialProvider.getTrackNames().join(', ')}`);
        }
    }

    canUseTrackForMaterial(track) {
        const viewport = track.trackView?.viewports?.[0];
        if (!viewport) return false;
        if (typeof viewport.checkZoomIn === 'function') {
            return viewport.checkZoomIn();
        }
        const zoomInNotice = viewport.$zoomInNotice?.get?.(0);
        return !(zoomInNotice && zoomInNotice.style.display !== 'none');
    }

    getUniqueTrackId(track) {
        const idx = this.browser.trackViews.findIndex(tv => tv.track === track);
        return `${track.name}|${idx}`;
    }

    setMaterialProviderTrackChecked(track, checked) {
        const id = this.getUniqueTrackId(track);
        if (id.endsWith('|-1')) return;
        if (checked) {
            this.materialProviderCheckedTracks.set(id, true);
        } else {
            this.materialProviderCheckedTracks.delete(id);
        }
    }

    clearMaterialProviderSessionState() {
        this.materialProviderCheckedTracks.clear();
    }

    getMaterialProviderCheckedTrackIds() {
        const trackViews = this.browser?.trackViews ?? [];
        return Array.from(this.materialProviderCheckedTracks.keys()).filter(id => {
            const lastPipe = id.lastIndexOf('|');
            if (lastPipe < 0) return false;
            const name = id.slice(0, lastPipe);
            const idx = parseInt(id.slice(lastPipe + 1), 10);
            return trackViews[idx]?.track?.name === name;
        });
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
        let ids = this.getMaterialProviderCheckedTrackIds();

        if (ids.length === 0) {
            const trackViews = this.browser.trackViews ?? [];
            for (let i = 0; i < trackViews.length; i++) {
                const track = trackViews[i]?.track;
                if (track && (track.embeddingCheckboxChecked || trackViews[i].materialProviderInput?.checked)) {
                    this.materialProviderCheckedTracks.set(`${track.name}|${i}`, true);
                }
            }
            ids = this.getMaterialProviderCheckedTrackIds();
        }

        return ids.length > 0 ? ids : 'none';
    }

    async restoreSessionState(state) {
        const raw = Array.isArray(state) ? state : (state === 'none' ? [] : [state]);

        if (raw.length === 0) {
            console.log('No tracks to restore for material provider');
            return;
        }

        const isNewFormat = raw.some(s => typeof s === 'string' && s.includes('|'));
        const trackViews = this.browser.trackViews ?? [];
        let tracksToRestore;

        if (isNewFormat) {
            const idSet = new Set(raw);
            tracksToRestore = trackViews
                .map((tv, i) => ({ track: tv.track, id: `${tv.track.name}|${i}` }))
                .filter(({ track, id }) => track && idSet.has(id))
                .map(({ track }) => track);
        } else {
            const namesToRestore = new Set(raw);
            const restored = new Set();
            tracksToRestore = [];
            for (const tv of trackViews) {
                const track = tv.track;
                if (!track || !namesToRestore.has(track.name)) continue;
                if (restored.has(track.name)) continue;
                restored.add(track.name);
                tracksToRestore.push(track);
            }
        }

        if (tracksToRestore.length === 0) {
            console.warn('No matching tracks found for restoration');
            return;
        }

        console.log(`Restoring ${tracksToRestore.length} tracks`);

        for (const track of tracksToRestore) {
            if (typeof track.trackView?.isLoading === 'function' && track.trackView.isLoading()) {
                console.warn(`Track ${track.name} is still loading. Skipping.`);
                continue;
            }

            track.embeddingCheckboxChecked = true;
            if (track.trackView?.materialProviderInput) {
                track.trackView.materialProviderInput.checked = true;
            }
            this.setMaterialProviderTrackChecked(track, true);
            await this.activateTrackMaterialProvider(track);
        }

        if (tracksToRestore.length > 0) {
            this.materialProvider = this.trackMaterialProvider;
            this.sceneManager.updateMaterialProvider(this.trackMaterialProvider);
            this.genomicNavigator.repaint();
        }

        console.log(`Successfully restored ${tracksToRestore.length} tracks`);
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
