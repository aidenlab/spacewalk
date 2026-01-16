/**
 * General-purpose statistics utility functions
 * Focused on Float32Array for performance, but supports regular arrays
 */

/**
 * Compute percentile value from sorted array
 * Uses linear interpolation for non-integer percentiles
 * 
 * @param {Array<number>} sortedValues - Sorted array of numbers
 * @param {number} percentile - Percentile value (0-100)
 * @returns {number} Value at the specified percentile
 */
function percentile(sortedValues, percentile) {
    if (sortedValues.length === 0) {
        return 0
    }
    
    if (sortedValues.length === 1) {
        return sortedValues[0]
    }
    
    if (percentile <= 0) {
        return sortedValues[0]
    }
    
    if (percentile >= 100) {
        return sortedValues[sortedValues.length - 1]
    }
    
    // Calculate index using linear interpolation
    const index = (percentile / 100) * (sortedValues.length - 1)
    const lowerIndex = Math.floor(index)
    const upperIndex = Math.ceil(index)
    const weight = index - lowerIndex
    
    // Linear interpolation between adjacent values
    return sortedValues[lowerIndex] * (1 - weight) + sortedValues[upperIndex] * weight
}

/**
 * Compute arithmetic mean of values
 * 
 * @param {Array<number>} values - Array of numbers
 * @returns {number} Mean value
 */
function mean(values) {
    if (values.length === 0) {
        return 0
    }
    
    const sum = values.reduce((acc, val) => acc + val, 0)
    return sum / values.length
}

/**
 * Compute median value
 * 
 * @param {Array<number>} values - Array of numbers (will be sorted)
 * @returns {number} Median value
 */
function median(values) {
    if (values.length === 0) {
        return 0
    }
    
    const sorted = [...values].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    
    if (sorted.length % 2 === 0) {
        return (sorted[mid - 1] + sorted[mid]) / 2
    } else {
        return sorted[mid]
    }
}

/**
 * Compute population standard deviation
 * 
 * @param {Array<number>} values - Array of numbers
 * @returns {number} Standard deviation
 */
function standardDeviation(values) {
    if (values.length === 0) {
        return 0
    }
    
    const avg = mean(values)
    const squareDiffs = values.map(val => Math.pow(val - avg, 2))
    const avgSquareDiff = mean(squareDiffs)
    
    return Math.sqrt(avgSquareDiff)
}

/**
 * Filter valid values from array (removes undefined, -1, NaN, and optionally values <= 0)
 * 
 * @param {Float32Array|Array<number>} values - Input array
 * @param {Function} customFilter - Optional custom filter function
 * @returns {Array<number>} Filtered array of valid values
 */
function filterValidValues(values, customFilter) {
    const defaultFilter = (v) => {
        return v !== undefined && 
               v !== null && 
               !isNaN(v) && 
               isFinite(v) && 
               v !== -1
    }
    
    const filter = customFilter || defaultFilter
    const result = []
    
    for (let i = 0; i < values.length; i++) {
        const val = values[i]
        if (filter(val)) {
            result.push(val)
        }
    }
    
    return result
}

/**
 * Compute comprehensive statistics for an array of values
 * 
 * @param {Float32Array|Array<number>} values - Input array
 * @param {Object} options - Configuration options
 * @param {Function} options.filter - Custom filter function for valid values
 * @param {boolean} options.includePositiveOnly - If true, filter out values <= 0 (default: false)
 * @returns {Object} Statistics object with:
 *   - count: number of valid values
 *   - min, max: minimum and maximum values
 *   - mean, median: central tendency measures
 *   - stdDev: standard deviation
 *   - percentiles: object with p2, p5, p10, p25, p50, p75, p90, p95, p98
 *   - sparsity: ratio of valid values to total array length
 */
