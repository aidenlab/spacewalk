import { distanceTo } from '../utils/mathUtils.js'

// Constants
// Value used to represent undefined/missing distance data in the distance matrix
const kDistanceUndefined = -1

/**
 * Main message handler for the distance map worker.
 * Processes vertex lists and calculates pairwise distances between all vertices.
 * 
 * IMPORTANT: The distance arrays are 1D arrays representing 2D matrices.
 * They have exactly traceLength * traceLength elements, where each position [i, j] 
 * in the 2D matrix maps to index [i * traceLength + j] in the 1D array.
 * Missing/invalid data positions remain as kDistanceUndefined (-1) at their
 * original indices - the array structure is never collapsed or compressed.
 */
self.addEventListener('message', ({ data }) => {

    if ('trace' === data.traceOrEnsemble) {

        const str = `Distance Map Worker - Update Trace Distance Array`
        console.time(str)

        const vertices = JSON.parse(data.verticesString)
        const { maxDistance, distances } = updateTraceDistanceArray(data.traceLength, vertices)

        console.timeEnd(str)

        const payload =
            {
                traceOrEnsemble: data.traceOrEnsemble,
                workerDistanceBuffer: distances,
                maxDistance
            }

        self.postMessage(payload, [ distances.buffer ])

    } else {

        const str = `Distance Map Worker - Update Ensemble Distance Array`
        console.time(str);

        const vertexLists = JSON.parse(data.vertexListsString)
        const { maxAverageDistance, averages } = updateEnsembleDistanceArray(data.traceLength, vertexLists)

        console.timeEnd(str)

        const payload =
            {
                traceOrEnsemble: data.traceOrEnsemble,
                workerDistanceBuffer: averages,
                maxDistance: maxAverageDistance
            }

        self.postMessage(payload, [ averages.buffer ])

    }

}, false)

/**
 * Calculate pairwise distances for a single trace.
 * Computes distances between all pairs of valid vertices and stores them in a 2D matrix.
 * 
 * CRITICAL: This function maintains the exact 2D matrix structure (traceLength x traceLength).
 * The distances array is a 1D representation of a 2D matrix where:
 * - Position [i, j] in 2D maps to index [i * traceLength + j] in 1D
 * - Missing/invalid vertices are skipped, but their positions remain as kDistanceUndefined
 * - The array size is ALWAYS exactly traceLength * traceLength - never collapsed
 * - validIndices stores the ORIGINAL trace positions (0 to traceLength-1), preserving index mapping
 * 
 * Algorithm: Uses O(n²) nested loops to compute ALL pairwise distances (intentional - we need every pair).
 * 
 * @param {number} traceLength - Length of the trace (defines m x n dimensions where m = n = traceLength)
 * @param {Array} vertices - Array of vertex objects with x, y, z, isMissingData properties
 * @returns {{maxDistance: number, distances: Float32Array}} Object containing the distance matrix and maximum distance
 * @throws {Error} If input parameters are invalid
 */
function updateTraceDistanceArray(traceLength, vertices) {

    // Input validation
    if (traceLength <= 0 || !Number.isInteger(traceLength)) {
        throw new Error(`Invalid traceLength: ${traceLength}`)
    }
    if (!Array.isArray(vertices)) {
        throw new Error('vertices must be an array')
    }

    // Early return if no vertices
    if (vertices.length === 0) {
        const distances = new Float32Array(traceLength * traceLength)
        distances.fill(kDistanceUndefined)
        return { maxDistance: Number.NEGATIVE_INFINITY, distances }
    }

    // Create exactly traceLength * traceLength array (2D matrix as 1D array)
    const distances = new Float32Array(traceLength * traceLength)
    distances.fill(kDistanceUndefined)

    // Filter out missing data and build parallel arrays for valid vertices
    // IMPORTANT: validIndices stores the ORIGINAL trace positions (0 to traceLength-1)
    // This preserves the exact index mapping to the 2D matrix structure.
    // Missing vertices are skipped, but their positions in distances remain undefined.
    // Use two-pass approach: count first, then allocate exact size
    let validCount = 0
    for (let i = 0; i < vertices.length; i++) {
        if (vertices[i].isMissingData !== true) {
            validCount++
        }
    }

    // Early return if no valid vertices
    if (validCount === 0) {
        return { maxDistance: Number.NEGATIVE_INFINITY, distances }
    }

    // Pre-allocate arrays with exact size
    // validIndices[idx] = i preserves the original trace position 'i'
    // This ensures output array indices match original trace positions
    const validVertices = new Array(validCount)
    const validIndices = new Array(validCount)
    let idx = 0
    for (let i = 0; i < vertices.length; i++) {
        if (vertices[i].isMissingData !== true) {
            validIndices[idx] = i  // Store ORIGINAL trace index, not sequential index
            validVertices[idx] = vertices[i]
            idx++
        }
    }

    let maxDistance = Number.NEGATIVE_INFINITY

    // Use boolean array instead of Set for better performance
    // Pre-allocate to avoid resizing
    const processed = new Array(validVertices.length).fill(false)

    // Validate array bounds once (defensive programming)
    const maxIndex = traceLength * traceLength - 1

    // Process each vertex
    // CRITICAL: x and y are ORIGINAL trace indices (0 to traceLength-1), not sequential indices
    // This ensures the 2D matrix structure is preserved exactly
    for (let v = 0; v < validVertices.length; v++) {

        // x is the ORIGINAL trace position (0 to traceLength-1)
        // This maps directly to row/column in the 2D matrix representation
        const x = validIndices[v]

        // Set diagonal to 0 (self-distance)
        // Position [x, x] in 2D matrix = index [x * traceLength + x] in 1D array
        const xy_diagonal = x * traceLength + x
        if (xy_diagonal <= maxIndex) {
            distances[xy_diagonal] = 0
        }

        // Mark current vertex as processed to avoid duplicate pairs
        processed[v] = true

        // Calculate distances to all other vertices
        // Note: O(n²) algorithm is intentional - we need ALL pairwise distances
        for (let w = 0; w < validVertices.length; w++) {

            // Skip if already processed (ensures we only count each pair once)
            if (!processed[w]) {

                const distance = distanceTo(validVertices[v], validVertices[w])

                // y is the ORIGINAL trace position (0 to traceLength-1)
                // This preserves the exact 2D matrix coordinate mapping
                const y = validIndices[w]

                // Calculate symmetric matrix indices
                // Position [x, y] in 2D matrix = index [x * traceLength + y] in 1D array
                // Position [y, x] in 2D matrix = index [y * traceLength + x] in 1D array
                // These indices map directly to the traceLength x traceLength matrix structure
                const ij = x * traceLength + y
                const ji = y * traceLength + x

                // Bounds check (shouldn't happen, but defensive)
                if (ij > maxIndex || ji > maxIndex) {
                    console.error(
                        `Index out of bounds: ij=${ij}, ji=${ji}, maxIndex=${maxIndex}, ` +
                        `traceLength=${traceLength}, x=${x}, y=${y}`
                    )
                    continue
                }

                // Store distance in symmetric positions
                distances[ij] = distances[ji] = distance

                maxDistance = Math.max(maxDistance, distance)
            }

        }

    }

    return { maxDistance, distances }

}

