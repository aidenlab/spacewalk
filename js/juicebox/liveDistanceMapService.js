import {ensembleManager, juiceboxPanel, liveDistanceMapService} from "../app.js";
import { clamp } from "../utils/mathUtils.js";
import {appleCrayonColorRGB255, rgb255String} from "../utils/colorUtils.js";
import { hideGlobalSpinner, showGlobalSpinner } from "../utils/utils.js"
import {compositeColors} from "../utils/colorUtils.js"
import SpacewalkEventBus from "../spacewalkEventBus.js"
import {enableLiveMaps} from "../utils/liveMapUtils.js"
import {postMessageToWorker} from "../utils/webWorkerUtils.js"
import {computeStatistics, normalizeToPercentileRange} from '../utils/statisticsUtils.js'

const kDistanceUndefined = -1

class LiveDistanceMapService {

    constructor () {

        this.configureMouseHandlers()

        this.worker = new Worker(new URL('./liveDistanceMapWorker.js', import.meta.url), {type: 'module'})

        this.worker.addEventListener('message', async ( { data }) => {
            await processWebWorkerResult.call(this, data)
        }, false)

        SpacewalkEventBus.globalBus.subscribe('DidSelectTrace', this);
        SpacewalkEventBus.globalBus.subscribe('DidLoadEnsembleFile', this);
        
        // Initialize contact threshold (computed as side effect of distance map calculation)
        this.computedContactThreshold = null

    }

    configureMouseHandlers(){

        this.ensembleToggleElement = juiceboxPanel.panel.querySelector('#spacewalk-live-distance-map-toggle-ensemble')

        this.ensembleToggleElement.addEventListener('click', () => {
            const liveMapTraceLength = ensembleManager.getLiveMapTraceLength()
            const liveMapVertexLists = ensembleManager.getLiveMapVertexLists()
            this.updateEnsembleAverageDistanceCanvas(liveMapTraceLength)
        })

        this.traceToggleElement = juiceboxPanel.panel.querySelector('#spacewalk-live-distance-map-toggle-trace')
        this.traceToggleElement.addEventListener('click', () => {
            const liveMapTraceLength = ensembleManager.getLiveMapTraceLength()
            this.updateTraceDistanceCanvas(liveMapTraceLength, ensembleManager.currentTrace)
        })

        juiceboxPanel.panel.querySelector('#hic-calculation-live-distance-button').addEventListener('click', event => {
            if (this.isEnsembleToggleChecked()) {
                const liveMapTraceLength = ensembleManager.getLiveMapTraceLength()
                const liveMapVertexLists = ensembleManager.getLiveMapVertexLists()
                this.updateEnsembleAverageDistanceCanvas(liveMapTraceLength)
            } else if (this.isTraceToggleChecked()) {
                const liveMapTraceLength = ensembleManager.getLiveMapTraceLength()
                this.updateTraceDistanceCanvas(liveMapTraceLength, ensembleManager.currentTrace)
            }
        })

    }

    isTraceToggleChecked() {
        return true === this.traceToggleElement.checked
    }

    isEnsembleToggleChecked() {
        return true === this.ensembleToggleElement.checked
    }

    receiveEvent({ type, data }) {

        if ("DidLoadEnsembleFile" === type) {
            // console.log('LiveDistanceMapService - receiveEvent(DidLoadEnsembleFile)')

            // Safety check: ctx_live_distance may not exist yet if browser isn't fully initialized
            if (juiceboxPanel?.browser?.contactMatrixView?.ctx_live_distance) {
                juiceboxPanel.browser.contactMatrixView.ctx_live_distance.transferFromImageBitmap(null)
            }

            this.rgbaMatrix = undefined
            this.distances = undefined
            this.maxDistance = undefined
            this.computedContactThreshold = null  // Reset threshold when ensemble file changes

            this.traceToggleElement.checked = false
            this.ensembleToggleElement.checked = false

        } else if ("DidSelectTrace" === type) {

            window.setTimeout(() => {

                if (false === juiceboxPanel.isHidden && juiceboxPanel.isActiveTab(juiceboxPanel.liveDistanceMapTab)) {
                    console.log('LiveDistanceMapService - receiveEvent(DidSelectTrace)')
                    this.updateTraceDistanceCanvas(ensembleManager.getLiveMapTraceLength(), ensembleManager.currentTrace)
                    this.traceToggleElement.checked = true
                    this.ensembleToggleElement.checked = false
                }

            }, 0)

        }

    }

