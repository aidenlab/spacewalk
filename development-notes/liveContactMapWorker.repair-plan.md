# Repair Plan for liveContactMapWorker.js

## Phase 1: Critical Bug Fixes (Must Fix Immediately)

### 1.1 Fix Bounds Check Logic
**Priority**: CRITICAL  
**Issue**: Lines 70-76 use `>` instead of `>=`, allowing out-of-bounds access

**Plan**:
- Change bounds check from `>` to `>=`
- Add early `continue` after error logging to prevent execution with invalid indices
- Validate bounds once before the loop for better performance
- Improve error message to include more context (x, y, traceLength)

**Implementation**:
```javascript
// Before loop: validate once
const maxIndex = traceLength * traceLength - 1

// In loop: fix bounds check
if (xy > maxIndex || yx > maxIndex) {
    console.error(`Index out of bounds: xy=${xy}, yx=${yx}, maxIndex=${maxIndex}, traceLength=${traceLength}, x=${x}, y=${y}`)
    continue  // Skip this iteration
}
```

**Testing**: Create test case with edge case where `xy === contactFrequency.length`

---

### 1.2 Add Error Handling with Early Returns
**Priority**: CRITICAL  
**Issue**: Errors logged but execution continues, risking memory corruption

**Plan**:
- Add `continue` statements after error logging
- Consider throwing errors for truly invalid states (e.g., negative traceLength)
- Add input validation at function entry

**Implementation**:
```javascript
function accumulateContactFrequencies(contactFrequency, traceLength, vertices, distanceThreshold) {
    // Input validation
    if (traceLength <= 0) {
        throw new Error(`Invalid traceLength: ${traceLength}`)
    }
    if (distanceThreshold < 0) {
        throw new Error(`Invalid distanceThreshold: ${distanceThreshold}`)
    }
    if (!vertices || vertices.length === 0) {
        return  // Early return for empty input
    }
    
    // ... rest of function with continue statements after errors
}
```

**Testing**: Test with invalid inputs (negative values, empty arrays, null)

---

## Phase 2: Performance Optimizations

### 2.1 Optimize Filter Operation
**Priority**: HIGH  
**Issue**: Line 59 creates new array every iteration

**Plan**:
- Replace Set-based exclusion with boolean array (more efficient)
- Pre-allocate boolean array to avoid Set overhead
- Use direct index checking instead of filter

**Implementation**:
```javascript
// Replace Set with boolean array
const processed = new Array(validVertices.length).fill(false)

// In loop:
processed[v] = true
const nearbyIndices = spatialIndex.within(...)

// Use for loop with continue instead of filter
for (const contactIndex of nearbyIndices) {
    if (processed[contactIndex]) {
        continue  // Skip already processed
    }
    // ... process contact
}
```

**Expected Improvement**: 10-20% faster exclusion checks

---

### 2.2 Pre-allocate Arrays for validVertices/validIndices
**Priority**: MEDIUM  
**Issue**: Arrays built with push(), causing reallocations

**Plan**:
- First pass: count valid vertices
- Second pass: allocate arrays with exact size and fill them
- OR: Use single pass with pre-allocation estimate

**Implementation**:
```javascript
// Option 1: Two-pass (more predictable)
let validCount = 0
for (let i = 0; i < vertices.length; i++) {
    if (vertices[i].isMissingData !== true) {
        validCount++
    }
}

const validVertices = new Array(validCount)
const validIndices = new Array(validCount)
let idx = 0
for (let i = 0; i < vertices.length; i++) {
    if (vertices[i].isMissingData !== true) {
        validIndices[idx] = i
        validVertices[idx] = vertices[i]
        idx++
    }
}

// Option 2: Single pass with estimate (faster for typical case)
const validVertices = []
const validIndices = []
validVertices.length = vertices.length  // Pre-allocate max size
validIndices.length = vertices.length
let idx = 0
for (let i = 0; i < vertices.length; i++) {
    if (vertices[i].isMissingData !== true) {
        validIndices[idx] = i
        validVertices[idx] = vertices[i]
        idx++
    }
}
validVertices.length = idx  // Trim to actual size
validIndices.length = idx
```

**Expected Improvement**: 5-10% faster for large vertex arrays

---

### 2.3 Optimize Spatial Index Query
**Priority**: LOW  
**Issue**: Query returns current vertex, which is then filtered out

**Plan**:
- Check if KDBush has option to exclude query point
- If not, accept current behavior (filter is fast with boolean array)
- Document that this is expected behavior

**Implementation**: 
- Research KDBush API for exclusion options
- If not available, keep current approach (optimization may not be worth complexity)

---

## Phase 3: Logic Clarification & Fixes

### 3.1 Clarify Diagonal Accumulation Behavior
**Priority**: HIGH  
**Issue**: Diagonal set to 1, unclear if should accumulate for ensembles

**Plan**:
1. **Verify Intent**: Check with domain experts/product owner:
   - Should diagonal always be 1 (self-contact)?
   - Or should it accumulate frequency across ensemble traces?

