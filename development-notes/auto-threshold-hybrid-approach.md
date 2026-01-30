# Automatic Threshold Determination: Hybrid Approach

## Overview

This document describes a hybrid approach for automatically determining the optimal distance threshold for contact map calculations in the live contact map worker. The approach combines multiple methods to balance accuracy, performance, and adaptability.

## Problem Statement

Currently, the distance threshold for determining which vertices are considered "in contact" is manually set by the user (e.g., "32"). This requires iterative adjustment:
- **Too high**: Everything is considered in contact (over-connected, uninformative)
- **Too low**: Nothing is in contact (under-connected, no visualization)
- **Optimal**: Meaningful contacts are detected, providing useful visualization

The goal is to automatically determine a reasonable threshold that works across different trace sizes and structures.

## Hybrid Approach Components

The hybrid approach combines three complementary methods:

1. **Radius-based heuristic** (baseline, fast)
2. **k-Nearest Neighbor (k-NN) analysis** (data-driven, efficient)
3. **Optional binary search refinement** (fine-tuning, if needed)

---

## Step-by-Step Breakdown

### Step 1: Radius-Based Heuristic (Baseline)

**Current Implementation:**
```javascript
function distanceThresholdEstimate(trace) {
    const { radius } = EnsembleManager.getTraceBounds(trace)
    return Math.floor(2 * radius / 4)  // = radius / 2
}
```

**What It Does:**
- Computes the bounding sphere radius of the trace
- Uses `radius / 2` as a baseline threshold
- Assumes contacts occur within half the trace's spatial extent

**Why It Works:**
- Very fast (O(n) to compute bounds)
- Provides a reasonable starting point
- Works across different trace sizes

**Limitations:**
- Doesn't account for local density variations
- May be too large for compact traces
- May be too small for extended/linear traces

**Complexity:** O(n) - linear time to compute bounding box

---

### Step 2: k-Nearest Neighbor Analysis (Data-Driven)

**Concept:** Analyze local structure by computing distances to k nearest neighbors for a sample of vertices.

**Algorithm:**
```javascript
function computeKNNDistances(vertices, k, sampleSize) {
    // 1. Sample vertices (for efficiency)
    const sample = sampleVertices(vertices, sampleSize)
    
    // 2. Build spatial index (reuse KDBush)
    const spatialIndex = new KDBush(createKDBushConfig(vertices))
    
    // 3. For each sampled vertex, find k nearest neighbors
    const nnDistances = []
    for (const vertex of sample) {
        // Query for k+1 neighbors (includes self)
        const neighbors = spatialIndex.within(
            vertex.x, vertex.y, vertex.z, 
            Infinity  // Large radius to get all neighbors
        )
        // Sort by distance and take k nearest (excluding self)
        const distances = neighbors
            .map(idx => distanceTo(vertex, vertices[idx]))
            .sort((a, b) => a - b)
            .slice(1, k + 1)  // Skip self (distance 0)
        
        nnDistances.push(...distances)
    }
    
    return nnDistances
}
```

**Why This Works:**
- Captures local density variations
- Uses existing spatial index (efficient)
- Adapts to trace structure automatically

**Key Parameters:**
- **k**: Number of neighbors (typically 3-5)
- **sampleSize**: Number of vertices to sample (e.g., 100-500)

**Complexity:** O(sample × log n) - efficient due to spatial indexing

---

### Step 3: Combine Methods

Combine the heuristic and k-NN results:

```javascript
function autoDetermineThreshold(vertices, trace) {
    // Step 1: Radius-based heuristic
    const { radius } = EnsembleManager.getTraceBounds(trace)
    const heuristicThreshold = radius / 2
    
    // Step 2: k-NN analysis
    const k = 3  // Use 3 nearest neighbors
    const sampleSize = Math.min(200, vertices.length)
    const nnDistances = computeKNNDistances(vertices, k, sampleSize)
    
    // Compute statistics
    const medianNN = median(nnDistances)
    const meanNN = mean(nnDistances)
    
    // Use 2x median as threshold (captures local structure)
    const nnThreshold = medianNN * 2
    
    // Step 3: Combine - use the more conservative (smaller) value
    // This prevents over-connecting while ensuring some contacts
    let threshold = Math.min(heuristicThreshold, nnThreshold)
    
    // Step 4: Safety bounds
    // Ensure threshold is reasonable (not too small, not too large)
    const minThreshold = Math.max(medianNN * 1.2, 1)  // At least 1.2x nearest neighbor
    const maxThreshold = radius  // Never exceed trace radius
    
    threshold = Math.max(minThreshold, Math.min(threshold, maxThreshold))
    
    return Math.floor(threshold)
}
```