/**
 * Calculate ensemble-averaged distances across multiple vertex lists.
 * Computes incremental averages for each matrix position across all traces.
 * 
 * CRITICAL: This function maintains the exact 2D matrix structure (traceLength x traceLength).
 * The averages array is a 1D representation of a 2D matrix where:
 * - Position [i, j] in 2D maps to index [i * traceLength + j] in 1D
 * - Missing data values (kDistanceUndefined) do not participate in the average
 * - The array size is ALWAYS exactly traceLength * traceLength - never collapsed
 * 
 * Uses incremental averaging to efficiently compute running averages:
 * avg_k = avg_k-1 + (distance_k - avg_k-1) / k
 * 
 * @param {number} traceLength - Length of the trace (defines m x n dimensions where m = n = traceLength)
 * @param {Array<Array>} vertexLists - Array of vertex arrays to process (ensemble)
 * @returns {{maxAverageDistance: number, averages: Float32Array}} Object containing averaged distance matrix and maximum average distance
 * @throws {Error} If input parameters are invalid
 */
function updateEnsembleDistanceArray(traceLength, vertexLists) {

    // Input validation
    if (traceLength <= 0 || !Number.isInteger(traceLength)) {
        throw new Error(`Invalid traceLength: ${traceLength}`)
    }
    if (!Array.isArray(vertexLists)) {
        throw new Error('vertexLists must be an array')
    }

    // Early return if no vertex lists
    if (vertexLists.length === 0) {
        const averages = new Float32Array(traceLength * traceLength)
        averages.fill(kDistanceUndefined)
        return { maxAverageDistance: Number.NEGATIVE_INFINITY, averages }
    }

    // Create exactly traceLength * traceLength array (2D matrix as 1D array)
    const averages = new Float32Array(traceLength * traceLength)
    averages.fill(kDistanceUndefined)

    const counters = new Int32Array(traceLength * traceLength)
    counters.fill(0)

    // Process each vertex list in the ensemble
    for (let vertices of vertexLists) {

        const { maxDistance, distances } = updateTraceDistanceArray(traceLength, vertices)

        // We need to calculate an array of averages where the input data
        // can have missing - kDistanceUndefined - values

        // Loop over distance array
        for (let d = 0; d < distances.length; d++) {

            // Ignore missing data values. They do not participate in the average
            if (kDistanceUndefined === distances[d]) {
                // do nothing
            } else {

                // Keep track of how many samples we have at this array index
                ++counters[d]

                if (kDistanceUndefined === averages[d]) {

                    // If this is the first data value at this array index, copy it to average
                    averages[d] = distances[d]
                } else {

                    // When there is data AND a pre-existing average value at this array index
                    // use an incremental averaging approach.

                    // Incremental averaging: avg_k = avg_k-1 + (distance_k - avg_k-1) / k
                    // https://math.stackexchange.com/questions/106700/incremental-averageing
                    averages[d] = averages[d] + (distances[d] - averages[d]) / counters[d]
                }

            }
        }

    }

    // Find maximum average distance
    let maxAverageDistance = Number.NEGATIVE_INFINITY
    for (let avg of averages) {
        maxAverageDistance = Math.max(maxAverageDistance, avg)
    }

    return { maxAverageDistance, averages }
}