2. **If should accumulate**: Change to check and increment
   ```javascript
   const diagonalIndex = x * traceLength + x
   if (contactFrequency[diagonalIndex] === kContactFrequencyUndefined) {
       contactFrequency[diagonalIndex] = 1
   } else {
       contactFrequency[diagonalIndex] += 1
   }
   ```

3. **If should stay 1**: Add comment explaining why
   ```javascript
   // Self-contact is always 1, regardless of ensemble size
   contactFrequency[diagonalIndex] = 1
   ```

**Testing**: Test with single trace vs ensemble to verify expected behavior

---

### 3.2 Add Input Validation
**Priority**: MEDIUM  
**Issue**: Missing validation for inputs

**Plan**:
- Validate all function parameters at entry
- Check that validIndices values are within expected range
- Validate traceLength matches expected size

**Implementation**:
```javascript
function accumulateContactFrequencies(contactFrequency, traceLength, vertices, distanceThreshold) {
    // Validate inputs
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
    
    // ... rest of function
}
```

---

## Phase 4: Code Quality Improvements

### 4.1 Extract Magic Numbers to Constants
**Priority**: LOW  
**Issue**: Magic number 64 on line 97

**Plan**:
- Extract to named constant with documentation
- Add comment explaining why 64 is chosen (KDBush default/optimal)

**Implementation**:
```javascript
// KDBush node size: 64 is optimal for most 3D spatial queries
// Smaller values = deeper tree = more memory, faster queries
// Larger values = shallower tree = less memory, slower queries
const KDBUSH_NODE_SIZE = 64

function kdBushConfiguratorWithTrace(vertices) {
    return {
        // ...
        nodeSize: KDBUSH_NODE_SIZE,
        // ...
    }
}
```

---

### 4.2 Improve Error Messages
**Priority**: LOW  
**Issue**: Error messages lack context

**Plan**:
- Include all relevant values in error messages
- Use consistent error message format
- Consider error codes for programmatic handling

**Implementation**: Already included in Phase 1.1 and 3.2

---

### 4.3 Add JSDoc Comments
**Priority**: LOW  
**Issue**: Missing documentation

**Plan**:
- Add JSDoc comments to all functions
- Document parameters, return values, exceptions
- Add usage examples for complex functions

**Implementation**: See improved version in previous conversation

---

## Phase 5: Optional Enhancements

### 5.1 Consider Structured Cloning Instead of JSON
**Priority**: LOW  
**Issue**: JSON parsing overhead

**Plan**:
- Investigate if main thread can pass objects directly
- Test performance difference
- Only implement if significant improvement

**Implementation**: Requires changes to liveContactMapService.js as well

---

### 5.2 Add Progress Reporting
**Priority**: LOW  
**Issue**: No way to report progress for long-running operations

**Plan**:
- Add optional progress callback
- Report progress every N vertices processed
- Allow cancellation if needed

**Implementation**: 
```javascript
// In message handler
let progressCallback = null
if (data.reportProgress) {
    progressCallback = (current, total) => {
        self.postMessage({ type: 'progress', current, total })
    }
}

// In loop
if (progressCallback && v % 100 === 0) {
    progressCallback(v, validVertices.length)
}
```

---

## Implementation Order

### Sprint 1 (Critical - Do First):
1. ✅ Fix bounds check (1.1)
2. ✅ Add error handling (1.2)
3. ✅ Clarify diagonal behavior (3.1)

### Sprint 2 (High Priority):
4. ✅ Optimize filter operation (2.1)
5. ✅ Add input validation (3.2)

### Sprint 3 (Medium Priority):
6. ✅ Pre-allocate arrays (2.2)
7. ✅ Extract magic numbers (4.1)
8. ✅ Add JSDoc comments (4.3)

### Sprint 4 (Low Priority / Future):
9. ⏳ Optimize spatial query (2.3)
10. ⏳ Consider structured cloning (5.1)
11. ⏳ Add progress reporting (5.2)

---

## Testing Strategy

### Unit Tests Needed:
1. **Bounds checking**: Test with edge cases (xy === length, xy > length)
2. **Input validation**: Test with invalid inputs (negative, null, wrong types)
3. **Diagonal behavior**: Test single trace vs ensemble
4. **Empty input**: Test with empty vertices array
5. **Missing data**: Test with all vertices missing data
6. **Performance**: Benchmark before/after optimizations

### Integration Tests:
1. Test with real ensemble data
2. Verify results match expected contact frequencies
3. Test error handling doesn't crash worker

---

## Risk Assessment

### Low Risk Changes:
- Adding comments/documentation
- Extracting constants
- Adding input validation

### Medium Risk Changes:
- Changing filter to boolean array (logic should be equivalent)
- Pre-allocating arrays (should be safe)

### Higher Risk Changes:
- Changing diagonal accumulation logic (need to verify intent first)
- Bounds check fix (critical but well-understood)

---

## Rollback Plan

1. Keep original file as backup: `liveContactMapWorker.js.backup`
2. Test thoroughly in development before production
3. Have feature flag to switch between old/new implementation
4. Monitor error rates after deployment
