# Live Map Architecture Review: Scalability and Efficiency Analysis

## Executive Summary

This document provides a high-level architectural review of the live map functionality (contact map and distance map services). It analyzes the current approach, identifies scalability bottlenecks, and explores alternative strategies without diving into implementation details.

## Current Architecture Overview

### Contact Map Service
- **Algorithm**: Spatial indexing (KDBush) for proximity queries
- **Complexity**: O(n log n) per trace for building index + O(n log n) queries
- **Memory**: O(n²) for result matrix (traceLength × traceLength)
- **Ensemble**: Processes M traces sequentially, accumulates frequencies

### Distance Map Service
- **Algorithm**: Nested loops computing all pairwise distances
- **Complexity**: O(n²) per trace (unavoidable - need all pairs)
- **Memory**: O(n²) for result matrix + O(n²) for counters (ensemble averaging)
- **Ensemble**: Processes M traces sequentially, computes incremental averages

## Scalability Analysis

### Current Bottlenecks

#### 1. **Memory Constraints**
- **Per trace**: O(n²) matrices
  - Example: 10,000 vertices = 100M elements = ~400MB (Float32Array)
  - Example: 50,000 vertices = 2.5B elements = ~10GB (exceeds browser limits)
- **Ensemble**: M × O(n²)
  - 100 traces × 10,000 vertices = 40GB total (theoretical, but not all in memory simultaneously)
- **JSON serialization**: Doubles memory temporarily during worker communication

#### 2. **Computational Complexity**
- **Contact Map**: O(M × n log n) - scales well with spatial indexing
- **Distance Map**: O(M × n²) - quadratic scaling is fundamental
- **Both**: Sequential processing of traces (no parallelization across traces)

#### 3. **Data Transfer Overhead**
- JSON serialization/deserialization for worker communication
- Transferring full n² matrices between main thread and workers
- No incremental/streaming approach

## Fundamental Constraints

### What Cannot Be Avoided

1. **Distance Map O(n²)**: Mathematically necessary - must compute all pairwise distances
2. **Full Matrix Storage**: Required for visualization (Juicebox expects full matrices)
3. **Ensemble Averaging**: Must process all traces to compute averages

### What Can Be Optimized

1. **Memory management**: Streaming, chunking, or sparse representations
2. **Computation**: Parallelization, approximation, or incremental processing
3. **Data transfer**: Binary formats, shared memory, or incremental updates

## Alternative Approaches

### Approach 1: Streaming/Chunked Processing

**Concept**: Process traces in chunks rather than all at once

**How it works**:
- Divide ensemble into batches (e.g., 10-20 traces per batch)
- Process batch → accumulate results → discard batch data
- Continue until all traces processed

**Pros**:
- Reduces peak memory usage
- Can show progress/partial results
- Allows cancellation

**Cons**:
- More complex state management
- Requires careful accumulation logic
- May need to recompute if user changes parameters

**Complexity**: Same computational complexity, but better memory profile

---

### Approach 2: Sparse Matrix Representation

**Concept**: Only store non-zero/non-undefined values

**How it works**:
- Use sparse matrix format (COO, CSR, or custom)
- Store only (i, j, value) tuples for defined entries
- Convert to dense format only when needed for visualization

**Pros**:
- Dramatically reduces memory for sparse data
- Faster iteration over non-zero entries
- Can handle larger datasets

**Cons**:
- Conversion overhead to dense format for visualization
- More complex data structures
- May not help if data is dense (many contacts/distances)

**When beneficial**: 
- Contact maps with low contact density (< 5% of matrix filled)
- Distance maps with many missing data points
- Large traceLength with sparse contacts

**Complexity**: O(k) where k = number of non-zero entries (could be much less than n²)

---

### Approach 3: Hierarchical/Approximate Methods

**Concept**: Use multi-resolution or sampling approaches

**How it works**:
- **For contact maps**: Sample vertices or use hierarchical clustering
- **For distance maps**: Compute distances at multiple resolutions
- **For ensembles**: Sample traces rather than process all

**Pros**:
- Much faster computation
- Lower memory requirements
- Can provide "good enough" results quickly

**Cons**:
- Loss of precision/accuracy
- May miss important details
- Complex to implement correctly

**When beneficial**:
- Very large datasets where exact computation is infeasible
- Exploratory analysis where approximation is acceptable
- Real-time interaction where speed > precision

**Complexity**: O(n log n) or O(n) depending on method

---

### Approach 4: Incremental/Progressive Computation

**Concept**: Compute and display results incrementally as traces are processed

**How it works**:
- Process traces one at a time
- Update visualization after each trace (or every N traces)
- User sees progressive refinement

**Pros**:
- Immediate feedback
- Can cancel/stop early
- Better perceived performance
- Allows user to stop if result looks good

**Cons**:
- More complex UI state management
- Need to handle partial results
- May cause visual "flickering" during updates

**Complexity**: Same total computation, but better UX

---

### Approach 5: Parallel Processing Across Traces

**Concept**: Process multiple traces simultaneously using multiple workers

**How it works**:
- Create worker pool (e.g., 4-8 workers)
- Distribute traces across workers
- Aggregate results from all workers

**Pros**:
- Utilizes multiple CPU cores
- Faster for large ensembles
- Better hardware utilization

**Cons**:
- More complex coordination
- Memory overhead (multiple workers)
- Browser worker limits
- Aggregation complexity

**Complexity**: O(M × n² / P) where P = number of parallel workers

---

### Approach 6: Lazy/On-Demand Computation

**Concept**: Only compute what's needed for current view

**How it works**:
- **Contact map**: Only compute contacts for visible genomic regions
- **Distance map**: Only compute distances for zoomed-in view
- **Ensemble**: Only process traces user wants to see

