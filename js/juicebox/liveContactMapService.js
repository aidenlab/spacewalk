import { LiveContactMap } from 'hic-straw'
import { ensembleManager, juiceboxPanel, igvPanel, liveDistanceMapService } from '../app.js'
import SpacewalkEventBus from '../spacewalkEventBus.js'
import SWBDatasource from '../datasource/SWBDatasource.js'
import { ensureLiveMapVertexLists } from '../utils/liveMapUtils.js'
import { renderContactMap, renderDistanceMap } from './liveMapRenderUtils.js'

const defaultDistanceThreshold = 200
const defaultNeighborExclusion = 3

class LiveContactMapService {

    constructor() {

        // Shared LiveContactMap instance (serves both contact and distance tabs)
        this.lcm = null

        // Slider controls
        this.thresholdSlider = document.getElementById('live-map-threshold-slider')
        this.thresholdDisplay = document.getElementById('live-map-threshold-value')
        this.exclusionSlider = document.getElementById('live-map-exclusion-slider')
        this.exclusionDisplay = document.getElementById('live-map-exclusion-value')
        this.contactModeSelect = document.getElementById('live-map-contact-mode')
        this.thresholdUpBtn   = document.getElementById('live-map-threshold-up')
        this.thresholdDownBtn = document.getElementById('live-map-threshold-down')
        this.exclusionUpBtn   = document.getElementById('live-map-exclusion-up')
        this.exclusionDownBtn = document.getElementById('live-map-exclusion-down')

        // Calculate buttons — both compute distance + contact maps
        document.getElementById('live-map-calculate-button').addEventListener('click', () => {
            this.calculateLiveMaps()
        })

        document.getElementById('live-distance-map-calculate-button').addEventListener('click', () => {
            this.calculateLiveMaps()
        })

        // Threshold slider: update display on drag, repaint on release
        this.thresholdSlider.addEventListener('input', () => {
            this.thresholdDisplay.textContent = this.thresholdSlider.value
        })

        this.thresholdSlider.addEventListener('change', () => {
            if (!this.lcm) return
            juiceboxPanel.showLiveMapSpinner()
            setTimeout(() => {
                this.lcm.setDistanceThreshold(parseInt(this.thresholdSlider.value))
                this.repaintContactMap()
                juiceboxPanel.hideLiveMapSpinner()
            }, 0)
        })

        // Exclusion slider: update display on drag, repaint on release
        this.exclusionSlider.addEventListener('input', () => {
            this.exclusionDisplay.textContent = this.exclusionSlider.value
        })

        this.exclusionSlider.addEventListener('change', () => {
            if (!this.lcm) return
            juiceboxPanel.showLiveMapSpinner()
            setTimeout(() => {
                this.lcm.setNeighborExclusion(parseInt(this.exclusionSlider.value))
                this.repaintContactMap()
                juiceboxPanel.hideLiveMapSpinner()
            }, 0)
        })

        // Threshold steppers
        this.thresholdUpBtn.addEventListener('click', () => {
            this.thresholdSlider.stepUp()
            this.thresholdSlider.dispatchEvent(new Event('input'))
            this.thresholdSlider.dispatchEvent(new Event('change'))
        })
        this.thresholdDownBtn.addEventListener('click', () => {
            this.thresholdSlider.stepDown()
            this.thresholdSlider.dispatchEvent(new Event('input'))
            this.thresholdSlider.dispatchEvent(new Event('change'))
        })

        // Exclusion steppers
        this.exclusionUpBtn.addEventListener('click', () => {
            this.exclusionSlider.stepUp()
            this.exclusionSlider.dispatchEvent(new Event('input'))
            this.exclusionSlider.dispatchEvent(new Event('change'))
        })
        this.exclusionDownBtn.addEventListener('click', () => {
            this.exclusionSlider.stepDown()
            this.exclusionSlider.dispatchEvent(new Event('input'))
            this.exclusionSlider.dispatchEvent(new Event('change'))
        })

        // Contact mode: full rebuild required
        this.contactModeSelect.addEventListener('change', () => {
            if (!this.lcm) return
            juiceboxPanel.showLiveMapSpinner()
            setTimeout(() => {
                this.calculateLiveMaps()
            }, 0)
        })

        SpacewalkEventBus.globalBus.subscribe('DidLoadEnsembleFile', this)
    }

    receiveEvent({ type, data }) {
        if ('DidLoadEnsembleFile' === type) {
            this.lcm = null
            this.thresholdSlider.value = defaultDistanceThreshold
            this.thresholdDisplay.textContent = defaultDistanceThreshold.toString()
            this.exclusionSlider.value = defaultNeighborExclusion
            this.exclusionDisplay.textContent = defaultNeighborExclusion.toString()
            this.contactModeSelect.value = 'frequency'
        }
    }

    /**
     * Read the current foreground and background colors from Juicebox.
     * Falls back to defaults if the browser is not available.
     */
    getColorConfig() {
        const browser = juiceboxPanel?.browser
        const cmv = browser?.contactMatrixView

        const foreground = cmv?.colorScale
            ? { r: cmv.colorScale.r, g: cmv.colorScale.g, b: cmv.colorScale.b }
            : { r: 255, g: 0, b: 0 }

        const background = cmv?.backgroundColor
            ? { ...cmv.backgroundColor }
            : { r: 255, g: 255, b: 255 }

        return { foreground, background }
    }

