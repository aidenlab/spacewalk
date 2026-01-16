import {ensembleManager, juiceboxPanel} from "../app.js"
import EnsembleManager from "../ensembleManager.js"
import SpacewalkEventBus from "../spacewalkEventBus.js"
import {hideGlobalSpinner, showGlobalSpinner} from "../utils/utils.js"
import {clamp, distanceTo} from "../utils/mathUtils.js"
import {enableLiveMaps} from "../utils/liveMapUtils.js"
import {postMessageToWorker} from "../utils/webWorkerUtils.js"
import KDBush from '../kd3d/kd3d.js'
import {computeStatistics, normalizeToPercentileRange} from '../utils/statisticsUtils.js'

const maxDistanceThreshold = 1e4
const defaultDistanceThreshold = 256

// Constants for automatic threshold determination
const DEFAULT_K = 3  // Number of nearest neighbors to analyze
const DEFAULT_SAMPLE_SIZE = 200  // Number of vertices to sample for k-NN analysis
const DEFAULT_NN_MULTIPLIER = 2.0  // Multiplier for median nearest neighbor distance
const DEFAULT_MIN_THRESHOLD_MULTIPLIER = 1.2  // Minimum threshold multiplier
const DEFAULT_CONSECUTIVE_DISTANCE_MULTIPLIER = 2.5  // Multiplier for average consecutive vertex distance
const KDBUSH_NODE_SIZE = 64  // KDBush node size for spatial indexing

// Constants for percentile-based color scaling
const DEFAULT_MIN_PERCENTILE = 5  // 5th percentile
const DEFAULT_MAX_PERCENTILE = 95  // 95th percentile

/**
 * Convert Float32Array contact frequencies to contact record format
 * @param {Float32Array} contactFrequencies - Array of contact frequencies (traceLength * traceLength)
 * @param {number} traceLength - Length of the trace
 * @returns {Array<Object>} Array of contact records with {bin1, bin2, counts, getKey()}
 */
function convertContactFrequencyArrayToRecords(contactFrequencies, traceLength) {
    const records = [];
    for (let bin1 = 0; bin1 < traceLength; bin1++) {
        for (let bin2 = bin1; bin2 < traceLength; bin2++) {
            const index = bin1 * traceLength + bin2;
            const count = contactFrequencies[index];
            if (count > 0) {
                records.push({
                    bin1: bin1,
                    bin2: bin2,
                    counts: count,
                    getKey: function() {
                        return `${bin1}_${bin2}`;
                    }
                });
            }
        }
    }
    return records;
}

class LiveContactMapService {

    constructor (distanceThreshold) {

        this.distanceThreshold = distanceThreshold

        this.input = document.querySelector('#spacewalk_contact_frequency_map_adjustment_select_input')
        this.input.value = distanceThreshold.toString()

        document.querySelector('#hic-live-contact-frequency-map-threshold-button').addEventListener('click', () => {

            this.distanceThreshold = clamp(parseInt(this.input.value, 10), 0, maxDistanceThreshold)

            window.setTimeout(() => {
                this.updateEnsembleContactFrequencyCanvas(this.distanceThreshold)
            }, 0)
        })

        this.worker = new Worker(new URL('./liveContactMapWorker.js', import.meta.url), { type: 'module' })

        SpacewalkEventBus.globalBus.subscribe('DidLoadEnsembleFile', this);

    }

    receiveEvent({ type, data }) {

        if ("DidLoadEnsembleFile" === type) {

            // Safety check: ctx_live may not exist yet if browser isn't fully initialized
            if (juiceboxPanel?.browser?.contactMatrixView?.ctx_live) {
                juiceboxPanel.browser.contactMatrixView.ctx_live.transferFromImageBitmap(null)
            }

            this.contactFrequencies = undefined
            this.rgbaMatrix = undefined

            this.distanceThreshold = distanceThresholdEstimate(ensembleManager.currentTrace)

            this.input.value = this.distanceThreshold.toString()
        }
    }

    setState(distanceThreshold) {
        this.distanceThreshold = distanceThreshold
        this.input.value = distanceThreshold.toString()
    }

    getClassName(){
        return 'LiveContactMapService'
    }

