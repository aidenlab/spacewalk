import KDBush from '../kd3d/kd3d.js'

// Constants
const kContactFrequencyUndefined = -1
// KDBush node size: 64 is optimal for most 3D spatial queries
// Smaller values = deeper tree = more memory, faster queries
// Larger values = shallower tree = less memory, slower queries
const KDBUSH_NODE_SIZE = 64

/**
 * Main message handler for the contact frequency map worker.
 * Processes vertex lists and calculates contact frequencies based on spatial proximity.
 * 
 * IMPORTANT: The contactFrequency array is a 1D array representing a 2D matrix.
 * It has exactly traceLength * traceLength elements, where each position [i, j] 
 * in the 2D matrix maps to index [i * traceLength + j] in the 1D array.
 * Missing/invalid data positions remain as kContactFrequencyUndefined (-1) at their
 * original indices - the array structure is never collapsed or compressed.
 */
self.addEventListener('message', ({ data }) => {

    const str = `Contact Frequency Map Worker - Calculate Frequency Values`
    console.time(str)

    // Create exactly traceLength * traceLength array (2D matrix as 1D array)
    const contactFrequency = new Float32Array(data.traceLength * data.traceLength)
    const vertexLists = 'trace' === data.traceOrEnsemble ? [ JSON.parse(data.verticesString) ] : JSON.parse(data.vertexListsString)
    calculateContactFrequencies(contactFrequency, data.traceLength, vertexLists, data.distanceThreshold)

    console.timeEnd(str)

    const payload =
        {
            traceOrEnsemble: data.traceOrEnsemble,
            workerValuesBuffer: contactFrequency
        }

    self.postMessage(payload, [ contactFrequency.buffer ])

}, false)

/**
 * Calculate contact frequencies across multiple vertex lists (ensemble).
 * Accumulates frequencies from each vertex list.
 * 
 * @param {Float32Array} contactFrequency - Pre-allocated array to store results
 * @param {number} traceLength - Length of the trace
 * @param {Array<Array>} vertexLists - Array of vertex arrays to process
 * @param {number} distanceThreshold - Maximum distance for contact detection
 */
function calculateContactFrequencies(contactFrequency, traceLength, vertexLists, distanceThreshold) {
    contactFrequency.fill(kContactFrequencyUndefined)
    for (let vertices of vertexLists) {
        accumulateContactFrequencies(contactFrequency, traceLength, vertices, distanceThreshold)
    }
}

/**
 * Accumulate contact frequencies for a single vertex list.
 * Uses spatial indexing (KDBush) for efficient proximity queries.
 * 
 * CRITICAL: This function maintains the exact 2D matrix structure (traceLength x traceLength).
 * The contactFrequency array is a 1D representation of a 2D matrix where:
 * - Position [i, j] in 2D maps to index [i * traceLength + j] in 1D
 * - Missing/invalid vertices are skipped, but their positions remain as kContactFrequencyUndefined
 * - The array size is ALWAYS exactly traceLength * traceLength - never collapsed
 * - validIndices stores the ORIGINAL trace positions (0 to traceLength-1), preserving index mapping
 * 
 * @param {Float32Array} contactFrequency - Array to accumulate frequencies into (size: traceLength * traceLength)
 * @param {number} traceLength - Length of the trace (defines m x n dimensions where m = n = traceLength)
 * @param {Array} vertices - Array of vertex objects with x, y, z, isMissingData properties
 * @param {number} distanceThreshold - Maximum distance for contact detection
 * @throws {Error} If input parameters are invalid
 */