**Pros**:
- Much faster initial load
- Lower memory usage
- Scales to very large datasets

**Cons**:
- Complex viewport/region tracking
- May need recomputation on zoom/pan
- Doesn't work if user needs full matrix

**When beneficial**:
- Large datasets where full computation is impractical
- Interactive exploration workflows
- When user only needs specific regions

**Complexity**: O(v²) where v = visible region size (could be << n)

---

### Approach 7: Hybrid: Dense + Sparse Strategy

**Concept**: Use dense matrices for small traces, sparse for large ones

**How it works**:
- Threshold-based: if traceLength < T, use dense representation
- If traceLength >= T, use sparse representation
- Automatic conversion between formats

**Pros**:
- Best of both worlds
- Handles small datasets efficiently
- Scales to large datasets

**Cons**:
- More complex implementation
- Conversion overhead
- Need to handle both formats

**Complexity**: Adaptive based on data size

---

## Comparison Matrix

| Approach | Memory Reduction | Speed Improvement | Complexity | Accuracy | Best For |
|----------|----------------|-------------------|------------|----------|----------|
| Streaming/Chunked | High | None | Medium | Full | Large ensembles |
| Sparse Matrix | Very High* | Medium* | High | Full | Sparse data |
| Hierarchical | High | Very High | Very High | Approximate | Very large datasets |
| Incremental | None | Perceived | Medium | Full | Better UX |
| Parallel Workers | None | High | High | Full | Multi-core systems |
| Lazy/On-Demand | Very High | Very High | Very High | Partial | Interactive exploration |
| Hybrid Dense+Sparse | High* | Medium* | Very High | Full | Variable dataset sizes |

*Depends on data sparsity

## Recommendations by Use Case

### Small-Medium Datasets (n < 5,000, M < 100)
**Current approach is fine** - no changes needed

### Medium-Large Datasets (n < 20,000, M < 500)
**Recommended**: Streaming/Chunked Processing
- Implement batching (10-20 traces per batch)
- Show progress indicator
- Maintain current algorithms

### Large Datasets (n < 50,000, M < 1,000)
**Recommended**: Hybrid approach
- Streaming/Chunked for ensemble processing
- Consider sparse representation if contact density < 10%
- Parallel workers if multi-core available

### Very Large Datasets (n > 50,000 or M > 1,000)
**Recommended**: Multi-strategy approach
- Streaming/Chunked (essential)
- Sparse matrices (if applicable)
- Hierarchical/approximate methods (if precision acceptable)
- Lazy computation for specific regions

## Specific Optimizations Worth Considering

### 1. **Binary Transfer Instead of JSON**
- Use ArrayBuffer/SharedArrayBuffer for worker communication
- Eliminates JSON parsing overhead
- Reduces memory duplication

### 2. **Shared Memory (SharedArrayBuffer)**
- Allow workers to read directly from shared memory
- Eliminates transfer overhead
- Requires careful synchronization

### 3. **WebAssembly for Core Computations**
- Distance calculations could be faster in WASM
- Better SIMD support
- More control over memory layout

### 4. **Progressive Quality**
- Compute low-resolution version first (fast)
- Refine with high-resolution (slower)
- User sees results immediately

### 5. **Caching/Incremental Updates**
- Cache computed results per trace
- Only recompute changed traces
- Useful for interactive threshold adjustment

## Fundamental Questions to Answer

Before choosing an optimization strategy, consider:

1. **What are typical dataset sizes?**
   - Most common: n = ?, M = ?
   - Maximum expected: n = ?, M = ?

2. **What is acceptable performance?**
   - Initial load: < 5 seconds? < 30 seconds?
   - Interactive updates: < 1 second? < 5 seconds?

3. **What is acceptable memory usage?**
   - Target: < 2GB? < 4GB?
   - Can we exceed browser limits with streaming?

4. **How sparse is the data typically?**
   - Contact maps: What % of matrix is non-zero?
   - Distance maps: What % has missing data?

5. **What precision is required?**
   - Exact computation vs. approximation acceptable?
   - Can we use sampling for exploration?

6. **What are user workflows?**
   - Do users need full matrices or specific regions?
   - Do they explore interactively or need batch processing?

## Conclusion

### Current Approach Assessment

**Strengths**:
- Clean, straightforward implementation
- Correct algorithms (spatial indexing for contacts, necessary O(n²) for distances)
- Good use of web workers
- Proper handling of missing data

**Weaknesses**:
- Memory scales as O(n²) - hard limit on dataset size
- Sequential processing doesn't utilize parallelism
- JSON serialization overhead
- No incremental/progressive computation

### Recommended Path Forward

**Phase 1 (Quick Wins)**:
1. Implement streaming/chunked processing for ensembles
2. Replace JSON with binary transfer (ArrayBuffer)
3. Add progress reporting

**Phase 2 (Medium-term)**:
1. Evaluate sparse matrix representation (if data is sparse)
2. Implement parallel worker pool for trace processing
3. Add caching for computed results

**Phase 3 (Long-term, if needed)**:
1. Consider hierarchical/approximate methods for very large datasets
2. Implement lazy/on-demand computation for specific use cases
3. Explore WebAssembly for performance-critical sections

### Key Insight

The fundamental constraint is **memory**, not computation. The O(n²) memory requirement for full matrices is the hard limit. The most impactful optimizations will focus on:
1. **Reducing memory footprint** (streaming, sparse matrices)
2. **Better memory management** (chunking, incremental processing)
3. **Avoiding unnecessary memory** (lazy computation, on-demand)

Computation can be parallelized and optimized, but memory is the true bottleneck that will determine maximum dataset size.