    async updateEnsembleContactFrequencyCanvas(distanceThresholdOrUndefined) {

        const status = await enableLiveMaps()

        if (true === status) {

            showGlobalSpinner()

            this.distanceThreshold = distanceThresholdOrUndefined || distanceThresholdEstimate(ensembleManager.currentTrace)
            this.input.value = this.distanceThreshold.toString()

            const data =
                {
                    traceOrEnsemble: 'ensemble',
                    traceLength: ensembleManager.getLiveMapTraceLength(),
                    vertexListsString: JSON.stringify( ensembleManager.getLiveMapVertexLists()),
                    distanceThreshold: this.distanceThreshold
                }

            let result
            try {
                console.log(`Live Contact Map ${ data.traceOrEnsemble } payload sent to worker`)
                result = await postMessageToWorker(this.worker, data)
                hideGlobalSpinner()
            } catch (err) {
                hideGlobalSpinner()
                console.error('Error: Live Contact Map', err)

            }

            const traceLength = ensembleManager.getLiveMapTraceLength()
            const arrayLength = traceLength * traceLength * 4

            if (undefined === this.rgbaMatrix || this.rgbaMatrix.length !== arrayLength) {
                this.rgbaMatrix = new Uint8ClampedArray(arrayLength)
            } else {
                this.rgbaMatrix.fill(0)
            }

            this.contactFrequencies = result.workerValuesBuffer
            
            // Compute statistics for percentile-based color scaling
            this.contactFrequencyStats = computeStatistics(this.contactFrequencies, {
                includePositiveOnly: true  // Filter out -1 (undefined) and values <= 0
            })
            
            // Log statistics for debugging
            console.log('Contact frequency statistics:', {
                count: this.contactFrequencyStats.count,
                min: this.contactFrequencyStats.min,
                max: this.contactFrequencyStats.max,
                median: this.contactFrequencyStats.median.toFixed(2),
                p5: this.contactFrequencyStats.percentiles.p5.toFixed(2),
                p95: this.contactFrequencyStats.percentiles.p95.toFixed(2),
                sparsity: (this.contactFrequencyStats.sparsity * 100).toFixed(1) + '%'
            })
            
            // Update LiveMapDataset with new contact records
            if (juiceboxPanel.browser.activeDataset && 
                juiceboxPanel.browser.activeDataset.datasetType === 'livemap') {
                const contactRecords = convertContactFrequencyArrayToRecords(this.contactFrequencies, traceLength);
                // Get binSize from the dataset's bpResolutions
                const binSize = juiceboxPanel.browser.activeDataset.bpResolutions[0];
                juiceboxPanel.browser.activeDataset.updateContactRecords(contactRecords, binSize);
            }

            await juiceboxPanel.renderLiveMapWithContactData(this.contactFrequencies, this.rgbaMatrix, traceLength)

        }

    }
}

/**
 * Sample vertices randomly for efficient analysis
 * @param {Array} vertices - Array of vertex objects
 * @param {number} count - Number of vertices to sample
 * @returns {Array} Sampled vertices
 */
function sampleVertices(vertices, count) {
    if (vertices.length <= count) {
        return vertices
    }
    
    const sampled = []
    const indices = new Set()
    
    while (sampled.length < count) {
        const idx = Math.floor(Math.random() * vertices.length)
        if (!indices.has(idx)) {
            indices.add(idx)
            sampled.push(vertices[idx])
        }
    }
    
    return sampled
}

/**
 * Compute median value from array
 * @param {Array<number>} values - Array of numbers
 * @returns {number} Median value
 */
function median(values) {
    if (values.length === 0) return 0
    
    const sorted = [...values].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    
    if (sorted.length % 2 === 0) {
        return (sorted[mid - 1] + sorted[mid]) / 2
    } else {
        return sorted[mid]
    }
}

/**
 * Create KDBush configuration for vertices
 * @param {Array} vertices - Array of vertex objects with x, y, z properties
 * @returns {Object} KDBush configuration object
 */
function createKDBushConfig(vertices) {
    return {
        idList: vertices.map((_, index) => index),
        points: vertices,
        getX: pt => pt.x,
        getY: pt => pt.y,
        getZ: pt => pt.z,
        nodeSize: KDBUSH_NODE_SIZE,
        ArrayType: Float64Array,
        axisCount: 3
    }
}

/**
 * Compute k-nearest neighbor distances for sampled vertices
 * @param {Array} vertices - Array of vertex objects with x, y, z properties
 * @param {number} k - Number of nearest neighbors to find
 * @param {number} sampleSize - Number of vertices to sample
 * @returns {Array<number>} Array of k-NN distances
 */