    getClassName(){
        return 'LiveDistanceMapService'
    }

    async updateTraceDistanceCanvas(traceLength, trace) {

        const status = await enableLiveMaps()

        if (true === status) {

            showGlobalSpinner()

            const vertices = ensembleManager.getLiveMapTraceVertices(trace)

            const data =
                {
                    traceOrEnsemble: 'trace',
                    traceLength,
                    verticesString: JSON.stringify(vertices),
                }

            await this.updateDistanceCanvas(data)
        }

    }

    async updateEnsembleAverageDistanceCanvas(traceLength) {

        const status = await enableLiveMaps()

        if (true === status) {

            showGlobalSpinner()

            const vertexLists = ensembleManager.getLiveMapVertexLists()

            const data =
                {
                    traceOrEnsemble: 'ensemble',
                    traceLength,
                    vertexListsString: JSON.stringify(vertexLists)
                }

                await this.updateDistanceCanvas(data)
        }

    }

    async updateDistanceCanvas(data) {

        showGlobalSpinner()

        let result
        try {
            console.log(`Live Distance Map ${ data.traceOrEnsemble } payload sent to worker`)
            result = await postMessageToWorker(this.worker, data)
            hideGlobalSpinner()
        } catch (err) {
            hideGlobalSpinner()
            console.error('Error: Live Contact Map', err)

        }

        await processWebWorkerResult.call(this, result)

    }

}

/**
 * Compute contact map threshold from distance map distribution
 * Analyzes distance values to find an optimal threshold that captures meaningful contacts
 * Uses percentiles to find a threshold that balances contact density and variation
 * 
 * @param {Float32Array} distances - Distance array from distance map
 * @param {number} maxDistance - Maximum distance in the dataset
 * @returns {number|null} Recommended contact threshold, or null if insufficient data
 */
function computeContactThresholdFromDistances(distances, maxDistance) {
    if (!distances || distances.length === 0) {
        return null
    }
    
    // Extract valid distances (exclude undefined/missing)
    const validDistances = []
    for (let i = 0; i < distances.length; i++) {
        if (distances[i] !== kDistanceUndefined && distances[i] > 0) {
            validDistances.push(distances[i])
        }
    }
    
    if (validDistances.length === 0) {
        return null
    }
    
    // Sort for percentile calculation
    const sorted = [...validDistances].sort((a, b) => a - b)
    
    // Calculate percentiles
    const p25 = percentile(sorted, 25)
    const p50 = percentile(sorted, 50)
    const p75 = percentile(sorted, 75)
    const p90 = percentile(sorted, 90)
    
    // Strategy: Use p75 as baseline (captures medium-range contacts)
    // This provides a good balance - more inclusive than median, but not extreme
    // p75 captures distances that appear frequently enough to create variation in contact frequencies
    const baseline = p75
    
    // Apply a multiplier to account for contacts that span multiple consecutive segments
    // Using 1.5x p75 provides a threshold that captures meaningful medium-range contacts
    // This creates better frequency variation than using p50 or p90
    const threshold = baseline * 1.5
    
    // Log for debugging
    console.log('Contact threshold from distance map:', {
        validDistances: validDistances.length,
        p25: p25.toFixed(2),
        p50: p50.toFixed(2),
        p75: p75.toFixed(2),
        p90: p90.toFixed(2),
        baseline: baseline.toFixed(2),
        multiplier: 1.5,
        threshold: threshold.toFixed(2)
    })
    
    return threshold
}