**Rationale:**
- Uses the **smaller** of the two to prevent over-connecting
- Falls back to heuristic if k-NN fails
- Applies safety bounds to ensure reasonable values

---

### Step 4: Optional Refinement (Binary Search)

If the initial threshold produces too few or too many contacts, refine it:

```javascript
async function refineThreshold(vertices, traceLength, initialThreshold) {
    const TARGET_CONTACT_DENSITY = 0.02  // 2% of possible pairs
    const TOLERANCE = 0.005  // ±0.5% tolerance
    
    let low = initialThreshold * 0.5
    let high = initialThreshold * 2.0
    let bestThreshold = initialThreshold
    
    // Binary search for optimal threshold
    for (let iteration = 0; iteration < 10; iteration++) {
        const testThreshold = (low + high) / 2
        
        // Quick test: compute contacts for a sample
        const contactCount = await quickContactCount(
            vertices, traceLength, testThreshold
        )
        
        const density = contactCount / (traceLength * traceLength)
        
        if (Math.abs(density - TARGET_CONTACT_DENSITY) < TOLERANCE) {
            return Math.floor(testThreshold)
        }
        
        if (density < TARGET_CONTACT_DENSITY) {
            low = testThreshold  // Need more contacts
        } else {
            high = testThreshold  // Too many contacts
        }
        
        bestThreshold = testThreshold
    }
    
    return Math.floor(bestThreshold)
}
```

**When to Use:**
- Only if initial threshold is clearly off
- Can be expensive, so use sparingly
- Useful for fine-tuning

**Complexity:** O(iterations × sample) - typically 5-10 iterations

---

## Complete Implementation Flow

```javascript
async function autoDetermineThreshold(vertices, trace, traceLength) {
    // Phase 1: Quick heuristic (always fast)
    const { radius } = EnsembleManager.getTraceBounds(trace)
    const heuristicThreshold = radius / 2
    
    // Phase 2: k-NN analysis (moderately fast, ~O(n log n) for sample)
    const k = 3
    const sampleSize = Math.min(200, vertices.length)
    const nnDistances = computeKNNDistances(vertices, k, sampleSize)
    
    if (nnDistances.length === 0) {
        // Fallback: use heuristic only
        return Math.floor(heuristicThreshold)
    }
    
    const medianNN = median(nnDistances)
    const nnThreshold = medianNN * 2
    
    // Phase 3: Combine methods
    let threshold = Math.min(heuristicThreshold, nnThreshold)
    
    // Phase 4: Safety bounds
    const minThreshold = Math.max(medianNN * 1.2, 1)
    const maxThreshold = radius
    threshold = Math.max(minThreshold, Math.min(threshold, maxThreshold))
    
    // Phase 5: Optional refinement (only if needed)
    // Check if initial threshold seems reasonable
    const quickCheck = await quickContactCount(vertices, traceLength, threshold)
    const density = quickCheck / (traceLength * traceLength)
    
    if (density < 0.01 || density > 0.1) {
        // Threshold seems off, refine it
        threshold = await refineThreshold(vertices, traceLength, threshold)
    }
    
    return Math.floor(threshold)
}
```

---

## Performance Characteristics

| Phase | Complexity | Typical Time | Notes |
|-------|-----------|--------------|-------|
| Radius heuristic | O(n) | <1ms | Always fast |
| k-NN analysis | O(sample × log n) | 10-50ms | Sample size matters |
| Combination | O(1) | <1ms | Simple math |
| Refinement (optional) | O(iterations × sample) | 50-200ms | Only if needed |

**Total Typical Time:** 10-50ms (without refinement), 60-250ms (with refinement)

---

## Advantages

1. **Efficiency**: k-NN uses sampling and spatial indexing, avoiding O(n²) computation
2. **Adaptability**: Adjusts to local density variations automatically
3. **Robustness**: Multiple fallbacks ensure it always produces a result
4. **Interpretability**: Clear rationale for chosen threshold
5. **Tunability**: Parameters can be adjusted based on domain knowledge

---

## Parameters to Tune

### Key Parameters

- **k** (nearest neighbors): Typically 3-5
  - Smaller k = more local, may miss longer contacts
  - Larger k = more global, may include noise
  