function computeKNNDistances(vertices, k, sampleSize) {
    // Filter out missing data
    const validVertices = vertices.filter(v => v.isMissingData !== true)
    
    if (validVertices.length < 2) {
        return []
    }
    
    // Adjust k if we don't have enough vertices
    const actualK = Math.min(k, validVertices.length - 1)
    
    // Sample vertices for efficiency
    const sample = sampleVertices(validVertices, Math.min(sampleSize, validVertices.length))
    
    if (sample.length === 0) {
        return []
    }
    
    // Build spatial index
    const spatialIndex = new KDBush(createKDBushConfig(validVertices))
    
    const nnDistances = []
    
    // For each sampled vertex, find k nearest neighbors
    for (const vertex of sample) {
        // Use a large radius to get all neighbors, then sort and take k nearest
        // We'll query with increasing radius until we get enough neighbors
        let radius = 1000  // Start with reasonable radius
        let neighbors = spatialIndex.within(vertex.x, vertex.y, vertex.z, radius)
        
        // If we don't have enough neighbors, increase radius
        let maxRadius = 1e6
        while (neighbors.length < actualK + 1 && radius < maxRadius) {
            radius *= 2
            neighbors = spatialIndex.within(vertex.x, vertex.y, vertex.z, radius)
        }
        
        // Calculate distances and sort
        const distances = neighbors
            .map(idx => distanceTo(vertex, validVertices[idx]))
            .sort((a, b) => a - b)
            .slice(1, actualK + 1)  // Skip self (distance 0), take k nearest
        
        // Only add if we got at least one neighbor
        if (distances.length > 0) {
            nnDistances.push(...distances)
        }
    }
    
    return nnDistances
}

/**
 * Quick contact count for a sample of vertices (for refinement)
 * @param {Array} vertices - Array of vertex objects
 * @param {number} traceLength - Length of the trace
 * @param {number} threshold - Distance threshold to test
 * @returns {number} Approximate number of contacts
 */
function quickContactCount(vertices, traceLength, threshold) {
    // Filter valid vertices
    const validVertices = vertices.filter(v => v.isMissingData !== true)
    
    if (validVertices.length < 2) {
        return 0
    }
    
    // Sample for quick estimation
    const sampleSize = Math.min(100, validVertices.length)
    const sample = sampleVertices(validVertices, sampleSize)
    
    // Build spatial index
    const spatialIndex = new KDBush(createKDBushConfig(validVertices))
    
    let contactCount = 0
    
    // Count contacts for sampled vertices
    for (const vertex of sample) {
        const neighbors = spatialIndex.within(vertex.x, vertex.y, vertex.z, threshold)
        // Subtract 1 to exclude self
        contactCount += Math.max(0, neighbors.length - 1)
    }
    
    // Scale up to estimate total contacts
    const scaleFactor = (validVertices.length / sampleSize) ** 2
    return Math.floor(contactCount * scaleFactor)
}

/**
 * Compute distances between consecutive vertices in a trace
 * For ball-and-stick datasets, this captures the connectivity scale of the structure
 * 
 * @param {Array} vertices - Array of vertex objects with x, y, z, isMissingData properties
 * @returns {Array<number>} Array of distances between consecutive vertices
 */
function computeConsecutiveVertexDistances(vertices) {
    const consecutiveDistances = []
    
    // Filter out missing data
    const validVertices = vertices.filter(v => v.isMissingData !== true)
    
    if (validVertices.length < 2) {
        return []
    }
    
    // Compute distances between consecutive vertices (i, i+1)
    for (let i = 0; i < validVertices.length - 1; i++) {
        const distance = distanceTo(validVertices[i], validVertices[i + 1])
        consecutiveDistances.push(distance)
    }
    
    return consecutiveDistances
}

/**
 * Automatically determine optimal distance threshold using hybrid approach
 * Combines radius-based heuristic, consecutive vertex distance analysis, and k-nearest neighbor analysis
 * 
 * For ball-and-stick datasets, consecutive vertex distances provide scale-aware threshold estimation
 * 
 * @param {Object} trace - Trace object
 * @param {Array} vertices - Array of vertex objects with x, y, z, isMissingData properties
 * @param {number} traceLength - Length of the trace
 * @returns {number} Automatically determined threshold
 */