/**
 * Helper function to compute percentile from sorted array
 * @param {Array<number>} sortedValues - Sorted array
 * @param {number} percentile - Percentile (0-100)
 * @returns {number} Value at percentile
 */
function percentile(sortedValues, percentile) {
    if (sortedValues.length === 0) return 0
    if (sortedValues.length === 1) return sortedValues[0]
    if (percentile <= 0) return sortedValues[0]
    if (percentile >= 100) return sortedValues[sortedValues.length - 1]
    
    const index = (percentile / 100) * (sortedValues.length - 1)
    const lowerIndex = Math.floor(index)
    const upperIndex = Math.ceil(index)
    const weight = index - lowerIndex
    
    return sortedValues[lowerIndex] * (1 - weight) + sortedValues[upperIndex] * weight
}

async function processWebWorkerResult(result) {

    const traceLength = ensembleManager.getLiveMapTraceLength()
    const arrayLength = traceLength * traceLength * 4

    if (undefined === this.rgbaMatrix || this.rgbaMatrix.length !== arrayLength) {
        this.rgbaMatrix = new Uint8ClampedArray(arrayLength)
    } else {
        this.rgbaMatrix.fill(0)
    }

    this.distances = result.workerDistanceBuffer
    this.maxDistance = result.maxDistance
    
    // Compute statistics on nearness values for percentile-based color scaling
    // Nearness = maxDistance - distance, higher nearness = closer vertices
    const nearnessValues = new Float32Array(this.distances.length)
    for (let i = 0; i < this.distances.length; i++) {
        if (this.distances[i] !== kDistanceUndefined) {
            const distance = clamp(this.distances[i], 0, this.maxDistance)
            nearnessValues[i] = this.maxDistance - distance
        } else {
            nearnessValues[i] = -1  // Mark as invalid
        }
    }
    
    this.nearnessStats = computeStatistics(nearnessValues, {
        includePositiveOnly: true  // Filter out -1 (undefined) and values <= 0
    })
    
    // Log statistics for debugging
    console.log('Distance map nearness statistics:', {
        count: this.nearnessStats.count,
        min: this.nearnessStats.min.toFixed(2),
        max: this.nearnessStats.max.toFixed(2),
        median: this.nearnessStats.median.toFixed(2),
        p5: this.nearnessStats.percentiles.p5.toFixed(2),
        p95: this.nearnessStats.percentiles.p95.toFixed(2),
        sparsity: (this.nearnessStats.sparsity * 100).toFixed(1) + '%'
    })
    
    // Side effect: Compute contact map threshold from distance distribution
    // This leverages the fast distance map calculation to inform the slower contact map threshold
    this.computedContactThreshold = computeContactThresholdFromDistances(this.distances, this.maxDistance)
    if (this.computedContactThreshold !== null) {
        console.log(`Distance map computed contact threshold: ${this.computedContactThreshold.toFixed(2)}`)
    }
    
    await juiceboxPanel.renderLiveMapWithDistanceData(this.distances, this.maxDistance, this.rgbaMatrix, ensembleManager.getLiveMapTraceLength())

}

function setupOffScreenCanvas(width, height, rgb255){

    const offscreenCanvas = document.createElement('canvas')
    offscreenCanvas.width = width
    offscreenCanvas.height = height

    const ctx2d = offscreenCanvas.getContext('2d')
    ctx2d.fillStyle = rgb255String(rgb255)
    ctx2d.fillRect(0, 0, width, height)
    return {offscreenCanvas, ctx2d}
}