- **Sample size**: Typically 100-500 vertices
  - Larger sample = more accurate but slower
  - Smaller sample = faster but less representative
  
- **Multiplier for k-NN**: Typically 1.5-2.5× median
  - Controls how far beyond nearest neighbors to look
  - 2× is a good default (captures local structure)
  
- **Target density** (if refining): Typically 1-5% of possible pairs
  - Lower = more selective contacts
  - Higher = more contacts, potentially noisy

### Recommended Defaults

```javascript
const DEFAULT_K = 3
const DEFAULT_SAMPLE_SIZE = 200
const DEFAULT_NN_MULTIPLIER = 2.0
const DEFAULT_TARGET_DENSITY = 0.02  // 2%
const DEFAULT_MIN_THRESHOLD_MULTIPLIER = 1.2
```

---

## Example Scenario

**Trace:** 1000 vertices, radius = 500

1. **Heuristic**: `500 / 2 = 250`
2. **k-NN**: Sample 200 vertices, find 3-NN distances
   - Median 3-NN distance = 45
   - Threshold = `45 × 2 = 90`
3. **Combine**: `min(250, 90) = 90`
4. **Safety**: `max(45 × 1.2, min(90, 500)) = 90`
5. **Result**: Threshold = 90

This example shows how k-NN can produce a more appropriate threshold than the heuristic alone.

---

## Implementation Considerations

### Helper Functions Needed

1. **`sampleVertices(vertices, count)`**: Randomly sample vertices
2. **`median(array)`**: Compute median value
3. **`mean(array)`**: Compute mean value
4. **`quickContactCount(vertices, traceLength, threshold)`**: Fast contact counting for refinement
5. **`createKDBushConfig(vertices)`**: Already exists in worker

### Integration Points

- Replace `distanceThresholdEstimate()` in `liveContactMapService.js`
- Can be called synchronously or asynchronously (if refinement is used)
- Should cache results to avoid recomputation

### Error Handling

- Handle empty vertex lists
- Handle cases where k-NN fails (fallback to heuristic)
- Handle edge cases (very small traces, very large traces)

---

## Alternative Approaches Considered

### 1. Statistical Analysis of All Pairwise Distances
- **Pros**: Most accurate, data-driven
- **Cons**: O(n²) computation, too slow for large traces
- **Verdict**: Not practical for real-time use

### 2. Pure Binary Search
- **Pros**: Directly optimizes contact density
- **Cons**: Requires multiple full calculations, slow
- **Verdict**: Good for refinement, not for initial estimate

### 3. Pure Heuristic
- **Pros**: Very fast
- **Cons**: Not adaptive, often inaccurate
- **Verdict**: Good baseline, needs improvement

### 4. Machine Learning Approach
- **Pros**: Could learn optimal thresholds
- **Cons**: Requires training data, complex
- **Verdict**: Overkill for this problem

---

## Future Enhancements

1. **Adaptive sampling**: Increase sample size for larger traces
2. **Caching**: Cache k-NN results for similar traces
3. **User feedback**: Learn from user adjustments to improve defaults
4. **Multi-scale analysis**: Consider different k values for different trace regions
5. **Visual feedback**: Show confidence/explanation for chosen threshold

---

## Testing Strategy

1. **Unit tests**: Test each component independently
2. **Integration tests**: Test full flow with various trace types
3. **Performance tests**: Ensure it completes in reasonable time
4. **Validation tests**: Compare against manually-set thresholds
5. **Edge cases**: Very small traces, very large traces, sparse traces

---

## References

- KDBush spatial indexing: Used for efficient nearest neighbor queries
- Incremental averaging: Used in ensemble distance calculations
- Binary search: Standard algorithm for threshold refinement

---

## Questions for Discussion

1. What defines a "good" threshold?
   - Target number of contacts?
   - Visual appearance?
   - Biological meaning?

2. Performance constraints?
   - Can we compute all pairwise distances once and reuse?
   - Or must we avoid O(n²) work?

3. Expected behavior?
   - Should it work across very different trace sizes?
   - Should it adapt to trace compactness/density?

4. User control?
   - Fully automatic, or provide "suggested" threshold with manual override?
   - Show confidence/explanation for chosen threshold?

---

## Conclusion

The hybrid approach balances efficiency, accuracy, and adaptability. It provides a robust method for automatic threshold determination that works across different trace types while maintaining reasonable performance characteristics.