function computeStatistics(values, options = {}) {
    const { filter, includePositiveOnly = false } = options
    
    // Build filter function
    let valueFilter = filter
    if (!valueFilter && includePositiveOnly) {
        valueFilter = (v) => {
            return v !== undefined && 
                   v !== null && 
                   !isNaN(v) && 
                   isFinite(v) && 
                   v !== -1 && 
                   v > 0
        }
    }
    
    // Filter valid values
    const validValues = filterValidValues(values, valueFilter)
    
    if (validValues.length === 0) {
        // Return empty statistics
        return {
            count: 0,
            min: 0,
            max: 0,
            mean: 0,
            median: 0,
            stdDev: 0,
            percentiles: {
                p2: 0, p5: 0, p10: 0, p25: 0, p50: 0, p75: 0, p90: 0, p95: 0, p98: 0
            },
            sparsity: 0
        }
    }
    
    // Sort for percentile calculation (only once)
    const sorted = [...validValues].sort((a, b) => a - b)
    
    // Compute basic statistics
    const min = sorted[0]
    const max = sorted[sorted.length - 1]
    const meanValue = mean(validValues)
    const medianValue = median(validValues)
    const stdDevValue = standardDeviation(validValues)
    
    // Compute percentiles
    const percentiles = {
        p2: percentile(sorted, 2),
        p5: percentile(sorted, 5),
        p10: percentile(sorted, 10),
        p25: percentile(sorted, 25),
        p50: percentile(sorted, 50),
        p75: percentile(sorted, 75),
        p90: percentile(sorted, 90),
        p95: percentile(sorted, 95),
        p98: percentile(sorted, 98)
    }
    
    // Compute sparsity
    const sparsity = validValues.length / values.length
    
    return {
        count: validValues.length,
        min,
        max,
        mean: meanValue,
        median: medianValue,
        stdDev: stdDevValue,
        percentiles,
        sparsity
    }
}

/**
 * Normalize a value to 0-1 range based on percentile range
 * Values below minPercentile map to 0, values above maxPercentile map to 1
 * 
 * @param {number} value - Value to normalize
 * @param {number} minPercentile - Minimum percentile (e.g., 5 for 5th percentile)
 * @param {number} maxPercentile - Maximum percentile (e.g., 95 for 95th percentile)
 * @param {Object} stats - Statistics object from computeStatistics
 * @returns {number} Normalized value in range [0, 1]
 */
function normalizeToPercentileRange(value, minPercentile, maxPercentile, stats) {
    if (stats.count === 0) {
        return 0
    }
    
    // Get percentile values
    const minValue = stats.percentiles[`p${minPercentile}`] || stats.min
    const maxValue = stats.percentiles[`p${maxPercentile}`] || stats.max
    
    // Handle edge case where percentile range is zero (all values same)
    if (maxValue === minValue) {
        // If value equals the single value, return 0.5, otherwise return 0 or 1
        if (value === minValue) {
            return 0.5
        } else if (value < minValue) {
            return 0
        } else {
            return 1
        }
    }
    
    // Normalize: clamp value to percentile range, then map to 0-1
    const clampedValue = Math.max(minValue, Math.min(value, maxValue))
    const normalized = (clampedValue - minValue) / (maxValue - minValue)
    
    return Math.max(0, Math.min(1, normalized))
}

/**
 * Normalize a value using percentile range, but allow values outside range
 * to extend beyond 0-1 (useful for highlighting outliers)
 * 
 * @param {number} value - Value to normalize
 * @param {number} minPercentile - Minimum percentile
 * @param {number} maxPercentile - Maximum percentile
 * @param {Object} stats - Statistics object
 * @returns {number} Normalized value (may be < 0 or > 1 if outside percentile range)
 */
function normalizeToPercentileRangeExtended(value, minPercentile, maxPercentile, stats) {
    if (stats.count === 0) {
        return 0
    }
    
    const minValue = stats.percentiles[`p${minPercentile}`] || stats.min
    const maxValue = stats.percentiles[`p${maxPercentile}`] || stats.max
    
    if (maxValue === minValue) {
        if (value === minValue) {
            return 0.5
        } else if (value < minValue) {
            return -1 // Indicates below range
        } else {
            return 2 // Indicates above range
        }
    }
    
    // Don't clamp - allow extension beyond 0-1
    return (value - minValue) / (maxValue - minValue)
}

export {
    computeStatistics,
    percentile,
    mean,
    median,
    standardDeviation,
    normalizeToPercentileRange,
    normalizeToPercentileRangeExtended,
    filterValidValues
}