function accumulateContactFrequencies(contactFrequency, traceLength, vertices, distanceThreshold) {

    // Input validation
    if (!contactFrequency || !(contactFrequency instanceof Float32Array)) {
        throw new Error('contactFrequency must be a Float32Array')
    }
    if (traceLength <= 0 || !Number.isInteger(traceLength)) {
        throw new Error(`Invalid traceLength: ${traceLength}`)
    }
    if (contactFrequency.length !== traceLength * traceLength) {
        throw new Error(`contactFrequency length ${contactFrequency.length} doesn't match traceLength^2 ${traceLength * traceLength}`)
    }
    if (!Array.isArray(vertices)) {
        throw new Error('vertices must be an array')
    }
    if (distanceThreshold < 0 || !isFinite(distanceThreshold)) {
        throw new Error(`Invalid distanceThreshold: ${distanceThreshold}`)
    }

    // Early return if no vertices
    if (vertices.length === 0) {
        return
    }

    // Filter out missing data and build parallel arrays for valid vertices
    // IMPORTANT: validIndices stores the ORIGINAL trace positions (0 to traceLength-1)
    // This preserves the exact index mapping to the 2D matrix structure.
    // Missing vertices are skipped, but their positions in contactFrequency remain undefined.
    // Use two-pass approach: count first, then allocate exact size
    let validCount = 0
    for (let i = 0; i < vertices.length; i++) {
        if (vertices[i].isMissingData !== true) {
            validCount++
        }
    }

    // Early return if no valid vertices
    if (validCount === 0) {
        return
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

    // Build spatial index once for this vertex list
    const spatialIndex = new KDBush(kdBushConfiguratorWithTrace(validVertices))

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
        const vertex = validVertices[v]
        
        // Set diagonal to 1 (self-contact)
        // Position [x, x] in 2D matrix = index [x * traceLength + x] in 1D array
        // Note: For ensembles, diagonal represents self-contact and is always 1,
        // not accumulated across traces. If accumulation is needed, this should be changed.
        const diagonalIndex = x * traceLength + x
        if (diagonalIndex <= maxIndex) {
            contactFrequency[diagonalIndex] = 1
        }

        // Mark current vertex as processed to avoid duplicate pairs
        processed[v] = true

        // Query spatial index for nearby vertices
        const nearbyIndices = spatialIndex.within(
            vertex.x, 
            vertex.y, 
            vertex.z, 
            distanceThreshold
        )

        // Iterate directly over results, skipping processed vertices
        // This avoids creating a new array with filter() on every iteration
        for (const contactIndex of nearbyIndices) {
            // Skip if already processed (ensures we only count each pair once)
            if (processed[contactIndex]) {
                continue
            }

            // y is the ORIGINAL trace position (0 to traceLength-1)
            // This preserves the exact 2D matrix coordinate mapping
            const y = validIndices[contactIndex]
            
            // Calculate symmetric matrix indices
            // Position [x, y] in 2D matrix = index [x * traceLength + y] in 1D array
            // Position [y, x] in 2D matrix = index [y * traceLength + x] in 1D array
            // These indices map directly to the traceLength x traceLength matrix structure
            const xy = x * traceLength + y
            const yx = y * traceLength + x

            // Bounds check (shouldn't happen, but defensive)
            if (xy > maxIndex || yx > maxIndex) {
                console.error(
                    `Index out of bounds: xy=${xy}, yx=${yx}, maxIndex=${maxIndex}, ` +
                    `traceLength=${traceLength}, x=${x}, y=${y}`
                )
                continue
            }

            // Accumulate contact frequency
            // If undefined, initialize to 1; otherwise increment
            if (contactFrequency[xy] === kContactFrequencyUndefined) {
                contactFrequency[xy] = 1
            } else {
                contactFrequency[xy] += 1
            }
            
            // Maintain symmetry (contactFrequency[xy] === contactFrequency[yx])
            contactFrequency[yx] = contactFrequency[xy]

        } // for (nearbyIndices)

    } // for (v)

}

/**
 * Creates configuration object for KDBush spatial index.
 * 
 * @param {Array} vertices - Array of vertex objects with x, y, z properties
 * @returns {Object} Configuration object for KDBush constructor with properties:
 *   - idList: Array of indices
 *   - points: Array of vertex objects
 *   - getX, getY, getZ: Accessor functions for coordinates
 *   - nodeSize: Optimal node size for 3D queries
 *   - ArrayType: Float64Array for coordinate storage
 *   - axisCount: 3 for 3D space
 */
function kdBushConfiguratorWithTrace(vertices) {

    return {
        idList: vertices.map((vertex, index) => index),
        points: vertices,
        getX: pt => pt.x,
        getY: pt => pt.y,
        getZ: pt => pt.z,
        nodeSize: KDBUSH_NODE_SIZE,
        ArrayType: Float64Array,
        axisCount: 3
    }

}
