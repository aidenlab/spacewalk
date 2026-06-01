import { LiveContactMap } from 'hic-straw'
import SpacewalkEventBus from '../spacewalkEventBus.js'
import { buildLiveContactMapConfig } from './liveContactMapConfig.js'

class LiveContactMapService {

    constructor({ ensembleManager, igvPanel, liveMapView, getJuiceboxBrowser, liveDistanceMapService }) {

        this.ensembleManager = ensembleManager
        this.igvPanel = igvPanel
        this.liveMapView = liveMapView
        this.getJuiceboxBrowser = getJuiceboxBrowser
        this.liveDistanceMapService = liveDistanceMapService

        // Shared LiveContactMap instance (serves both contact and distance tabs)
        this.lcm = null

        // Slider controls
        this.thresholdSlider = document.getElementById('live-map-threshold-slider')
        this.thresholdDisplay = document.getElementById('live-map-threshold-value')
        this.thresholdUpBtn   = document.getElementById('live-map-threshold-up')
        this.thresholdDownBtn = document.getElementById('live-map-threshold-down')

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
            this.liveMapView.showSpinner()
            setTimeout(() => {
                this.lcm.setDistanceThreshold(parseInt(this.thresholdSlider.value))
                this.repaintContactMap()
                this.liveMapView.hideSpinner()
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

        SpacewalkEventBus.globalBus.subscribe('DidLoadEnsembleFile', this)
    }

    receiveEvent({ type, data }) {
        if ('DidLoadEnsembleFile' === type) {
            // Null out lcm so the slider change handler's `if (!this.lcm) return`
            // guard disables it until the user clicks Calculate. The threshold slider
            // itself is left as-is — Calculate always re-derives and syncs it.
            this.lcm = null
        }
    }

    /**
     * Read the current foreground and background colors from Juicebox.
     * Falls back to defaults if the browser is not available.
     */
    getColorConfig() {
        const browser = this.getJuiceboxBrowser()
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

        if (!this.ensembleManager || !this.ensembleManager.locus) {
            console.warn('Cannot calculate live maps: no ensemble loaded')
            return
        }

        this.liveMapView.showSpinner()

        try {
            const { chr, genomicStart, genomicEnd } = this.ensembleManager.locus
            const traceLength = this.ensembleManager.getLiveMapTraceLength()

            // distanceThreshold is intentionally omitted: every Calculate re-derives
            // it from the distance distribution, so pressing Calculate resets the
            // threshold to the data-driven default. The slider is synced post-init().
            const lcmConfig = buildLiveContactMapConfig({
                genome: this.igvPanel.browser.genome,
                locus: this.ensembleManager.locus,
                traceLength
            })

            // Hand hic-straw the already-open HDF5 handle so it can use the
            // baked live_contact_map_vertices fast path. Pointcloud bakes
            // store per-region centroids in the same (traceCount, traceLength,
            // 3) shape as ball-and-stick. Legacy pointcloud files exported
            // before the bake existed fall back to runtime centroid collapse.
            const ds = this.ensembleManager.datasource
            if (ds.isPointCloud && !(await ds.hasLiveVertexBake())) {
                lcmConfig.traces = await ds.buildPointCloudLiveMapTraces()
            } else {
                lcmConfig.hdf5 = ds.hdf5
                lcmConfig.ensembleGroupKey = ds.currentEnsembleGroupKey
            }

            this.lcm = new LiveContactMap(lcmConfig)

            await this.lcm.init()

            // The live contact/distance tabs render to their own canvases (LiveMapView),
            // independent of Juicebox's activeDataset. Registering the live map with
            // Juicebox is needed only to populate the shared chrome (locus input,
            // rulers, scrollbars) when nothing else has — i.e. when no .hic map is
            // loaded (no browser.genome, so the ensemble-load goto is skipped).
            //
            // When a real .hic map IS loaded, loadLiveContactMap would clearSession()
            // and overwrite activeDataset/genome with the low-res live map, so the Hi-C
            // tab repaints blurry on return (issue #55). In that case the chrome already
            // sits at the same locus (both driven to ensembleManager.locus), so skip it
            // and leave the Hi-C dataset intact.
            const browser = this.getJuiceboxBrowser()
            const hasHicMap = browser?.activeDataset && !browser.activeDataset.isLive
            if (!hasHicMap) {
                const locusStr = `${chr}:${genomicStart}-${genomicEnd}`
                await browser.loadLiveContactMap({
                    liveContactMap: this.lcm,
                    name: 'Live Contact Map',
                    locus: `${locusStr} ${locusStr}`
                })
            }

            // Size the threshold slider to the data and sync it to the freshly
            // derived default. this.lcm.distanceThreshold is only defined after
            // init() resolves.
            this.thresholdSlider.max = Math.ceil(this.lcm.maxDistance * 2)
            this.thresholdSlider.value = Math.round(this.lcm.distanceThreshold)
            this.thresholdDisplay.textContent = this.thresholdSlider.value

            // Ensure canvases are sized
            this.liveMapView.resize()

            const colorConfig = this.getColorConfig()

            // Render contact map directly to canvas
            this.repaintContactMap()

            // Render distance map from the same LiveContactMap instance
            if (this.liveDistanceMapService) {
                this.liveDistanceMapService.renderFromLiveContactMap(this.lcm, colorConfig)
            }

        } catch (err) {
            console.error('Error calculating live maps:', err)
            alert(`Error calculating live maps: ${err.message}`)
        } finally {
            this.liveMapView.hideSpinner()
        }
    }

    /**
     * Repaint the contact map canvas from the current LiveContactMap state.
     * Called after threshold slider changes, color changes, and initial calculation.
     * @param {Object} [colorOverride] - Optional override for foreground/background { foreground?: {r,g,b}, background?: {r,g,b} }
     */
    repaintContactMap(colorOverride) {
        if (!this.lcm) return
        const colorConfig = { ...this.getColorConfig(), ...colorOverride }
        this.liveMapView.renderContact(this.lcm, colorConfig)
    }

    /**
     * Repaint the distance map canvas from the current LiveContactMap state.
     * Called after background/foreground color changes (distance map uses background for fill).
     * @param {Object} [colorOverride] - Optional override for background { background?: {r,g,b} }
     */
    repaintDistanceMap(colorOverride) {
        if (!this.lcm) return
        const colorConfig = { ...this.getColorConfig(), ...colorOverride }
        this.liveMapView.renderDistance(this.lcm, colorConfig)
    }

    getClassName() {
        return 'LiveContactMapService'
    }
}

export default LiveContactMapService
