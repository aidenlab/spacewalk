# Weaknesses Identified in liveContactMapWorker.js

## Critical Bugs

### 1. Incorrect Bounds Check (Lines 70-76)
**Issue**: Uses `>` instead of `>=` for bounds checking
```javascript
if (xy > contactFrequency.length) {  // BUG: should be >=
```
**Impact**: If `xy === contactFrequency.length`, this allows out-of-bounds access
**Fix**: Change to `>=` and add early return

### 2. Error Handling Continues Execution
**Issue**: Bounds check logs error but continues, potentially causing memory corruption
```javascript
if (xy > contactFrequency.length) {
    console.error(...)  // Logs but continues!
}
contactFrequency[xy] = ...  // Still executes with invalid index!
```
**Impact**: Silent failures, potential memory corruption, undefined behavior
**Fix**: Add `continue` or `return` after error logging

## Performance Issues

### 3. Filter Creates New Array Every Iteration
**Issue**: Line 59 allocates new array on every loop iteration
```javascript
const contactIndices = spatialIndex.within(...).filter(...)
```
**Impact**: Many temporary array allocations for large datasets
**Fix**: Use in-place filtering or pre-allocate result array

### 4. Spatial Index Returns Current Vertex
**Issue**: Query includes current vertex, which is then filtered out
**Impact**: Wasted computation
**Fix**: Exclude current vertex before querying, or use query method that excludes query point

### 5. Array Building Without Pre-allocation
**Issue**: Lines 38-48 build arrays with push, causing reallocations
```javascript
const validVertices = []  // No size hint
const validIndices = []
for (let i = 0; i < vertices.length; i++) {
    validIndices.push(i)  // May cause multiple reallocations
    validVertices.push(vertices[i])
}
```
**Impact**: Multiple array reallocations and memory copies
**Fix**: Pre-allocate arrays with estimated size, or count first then allocate

### 6. JSON Parsing in Worker
**Issue**: Line 9 parses JSON strings in worker thread
```javascript
const vertexLists = ... ? [ JSON.parse(data.verticesString) ] : JSON.parse(data.vertexListsString)
```
**Impact**: Parsing overhead for large datasets
**Fix**: Consider structured cloning if main thread can pass objects directly

## Logic/Design Questions

### 7. Diagonal Accumulation Behavior
**Issue**: Line 56 sets diagonal to 1, not accumulates
```javascript
contactFrequency[xy_diagonal] = 1  // Always 1, never accumulates
```
**Question**: For ensembles, should diagonal accumulate? Currently it stays at 1 regardless of number of traces.
**Impact**: If diagonal should represent frequency across ensemble, this is a bug

### 8. Missing Input Validation
**Issue**: No validation that:
- `traceLength` matches actual vertex count
- `validIndices` values are within expected range
- `distanceThreshold` is positive
**Impact**: Silent failures or incorrect results with bad input

## Code Quality

### 9. Magic Number
**Issue**: Line 97 has undocumented magic number
```javascript
nodeSize: 64,  // What does this mean? Why 64?
```
**Fix**: Extract to named constant with comment explaining choice

### 10. Inconsistent Error Handling
**Issue**: Some errors are logged, others silently ignored
**Impact**: Difficult to debug issues in production

## Recommended Priority

1. **Fix immediately**: Bounds check bug (#1, #2) - potential memory corruption
2. **Fix soon**: Diagonal accumulation (#7) - verify intended behavior
3. **Optimize**: Filter allocation (#3), array building (#5) - performance improvements
4. **Enhance**: Add validation (#8), improve error handling (#10)