function autoDetermineThreshold(trace, vertices, traceLength) {
    // Phase 1: Radius-based heuristic (fast baseline)
    const { radius } = EnsembleManager.getTraceBounds(trace)
    const heuristicThreshold = radius / 2
    
    // Early return if no valid vertices
    const validVertices = vertices.filter(v => v.isMissingData !== true)
    if (validVertices.length === 0) {
        return Math.floor(heuristicThreshold)
    }
    
    // Phase 2: Consecutive vertex distance analysis (scale-aware for ball-and-stick only)
    // For ball-and-stick datasets, consecutive vertices are connected, so their distances
    // provide a meaningful scale for contact detection. Point clouds don't have this connectivity.
    let consecutiveThreshold = null
    
    // Only use consecutive distance analysis for ball-and-stick datasets
    if (!ensembleManager.isPointCloud) {
        const consecutiveDistances = computeConsecutiveVertexDistances(vertices)
        
        if (consecutiveDistances.length > 0) {
            const avgConsecutiveDistance = consecutiveDistances.reduce((a, b) => a + b, 0) / consecutiveDistances.length
            const medianConsecutiveDistance = median(consecutiveDistances)
            
            // Use median as it's more robust to outliers
            // Multiply by factor to account for contacts that may span multiple consecutive segments
            consecutiveThreshold = medianConsecutiveDistance * DEFAULT_CONSECUTIVE_DISTANCE_MULTIPLIER
            
            // Log consecutive distance statistics
            console.log(`Consecutive vertex distances (ball-and-stick):`, {
                count: consecutiveDistances.length,
                mean: avgConsecutiveDistance.toFixed(2),
                median: medianConsecutiveDistance.toFixed(2),
                min: Math.min(...consecutiveDistances).toFixed(2),
                max: Math.max(...consecutiveDistances).toFixed(2),
                threshold: Math.floor(consecutiveThreshold)
            })
        }
    } else {
        console.log(`Skipping consecutive distance analysis (point cloud dataset)`)
    }
    
    // Phase 3: k-NN analysis (data-driven, captures local density)
    const sampleSize = Math.min(DEFAULT_SAMPLE_SIZE, validVertices.length)
    const nnDistances = computeKNNDistances(validVertices, DEFAULT_K, sampleSize)
    
    let nnThreshold = null
    let medianNN = null
    
    if (nnDistances.length > 0) {
        medianNN = median(nnDistances)
        nnThreshold = medianNN * DEFAULT_NN_MULTIPLIER
    }
    
    // Phase 4: Combine methods intelligently
    // Priority: consecutive distance > k-NN > heuristic
    // Use the most appropriate method based on what's available
    let threshold
    
    if (consecutiveThreshold !== null) {
        // For ball-and-stick, consecutive distance is most informative
        threshold = consecutiveThreshold
        
        // Refine with k-NN if available (use the smaller to prevent over-connecting)
        if (nnThreshold !== null) {
            threshold = Math.min(threshold, nnThreshold)
        }
        
        // Ensure we don't exceed heuristic (sanity check)
        threshold = Math.min(threshold, heuristicThreshold)
    } else if (nnThreshold !== null) {
        // Fallback to k-NN if consecutive distances unavailable
        threshold = Math.min(nnThreshold, heuristicThreshold)
    } else {
        // Final fallback to heuristic
        threshold = heuristicThreshold
    }
    
    // Phase 5: Safety bounds
    // Ensure threshold is reasonable (not too small, not too large)
    const minThreshold = Math.max(
        consecutiveThreshold ? consecutiveThreshold * 0.5 : (medianNN ? medianNN * DEFAULT_MIN_THRESHOLD_MULTIPLIER : 1),
        1
    )
    const maxThreshold = radius
    
    threshold = Math.max(minThreshold, Math.min(threshold, maxThreshold))
    
    // Phase 6: Optional refinement (only if initial threshold seems unreasonable)
    // Quick check: if contacts are too sparse or too dense, refine
    const quickCheck = quickContactCount(validVertices, traceLength, threshold)
    const density = quickCheck / (traceLength * traceLength)
    
    // If density is way off, do a simple adjustment
    if (density < 0.005 && threshold < maxThreshold) {
        // Too sparse, increase threshold slightly
        threshold = Math.min(threshold * 1.5, maxThreshold)
    } else if (density > 0.15 && threshold > minThreshold) {
        // Too dense, decrease threshold slightly
        threshold = Math.max(threshold * 0.7, minThreshold)
    }
    
    const finalThreshold = Math.floor(threshold)
    
    // Log threshold determination details for debugging
    console.log(`Auto threshold determination:`, {
        heuristic: Math.floor(heuristicThreshold),
        consecutive: consecutiveThreshold !== null ? Math.floor(consecutiveThreshold) : 'N/A',
        nnMedian: medianNN !== null ? medianNN.toFixed(2) : 'N/A',
        nnThreshold: nnThreshold !== null ? Math.floor(nnThreshold) : 'N/A',
        final: finalThreshold,
        density: (density * 100).toFixed(2) + '%'
    })
    
    return finalThreshold
}

/**
 * Estimate distance threshold for contact detection
 * Uses hybrid approach: combines radius-based heuristic with k-nearest neighbor analysis
 * 
 * @param {Object} trace - Trace object
 * @returns {number} Estimated threshold
 */
function distanceThresholdEstimate(trace) {
    // Get vertices for the current trace
    // Note: For point cloud datasets, vertex lists may not be initialized yet
    const vertices = ensembleManager.getLiveMapTraceVertices(trace)
    
    if (!vertices || vertices.length === 0) {
        // Fallback to simple heuristic
        // This handles cases where:
        // - Vertex lists aren't initialized yet (especially for point clouds)
        // - No valid vertices available
        const { radius } = EnsembleManager.getTraceBounds(trace)
        return Math.floor(radius / 2)
    }
    
    const traceLength = ensembleManager.getLiveMapTraceLength()
    
    // Use hybrid approach to determine threshold
    return autoDetermineThreshold(trace, vertices, traceLength)
}

export { defaultDistanceThreshold }

export default LiveContactMapService