    async calculateLiveMaps() {

        if (!ensembleManager || !ensembleManager.locus) {
            console.warn('Cannot calculate live maps: no ensemble loaded')
            return
        }

        juiceboxPanel.showLiveMapSpinner()

        try {
            const { chr, genomicStart, genomicEnd } = ensembleManager.locus
            const traceLength = ensembleManager.getLiveMapTraceLength()
            const binSize = (genomicEnd - genomicStart) / traceLength

            const genomeId = igvPanel.browser.genome.id

            // Get chromosomes from IGV genome for LiveContactMap
            const chromosomes = Array.from(igvPanel.browser.genome.chromosomes.values()).map((c, idx) => ({
                index: idx,
                name: c.name,
                size: c.size || c.bpLength
            }))

            const allIndex = chromosomes.findIndex(c => c.name.toLowerCase() === 'all')
            if (allIndex > 0) {
                const allChr = chromosomes.splice(allIndex, 1)[0]
                chromosomes.unshift(allChr)
                chromosomes.forEach((c, idx) => { c.index = idx })
            }

            const distanceThreshold = parseInt(this.thresholdSlider.value)
            const neighborExclusion = parseInt(this.exclusionSlider.value)
            const contactMode = this.contactModeSelect.value

            const lcmConfig = {
                genomeId,
                chr,
                genomicStart,
                genomicEnd,
                binSize,
                traceLength,
                chromosomes,
                distanceThreshold,
                neighborExclusion,
                contactMode,
                name: 'Live Contact Map'
            }

            // SWB (ball-and-stick or pointcloud): hand hic-straw the already-open
            // HDF5 handle so it can use the baked live_contact_map_vertices fast
            // path. Pointcloud bakes store per-region centroids in the same
            // (traceCount, traceLength, 3) shape as ball-and-stick. Other
            // datasources (e.g. CNDB) supply traces directly.
            const ds = ensembleManager.datasource
            if (ds instanceof SWBDatasource) {
                lcmConfig.hdf5 = ds.hdf5
                lcmConfig.ensembleGroupKey = ds.currentEnsembleGroupKey
            } else {
                lcmConfig.traces = await ensureLiveMapVertexLists()
            }

            this.lcm = new LiveContactMap(lcmConfig)

            await this.lcm.init()

            // Register live map with Juicebox so locus input, scrollbars, and rulers get populated
            const locusStr = `${chr}:${genomicStart}-${genomicEnd}`
            await juiceboxPanel.browser.loadLiveContactMap({
                liveContactMap: this.lcm,
                name: 'Live Contact Map',
                locus: `${locusStr} ${locusStr}`
            })

            // Update slider ranges based on computed data
            this.thresholdSlider.max = Math.ceil(this.lcm.maxDistance * 2)
            this.exclusionSlider.max = Math.min(20, traceLength - 2)

            // Ensure canvases are sized
            juiceboxPanel.updateLiveMapCanvasSizes(juiceboxPanel.browser.contactMatrixView)

            const colorConfig = this.getColorConfig()

            // Render contact map directly to canvas
            this.repaintContactMap()

            // Render distance map from the same LiveContactMap instance
            if (liveDistanceMapService) {
                liveDistanceMapService.renderFromLiveContactMap(this.lcm, colorConfig)
            }

        } catch (err) {
            console.error('Error calculating live maps:', err)
            alert(`Error calculating live maps: ${err.message}`)
        } finally {
            juiceboxPanel.hideLiveMapSpinner()
        }
    }

    /**
     * Repaint the contact map canvas from the current LiveContactMap state.
     * Called after threshold/exclusion slider changes, color changes, and initial calculation.
     * @param {Object} [colorOverride] - Optional override for foreground/background { foreground?: {r,g,b}, background?: {r,g,b} }
     */
    repaintContactMap(colorOverride) {
        if (!this.lcm) return

        const ctx = juiceboxPanel?.browser?.contactMatrixView?.ctx_live_contact
        if (!ctx) {
            console.warn('Live contact canvas context not available')
            return
        }

        const colorConfig = { ...this.getColorConfig(), ...colorOverride }
        renderContactMap(ctx, this.lcm, colorConfig)
    }

    /**
     * Repaint the distance map canvas from the current LiveContactMap state.
     * Called after background/foreground color changes (distance map uses background for fill).
     * @param {Object} [colorOverride] - Optional override for background { background?: {r,g,b} }
     */
    repaintDistanceMap(colorOverride) {
        if (!this.lcm) return

        const ctx = juiceboxPanel?.browser?.contactMatrixView?.ctx_live_distance
        if (!ctx) {
            console.warn('Live distance canvas context not available')
            return
        }

        const colorConfig = { ...this.getColorConfig(), ...colorOverride }
        renderDistanceMap(ctx, this.lcm, colorConfig)
    }

    // Session state support
    get distanceThreshold() {
        return parseInt(this.thresholdSlider.value)
    }

    setState(distanceThreshold) {
        const value = distanceThreshold || defaultDistanceThreshold
        this.thresholdSlider.value = value
        this.thresholdDisplay.textContent = value.toString()
    }

    getClassName() {
        return 'LiveContactMapService'
    }
}

export { defaultDistanceThreshold }

export default LiveContactMapService
