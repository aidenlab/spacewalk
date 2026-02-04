import {ensembleManager, juiceboxPanel, liveDistanceMapService} from "../app.js"
import EnsembleManager from "../ensembleManager.js"
import SpacewalkEventBus from "../spacewalkEventBus.js"
import {hideGlobalSpinner, showGlobalSpinner} from "../utils/utils.js"
import {clamp, distanceTo} from "../utils/mathUtils.js"
import {enableLiveMaps} from "../utils/liveMapUtils.js"
import {postMessageToWorker} from "../utils/webWorkerUtils.js"
import KDBush from '../kd3d/kd3d.js'

const maxDistanceThreshold = 1e4
const defaultDistanceThreshold = 256

// Constants for automatic threshold determination
const DEFAULT_K = 3  // Number of nearest neighbors to analyze
const DEFAULT_SAMPLE_SIZE = 200  // Number of vertices to sample for k-NN analysis
const DEFAULT_NN_MULTIPLIER = 2.0  // Multiplier for median nearest neighbor distance
const DEFAULT_MIN_THRESHOLD_MULTIPLIER = 1.2  // Minimum threshold multiplier
const DEFAULT_CONSECUTIVE_DISTANCE_MULTIPLIER = 3.5  // Multiplier for consecutive vertex distance threshold
const DEFAULT_CONSECUTIVE_DISTANCE_PERCENTILE = 75  // Percentile to use for consecutive distance baseline (p75 for more inclusive threshold)
const DEFAULT_TRACE_SAMPLE_SIZE = 30  // Number of traces to sample for multi-trace consecutive distance analysis
const KDBUSH_NODE_SIZE = 64  // KDBush node size for spatial indexing

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

    async receiveEvent({ type, data }) {

        if ("DidLoadEnsembleFile" === type) {

            // Safety check: ctx_live may not exist yet if browser isn't fully initialized
            if (juiceboxPanel?.browser?.contactMatrixView?.ctx_live) {
                juiceboxPanel.browser.contactMatrixView.ctx_live.transferFromImageBitmap(null)
            }

            this.contactFrequencies = undefined
            this.rgbaMatrix = undefined

            this.distanceThreshold = await distanceThresholdEstimate(ensembleManager.currentTrace)

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

            this.distanceThreshold = distanceThresholdOrUndefined || await distanceThresholdEstimate(ensembleManager.currentTrace)
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
 * Sample traces randomly for efficient multi-trace analysis
 * @param {number} totalTraces - Total number of traces available
 * @param {number} sampleSize - Number of traces to sample
 * @returns {Array<number>} Array of trace indices to sample
 */
function sampleTraceIndices(totalTraces, sampleSize) {
    if (totalTraces <= sampleSize) {
        // Return all trace indices if we have fewer traces than sample size
        return Array.from({ length: totalTraces }, (_, i) => i)
    }
    
    const sampled = []
    const indices = new Set()
    
    while (sampled.length < sampleSize) {
        const idx = Math.floor(Math.random() * totalTraces)
        if (!indices.has(idx)) {
            indices.add(idx)
            sampled.push(idx)
        }
    }
    
    return sampled
}

/**
 * Compute consecutive vertex distances across multiple traces
 * Samples a subset of traces and aggregates consecutive distances from all sampled traces
 * 
 * @param {Array<Array>} vertexLists - Array of vertex arrays, one per trace
 * @param {number} sampleSize - Number of traces to sample
 * @returns {Object} Object with:
 *   - distances: Array of all consecutive distances across sampled traces
 *   - traceCount: Number of traces sampled
 *   - totalDistances: Total number of consecutive distances collected
 */
function computeMultiTraceConsecutiveDistances(vertexLists, sampleSize) {
    if (!vertexLists || vertexLists.length === 0) {
        return { distances: [], traceCount: 0, totalDistances: 0 }
    }
    
    // Determine how many traces to sample
    const actualSampleSize = Math.min(sampleSize, vertexLists.length)
    const traceIndices = sampleTraceIndices(vertexLists.length, actualSampleSize)
    
    const allDistances = []
    let validTraceCount = 0
    
    // Compute consecutive distances for each sampled trace
    for (const traceIndex of traceIndices) {
        const vertices = vertexLists[traceIndex]
        if (!vertices || vertices.length === 0) {
            continue
        }
        
        const consecutiveDistances = computeConsecutiveVertexDistances(vertices)
        
        if (consecutiveDistances.length > 0) {
            allDistances.push(...consecutiveDistances)
            validTraceCount++
        }
    }
    
    return {
        distances: allDistances,
        traceCount: validTraceCount,
        totalDistances: allDistances.length
    }
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
        // Try multi-trace sampling first (more robust)
        const vertexLists = ensembleManager.getLiveMapVertexLists()
        
        if (vertexLists && vertexLists.length > 1) {
            // Use multi-trace sampling for better ensemble representation
            const multiTraceResult = computeMultiTraceConsecutiveDistances(vertexLists, DEFAULT_TRACE_SAMPLE_SIZE)
            
            if (multiTraceResult.totalDistances > 0) {
                const allDistances = multiTraceResult.distances
                const avgConsecutiveDistance = allDistances.reduce((a, b) => a + b, 0) / allDistances.length
                const medianConsecutiveDistance = median(allDistances)
                
                // Calculate percentiles for better understanding of distribution
                const sorted = [...allDistances].sort((a, b) => a - b)
                const p25 = sorted[Math.floor(sorted.length * 0.25)]
                const p75 = sorted[Math.floor(sorted.length * 0.75)]
                const p90 = sorted[Math.floor(sorted.length * 0.90)]
                
                // Use p75 (or p90) instead of median for more inclusive threshold
                // This captures medium-range contacts that appear in more traces, creating better frequency variation
                // p75 provides a good balance: more inclusive than median, but not as extreme as max
                const baselineDistance = p75 || medianConsecutiveDistance
                
                // Multiply by factor to account for contacts that may span multiple consecutive segments
                // Higher multiplier creates more variation in contact frequencies across the ensemble
                consecutiveThreshold = baselineDistance * DEFAULT_CONSECUTIVE_DISTANCE_MULTIPLIER
                
                // Log multi-trace consecutive distance statistics
                console.log(`Multi-trace consecutive vertex distances (ball-and-stick):`, {
                    tracesSampled: multiTraceResult.traceCount,
                    totalTraces: vertexLists.length,
                    totalDistances: multiTraceResult.totalDistances,
                    mean: avgConsecutiveDistance.toFixed(2),
                    median: medianConsecutiveDistance.toFixed(2),
                    p25: p25.toFixed(2),
                    p75: p75.toFixed(2),
                    p90: p90.toFixed(2),
                    min: Math.min(...allDistances).toFixed(2),
                    max: Math.max(...allDistances).toFixed(2),
                    baselineUsed: 'p75',
                    multiplier: DEFAULT_CONSECUTIVE_DISTANCE_MULTIPLIER,
                    threshold: Math.floor(consecutiveThreshold)
                })
            } else {
                // Fallback to single-trace if multi-trace sampling produced no results
                console.log(`Multi-trace sampling produced no distances, falling back to single-trace analysis`)
                const consecutiveDistances = computeConsecutiveVertexDistances(vertices)
                
                if (consecutiveDistances.length > 0) {
                    const avgConsecutiveDistance = consecutiveDistances.reduce((a, b) => a + b, 0) / consecutiveDistances.length
                    const medianConsecutiveDistance = median(consecutiveDistances)
                    
                    // For single-trace fallback, use p75 if possible, otherwise median
                    const sorted = [...consecutiveDistances].sort((a, b) => a - b)
                    const p75 = sorted[Math.floor(sorted.length * 0.75)]
                    const baselineDistance = p75 || medianConsecutiveDistance
                    
                    consecutiveThreshold = baselineDistance * DEFAULT_CONSECUTIVE_DISTANCE_MULTIPLIER
                    
                    console.log(`Consecutive vertex distances (single-trace fallback):`, {
                        count: consecutiveDistances.length,
                        mean: avgConsecutiveDistance.toFixed(2),
                        median: medianConsecutiveDistance.toFixed(2),
                        min: Math.min(...consecutiveDistances).toFixed(2),
                        max: Math.max(...consecutiveDistances).toFixed(2),
                        threshold: Math.floor(consecutiveThreshold)
                    })
                }
            }
        } else {
            // Fallback to single-trace if vertex lists not available or only one trace
            const consecutiveDistances = computeConsecutiveVertexDistances(vertices)
            
            if (consecutiveDistances.length > 0) {
                const avgConsecutiveDistance = consecutiveDistances.reduce((a, b) => a + b, 0) / consecutiveDistances.length
                const medianConsecutiveDistance = median(consecutiveDistances)
                
                // Use p75 if possible for more inclusive threshold
                const sorted = [...consecutiveDistances].sort((a, b) => a - b)
                const p75 = sorted[Math.floor(sorted.length * 0.75)]
                const baselineDistance = p75 || medianConsecutiveDistance
                
                consecutiveThreshold = baselineDistance * DEFAULT_CONSECUTIVE_DISTANCE_MULTIPLIER
                
                console.log(`Consecutive vertex distances (single-trace):`, {
                    count: consecutiveDistances.length,
                    mean: avgConsecutiveDistance.toFixed(2),
                    median: medianConsecutiveDistance.toFixed(2),
                    min: Math.min(...consecutiveDistances).toFixed(2),
                    max: Math.max(...consecutiveDistances).toFixed(2),
                    threshold: Math.floor(consecutiveThreshold)
                })
            }
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
 * First tries to use distance-map-derived threshold (fast and data-driven)
 * Falls back to hybrid approach if distance map not available
 * 
 * @param {Object} trace - Trace object
 * @returns {Promise<number>} Estimated threshold
 */
async function distanceThresholdEstimate(trace) {
    // Strategy: Use distance map results if available (faster and more accurate)
    // Check if distance map service has already computed a threshold
    if (liveDistanceMapService && liveDistanceMapService.computedContactThreshold !== undefined && 
        liveDistanceMapService.computedContactThreshold !== null) {
        console.log(`Using distance-map-derived contact threshold: ${liveDistanceMapService.computedContactThreshold.toFixed(2)}`)
        return Math.floor(liveDistanceMapService.computedContactThreshold)
    }
    
    // Check if distance map data exists but threshold not computed yet
    if (liveDistanceMapService && liveDistanceMapService.distances && liveDistanceMapService.maxDistance) {
        // Compute threshold from existing distance data
        const threshold = computeContactThresholdFromDistances(
            liveDistanceMapService.distances, 
            liveDistanceMapService.maxDistance
        )
        if (threshold !== null) {
            liveDistanceMapService.computedContactThreshold = threshold
            console.log(`Computed contact threshold from existing distance map: ${threshold.toFixed(2)}`)
            return Math.floor(threshold)
        }
    }
    
    // If no distance map available, trigger quick distance map calculation for ensemble
    // This is the "hack" - use fast distance map to bootstrap contact map threshold
    const vertexLists = ensembleManager.getLiveMapVertexLists()
    if (vertexLists && vertexLists.length > 0) {
        try {
            console.log('No distance map found - triggering quick distance map calculation to derive contact threshold...')
            const traceLength = ensembleManager.getLiveMapTraceLength()
            
            // Trigger distance map calculation (this will compute threshold as side effect)
            await liveDistanceMapService.updateEnsembleAverageDistanceCanvas(traceLength)
            
            // Check if threshold was computed
            if (liveDistanceMapService.computedContactThreshold !== undefined && 
                liveDistanceMapService.computedContactThreshold !== null) {
                console.log(`Using distance-map-derived contact threshold: ${liveDistanceMapService.computedContactThreshold.toFixed(2)}`)
                return Math.floor(liveDistanceMapService.computedContactThreshold)
            }
        } catch (err) {
            console.warn('Failed to compute distance map for threshold estimation:', err)
            // Fall through to hybrid approach
        }
    }
    
    // Fallback to hybrid approach (consecutive distances + k-NN)
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

/**
 * Compute contact map threshold from distance map distribution
 * (Duplicated from liveDistanceMapService for use here)
 * 
 * @param {Float32Array} distances - Distance array from distance map
 * @param {number} maxDistance - Maximum distance in the dataset
 * @returns {number|null} Recommended contact threshold, or null if insufficient data
 */
function computeContactThresholdFromDistances(distances, maxDistance) {
    const kDistanceUndefined = -1
    
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
    
    return threshold
}

/**
 * Compute percentile from sorted array
 * @param {Array<number>} sortedValues - Sorted array
 * @param {number} percentileValue - Percentile (0-100)
 * @returns {number} Value at percentile
 */
function percentile(sortedValues, percentileValue) {
    if (sortedValues.length === 0) return 0
    if (sortedValues.length === 1) return sortedValues[0]
    if (percentileValue <= 0) return sortedValues[0]
    if (percentileValue >= 100) return sortedValues[sortedValues.length - 1]
    
    const index = (percentileValue / 100) * (sortedValues.length - 1)
    const lowerIndex = Math.floor(index)
    const upperIndex = Math.ceil(index)
    const weight = index - lowerIndex
    
    return sortedValues[lowerIndex] * (1 - weight) + sortedValues[upperIndex] * weight
}

export { defaultDistanceThreshold }

export default LiveContactMapService
