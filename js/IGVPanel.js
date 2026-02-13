import igv from 'igv'
import SpacewalkEventBus from './spacewalkEventBus.js'
import {setMaterialProvider} from './utils/utils.js';
import {installShim} from './igvTrackMaterialProviderShim.js';
import Panel from './panel.js';
import { getPathsWithTrackRegistry, updateTrackMenusWithTrackConfigurations } from './widgets/trackWidgets.js'
import { spacewalkConfig } from "../spacewalk-config.js";

/** Fallback when IGV master does not return knownGenomes from createBrowser. Used for genome validation in datasources. */
const KNOWN_GENOMES_FALLBACK = Object.fromEntries([
    'ce10', 'ce11', 'dm3', 'dm6', 'GRCh38', 'hg19', 'mm9', 'mm10', 'hg38', 'GRCh37', 'mm39', 'sacCer3', 'Loxafr3.0_HiC'
].map(id => [id, true]))

let resizeObserver
let resizeTimeout
const RESIZE_DEBOUNCE_DELAY = 200
class IGVPanel extends Panel {

    constructor ({ container, panel, isHidden, colorRampMaterialProvider, trackMaterialProvider, ensembleManager, genomicNavigator }) {

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

        // const dragHandle = panel.querySelector('.spacewalk_card_drag_container')
        // makeDraggable(panel, dragHandle)

        this.panel.addEventListener('mouseenter', (event) => {
            event.stopPropagation();
            SpacewalkEventBus.globalBus.post({ type: 'DidEnterGenomicNavigator', data: 'DidEnterGenomicNavigator' });
        });

        this.panel.addEventListener('mouseleave', (event) => {
            event.stopPropagation();
            SpacewalkEventBus.globalBus.post({ type: 'DidLeaveGenomicNavigator', data: 'DidLeaveGenomicNavigator' });
        });

        SpacewalkEventBus.globalBus.subscribe("DidUpdateGenomicInterpolant", this)
    }

    async initialize(igvConfig) {

        igvConfig.listeners = {

            'genomechange': async ({genome, trackConfigurations}) => {

                let configs = await getPathsWithTrackRegistry(genome.id, spacewalkConfig.trackRegistry)

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
            igvConfig.genomeList = [ ...spacewalkConfig.igvConfig.genomeList ]
        }
        try {
            const result = await igv.createBrowser( root, igvConfig )
            this.browser = result.browser ?? result
            this.knownGenomes = result.knownGenomes ?? KNOWN_GENOMES_FALLBACK
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

        if ("DidUpdateGenomicInterpolant" === type) {
            const { poster, interpolantList } = data
            if (poster === this.genomicNavigator && interpolantList) {
                const update = this.browser.cursorGuide?.updateWithInterpolant
                if (typeof update === 'function') {
                    update.call(this.browser.cursorGuide, interpolantList[ 0 ])
                }
            }
        }

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
            if (track.embeddingCheckboxChecked || track.trackView?.materialProviderInput?.checked) {
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

            SpacewalkEventBus.globalBus.post({ type: 'DidUpdateGenomicInterpolant', data: { poster: this, interpolantList: [ interpolant ] } });

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

        // Always call setMaterialProvider to trigger repaint with updated colors
        setMaterialProvider(this.trackMaterialProvider);
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
            setMaterialProvider(this.colorRampMaterialProvider);
            console.log('No active tracks. Switched to color ramp provider.');
        } else {
            // Tracks remain - ensure we're using trackMaterialProvider and trigger repaint
            this.materialProvider = this.trackMaterialProvider;
            setMaterialProvider(this.trackMaterialProvider);
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
        const checkedTracks = [];

        for (let trackView of this.browser.trackViews) {
            const track = trackView.track;
            if (track && (track.embeddingCheckboxChecked || (trackView.materialProviderInput && trackView.materialProviderInput.checked))) {
                checkedTracks.push(track.name);
            }
        }

        // Return array of checked track names, or 'none' if none checked
        return checkedTracks.length > 0 ? checkedTracks : 'none';
    }

    async restoreSessionState(state) {
        // Handle backward compatibility: if state is a string (old format), convert to array
        const trackNames = Array.isArray(state) ? state : (state === 'none' ? [] : [state]);

        if (trackNames.length === 0) {
            console.log('No tracks to restore for material provider');
            return;
        }

        console.log(`Restoring ${trackNames.length} tracks: ${trackNames.join(', ')}`);

        // Find and activate all tracks
        const tracksToRestore = this.browser.trackViews
            .map(({ track }) => track)
            .filter(track => trackNames.includes(track.name));

        if (tracksToRestore.length === 0) {
            console.warn('No matching tracks found for restoration');
            return;
        }

        // Check all tracks and add them to material provider
        for (const track of tracksToRestore) {
            if (typeof track.trackView?.isLoading === 'function' && track.trackView.isLoading()) {
                console.warn(`Track ${track.name} is still loading. Skipping.`);
                continue;
            }

            track.embeddingCheckboxChecked = true;
            if (track.trackView?.materialProviderInput) {
                track.trackView.materialProviderInput.checked = true;
            }
            await this.activateTrackMaterialProvider(track);
        }

        // Ensure final blended colors are applied
        if (tracksToRestore.length > 0) {
            this.materialProvider = this.trackMaterialProvider;
            setMaterialProvider(this.trackMaterialProvider);
        }

        console.log(`Successfully restored ${tracksToRestore.length} tracks`);
    }
}

export default IGVPanel