async function renderLiveMapWithDistanceData(browser, distances, maxDistance, rgbaMatrix, liveMapTraceLength) {

    // Refer to destination canvas
    const distanceMapCanvas = browser.contactMatrixView.ctx_live_distance.canvas

    // Set up offscreen canvas for compositing with initial background color
    const {offscreenCanvas, ctx2d} = setupOffScreenCanvas(distanceMapCanvas.width, distanceMapCanvas.height, appleCrayonColorRGB255('tin'))

    // Paint foreground color - with alpha - into rgbaMatrix
    // Pass nearnessStats for percentile-based scaling (if available)
    const nearnessStats = liveDistanceMapService?.nearnessStats
    paintDistanceMapRGBAMatrix(distances, maxDistance, rgbaMatrix, browser.contactMatrixView.colorScale, browser.contactMatrixView.backgroundColor, nearnessStats)

    // Composite foreground over background
    const imageBitmap = await createImageBitmap(new ImageData(rgbaMatrix, liveMapTraceLength, liveMapTraceLength))

    // draw imageBitmap into distanceMapCanvas context while simultaneously scaling up the imageBitmap
    // to the resolution of the distanceMapCanvas
    ctx2d.drawImage(imageBitmap, 0, 0, distanceMapCanvas.width, distanceMapCanvas.height)

    // Retrieve compositedImageBitmap and transfer to distanceMapCanvas via it's context
    const compositedImageBitmap = await createImageBitmap(offscreenCanvas)
    const ctx = browser.contactMatrixView.ctx_live_distance
    ctx.transferFromImageBitmap(compositedImageBitmap);

}

function paintDistanceMapRGBAMatrix(distances, maxDistance, rgbaMatrix, colorScale, backgroundRGB, nearnessStats) {
    // Get statistics for percentile-based normalization
    const stats = nearnessStats
    
    // Default percentiles (can be made configurable later)
    const minPercentile = 5
    const maxPercentile = 95
    
    // Compute percentile range values for mapping
    let percentileMin = 0
    let percentileMax = maxDistance
    let usePercentileScaling = false
    
    if (stats && stats.count > 0) {
        percentileMin = stats.percentiles[`p${minPercentile}`] || stats.min
        percentileMax = stats.percentiles[`p${maxPercentile}`] || stats.max
        usePercentileScaling = (percentileMax > percentileMin)
    }

    let i = 0;
    const { r, g, b } = colorScale.getColorComponents()

    for (let distance of distances) {

        if (kDistanceUndefined !== distance) {

            distance = clamp(distance, 0, maxDistance)
            const nearness = maxDistance - distance

            // Compute interpolant using percentile-based scaling
            let rawInterpolant
            if (usePercentileScaling) {
                // Clamp nearness to percentile range
                const clampedNearness = Math.max(percentileMin, Math.min(nearness, percentileMax))
                // Normalize to 0-1 within percentile range
                rawInterpolant = (clampedNearness - percentileMin) / (percentileMax - percentileMin)
            } else {
                // Fallback to linear scaling
                rawInterpolant = nearness / maxDistance
            }
            
            if (rawInterpolant < 0 || 1 < rawInterpolant) {
                console.warn(`${ Date.now() } populateCanvasArray - interpolant out of range ${ rawInterpolant }`)
            }

            const alpha = Math.floor(255 * clamp(rawInterpolant, 0, 1))
            const foregroundRGBA = { r, g, b, a:alpha }

            const { r:comp_r, g:comp_g, b:comp_b } = compositeColors(foregroundRGBA, backgroundRGB)

            rgbaMatrix[i    ] = comp_r;
            rgbaMatrix[i + 1] = comp_g;
            rgbaMatrix[i + 2] = comp_b;
            rgbaMatrix[i + 3] = 255;

        } else {

            rgbaMatrix[i    ] = 0;
            rgbaMatrix[i + 1] = 0;
            rgbaMatrix[i + 2] = 0;
            rgbaMatrix[i + 3] = 0;

        }

        i += 4;
    }

}

export { renderLiveMapWithDistanceData }

export default LiveDistanceMapService
