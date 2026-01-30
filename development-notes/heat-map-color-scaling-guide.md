# Heat Map Color Scaling: Statistical Approaches for Visual Impact

## Overview

This document provides background and context on statistical approaches for scaling contact frequencies and distances to colors in heat maps. It covers normalization methods, transformations, and best practices for creating visually impactful visualizations.

## Current Approach

### Contact Map
- **Current**: Raw frequency values passed directly to color scale
- **Issue**: Linear scaling from min to max may not highlight important patterns
- **Problem**: A few high-frequency contacts can dominate, making most of the map appear low-contrast

### Distance Map
- **Current**: Uses `nearness = maxDistance - distance`, then `nearness/maxDistance` as interpolant
- **Issue**: Linear scaling may not emphasize biologically meaningful distance ranges
- **Problem**: Most distances might cluster in a narrow range, wasting color space

## The Core Problem: Data Distribution

### Why Linear Scaling Fails

Most biological data follows **non-uniform distributions**:
- **Contact frequencies**: Often highly skewed (many low values, few high values)
- **Distances**: May cluster around certain ranges (e.g., local vs. long-range)
- **Outliers**: Extreme values can compress the useful range

**Example**: If frequencies range from 1 to 100, but 95% of values are between 1-10, linear scaling wastes 90% of the color range on rarely-seen high values.

## Statistical Approaches

### 1. Percentile-Based Scaling

**Concept**: Use percentiles instead of min/max to define color range

**How it works**:
- Calculate percentiles (e.g., 5th, 95th percentile)
- Map colors from percentile range, not absolute min/max
- Values outside range get clamped or special treatment

**Example**:
```
Data: [1, 1, 1, 2, 2, 3, 3, 5, 10, 50, 100]
5th percentile = 1
95th percentile = 50
Color range: 1-50 (not 1-100)
```

**Pros**:
- Robust to outliers
- Highlights the "typical" range
- Common in genomics (Hi-C, ChIP-seq)
- Automatically adapts to data distribution

**Cons**:
- Loses information about extreme values
- May hide important outliers
- Percentile choice is somewhat arbitrary

**When to use**:
- Skewed distributions
- When outliers are noise/artifacts
- Standard practice in genomics visualization

**Common percentiles**: 2nd-98th, 5th-95th, 10th-90th

---

### 2. Log Transformation

**Concept**: Apply logarithmic transformation before scaling

**How it works**:
- Transform values: `log(value + 1)` or `log10(value + 1)`
- Then apply linear scaling to transformed values
- +1 prevents log(0) issues

**Example**:
```
Original: [1, 2, 5, 10, 50, 100]
Log10:    [0, 0.3, 0.7, 1.0, 1.7, 2.0]
```

**Pros**:
- Compresses high values, expands low values
- Natural for multiplicative relationships
- Common in genomics (fold-change, expression)
- Reveals patterns in low-value regions

**Cons**:
- May over-emphasize small differences at low end
- Less intuitive (harder to interpret)
- Requires careful handling of zeros

**When to use**:
- Highly skewed data (many small, few large values)
- Multiplicative relationships
- When you want to see patterns across orders of magnitude

**Variations**:
- Natural log (ln)
- Log10 (common in genomics)
- Log2 (common for fold-changes)

---

### 3. Square Root Transformation

**Concept**: Apply square root transformation (less aggressive than log)

**How it works**:
- Transform: `sqrt(value)` or `sqrt(value - min)`
- Then linear scaling

**Example**:
```
Original: [1, 4, 9, 16, 25, 100]
Sqrt:     [1, 2, 3, 4, 5, 10]
```

**Pros**:
- Moderate compression of high values
- More intuitive than log
- Good middle ground

**Cons**:
- Less effective for highly skewed data
- Still requires handling of zeros

**When to use**:
- Moderately skewed data
- When log is too aggressive
- Count data (Poisson-like distributions)

---

### 4. Z-Score Normalization (Standardization)

**Concept**: Normalize to standard deviations from mean

**How it works**:
- Calculate mean (μ) and standard deviation (σ)
- Transform: `z = (value - μ) / σ`
- Map z-scores to colors (e.g., -3σ to +3σ)

**Example**:
```
Data: [10, 12, 15, 18, 20]
Mean = 15, StdDev = 4.0
Z-scores: [-1.25, -0.75, 0, 0.75, 1.25]
```

**Pros**:
- Highlights deviations from typical values
- Statistically meaningful
- Good for comparing across datasets
- Reveals outliers naturally

**Cons**:
- Assumes normal distribution (often not true)
- Less intuitive (what does z=2 mean?)
- Sensitive to outliers in mean/std calculation

**When to use**:
- When you want to highlight "unusual" contacts/distances
- Comparing across different datasets
- When data is approximately normal

**Common ranges**: -3σ to +3σ (covers 99.7% of normal distribution)

---

### 5. Quantile Normalization

**Concept**: Map values to quantiles, then scale uniformly

**How it works**:
- Sort all values
- Assign each value its quantile rank (0-1)
- Map quantiles directly to colors

**Example**:
```
Data: [1, 1, 2, 5, 10, 50, 100]
Quantiles: [0.14, 0.14, 0.29, 0.43, 0.57, 0.86, 1.0]
```

**Pros**:
- Completely robust to outliers
- Uniform distribution of colors
- Maximizes visual contrast
- No parameters to tune

**Cons**:
- Loses absolute value information
- Can't compare across datasets
- May hide important magnitude differences

**When to use**:
- Maximizing visual contrast is priority
- When relative ranking matters more than absolute values
- Exploratory visualization

---

### 6. Adaptive/Histogram Equalization

**Concept**: Use histogram to distribute colors evenly across data density

**How it works**:
- Build histogram of values
- Create cumulative distribution function (CDF)
- Map values through CDF to get uniform color distribution

**Example**:
```
If 80% of values are in range [1-10], 
then 80% of color range maps to [1-10]
```

**Pros**:
- Maximizes use of color space
- Adapts to any distribution shape
- Good for revealing patterns

**Cons**:
- Complex to implement
- Can over-emphasize noise
- Less intuitive

**When to use**:
- Complex, multi-modal distributions
- When you want maximum visual contrast
- Image processing applications

---

### 7. Winsorization + Linear Scaling

**Concept**: Cap extreme values, then linear scale

**How it works**:
- Set values above 95th percentile to 95th percentile value
- Set values below 5th percentile to 5th percentile value
- Then linear scale the winsorized data

**Example**:
```
Original: [1, 2, 5, 10, 50, 100]
95th percentile = 50
Winsorized: [1, 2, 5, 10, 50, 50]
```

**Pros**:
- Simple modification of linear scaling
- Robust to outliers
- Preserves relative relationships in main range

**Cons**:
- Loses information about extremes
- Arbitrary percentile choice

**When to use**:
- Quick improvement over linear scaling
- When outliers are known artifacts
- Simple implementation needed

---

### 8. Piecewise/Threshold-Based Scaling

**Concept**: Use different scaling for different value ranges

**How it works**:
- Define thresholds (e.g., low, medium, high)
- Apply different transformations to each range
- Smooth transitions between ranges

**Example**:
```
Low (0-10):    Linear scaling
Medium (10-50): Log scaling  
High (50+):     Saturated color
```

**Pros**:
- Combines benefits of multiple approaches
- Can emphasize specific ranges
- Flexible

**Cons**:
- Complex to implement
- Many parameters to tune
- May create visual discontinuities

**When to use**:
- When different ranges have different biological meaning
- When you want to emphasize specific thresholds
- Advanced visualization needs

---

## Comparison Matrix

| Method | Robust to Outliers | Visual Contrast | Interpretability | Complexity | Best For |
|--------|-------------------|-----------------|------------------|------------|----------|
| Linear | Low | Low-Medium | High | Low | Uniform distributions |
| Percentile | High | Medium-High | Medium | Low | Skewed data, genomics |
| Log | High | High | Medium | Low | Highly skewed, orders of magnitude |
| Sqrt | Medium | Medium | Medium | Low | Moderate skew |
| Z-Score | Medium | Medium | Low | Medium | Normal distributions, outliers |
| Quantile | Very High | Very High | Low | Medium | Maximum contrast |
| Histogram Equalization | High | Very High | Low | High | Complex distributions |
| Winsorization | High | Medium | High | Low | Quick improvement |
| Piecewise | Medium | High | Medium | High | Specific ranges |

## Recommendations by Data Type

### Contact Frequencies

**Typical distribution**: Highly skewed (many 1s, few high values)

**Recommended approaches** (in order):
1. **Percentile-based** (5th-95th or 2nd-98th)
   - Standard in genomics
   - Robust and interpretable
   - Easy to implement

2. **Log transformation** (log10 or log2)
   - If percentile doesn't provide enough contrast
   - Good for wide dynamic range

3. **Square root** (if log is too aggressive)
   - Middle ground option

**Why not linear?**
- Most contacts have frequency 1-5
- A few contacts have frequency 50-100
- Linear scaling makes 95% of map look similar (low contrast)

---

### Distance Maps

**Typical distribution**: May cluster around local vs. long-range distances

**Recommended approaches**:
1. **Percentile-based** (if distances are skewed)
   - Similar reasoning to contact frequencies

2. **Piecewise scaling** (if local vs. long-range have different meaning)
   - Emphasize biologically relevant distance ranges
   - Different color schemes for different ranges

3. **Inverse transformation** (since "nearness" is what matters)
   - Current approach (maxDistance - distance) is good
   - But apply percentile/log to the nearness values

**Why current approach may fail?**
- If most distances are similar, nearness values cluster
- Linear scaling of nearness wastes color space
- Need to emphasize differences in the relevant range

---

## Statistical Measures to Compute

Before choosing a scaling method, compute:

### Basic Statistics
- **Min/Max**: Absolute range
- **Mean/Median**: Central tendency
- **Standard deviation**: Spread
- **Skewness**: Distribution asymmetry
- **Kurtosis**: Tail heaviness

### Percentiles
- **5th, 10th, 25th, 50th (median), 75th, 90th, 95th**
- Shows distribution shape
- Identifies outliers

### Distribution Shape
- **Histogram**: Visual inspection
- **Q-Q plot**: Compare to normal distribution
- **Density plot**: Smooth distribution estimate

### Sparsity
- **% of matrix that is non-zero** (contact map)
- **% of matrix that is defined** (distance map)
- Affects which methods are appropriate

## Implementation Strategy

### Phase 1: Compute Statistics
```javascript
function computeStatistics(values) {
    const validValues = values.filter(v => v !== undefined && v !== -1 && v > 0)
    
    return {
        min: Math.min(...validValues),
        max: Math.max(...validValues),
        mean: mean(validValues),
        median: median(validValues),
        stdDev: standardDeviation(validValues),
        percentiles: {
            p5: percentile(validValues, 5),
            p25: percentile(validValues, 25),
            p50: percentile(validValues, 50),
            p75: percentile(validValues, 75),
            p95: percentile(validValues, 95)
        },
        skewness: computeSkewness(validValues),
        sparsity: validValues.length / values.length
    }
}
```

### Phase 2: Choose Method Based on Statistics
```javascript
function chooseScalingMethod(stats) {
    if (stats.sparsity < 0.1) {
        // Very sparse - quantile or percentile
        return 'percentile'
    }
    
    if (stats.skewness > 2) {
        // Highly skewed - log or percentile
        return 'log'
    }
    
    if (stats.max / stats.median > 10) {
        // Large dynamic range - log transformation
        return 'log'
    }
    
    // Default to percentile (robust and standard)
    return 'percentile'
}
```

### Phase 3: Apply Transformation
```javascript
function transformValue(value, method, stats) {
    switch(method) {
        case 'percentile':
            return percentileRank(value, stats.percentiles)
        case 'log':
            return Math.log10(value + 1) / Math.log10(stats.max + 1)
        case 'sqrt':
            return Math.sqrt(value) / Math.sqrt(stats.max)
        // ... etc
    }
}
```

## Best Practices from Genomics

### Hi-C Contact Maps
- **Standard**: Percentile-based (2nd-98th or 5th-95th)
- **Rationale**: Highly skewed, outliers are common
- **Tools**: Juicebox, HiGlass use percentile scaling

### ChIP-seq Signal
- **Common**: Log transformation (log2 or log10)
- **Rationale**: Wide dynamic range, multiplicative relationships

### Distance/Interaction Maps
- **Common**: Inverse distance with percentile scaling
- **Rationale**: Emphasize "nearness", handle outliers

### General Principles
1. **Always compute statistics first** - don't assume distribution
2. **Percentile-based is safe default** - works for most cases
3. **Log for highly skewed** - when dynamic range > 10x
4. **Allow user override** - different users may prefer different scaling
5. **Show statistics** - help users understand what they're seeing

## User Control Options

Consider providing:
1. **Scaling method selector**: Linear, Percentile, Log, etc.
2. **Percentile controls**: Adjustable min/max percentiles
3. **Manual min/max**: Override automatic calculation
4. **Statistics display**: Show distribution info to users
5. **Preview**: Show how scaling affects visualization

## Common Pitfalls

1. **Using min/max without checking distribution**
   - May compress useful range
   - Solution: Use percentiles

2. **Applying log to already-normalized data**
   - Double transformation
   - Solution: Check if data is already transformed

3. **Ignoring zeros/missing data**
   - Can skew statistics
   - Solution: Filter before computing statistics

4. **One-size-fits-all approach**
   - Different datasets need different scaling
   - Solution: Adaptive method selection

5. **Not communicating scaling to users**
   - Users may misinterpret colors
   - Solution: Show color scale legend with actual values

## Questions to Guide Implementation

1. **What is the typical distribution?**
   - Compute statistics on sample datasets
   - Identify common patterns

2. **What do users care about?**
   - Absolute values or relative patterns?
   - Outliers or typical range?

3. **How to handle outliers?**
   - Cap them? Highlight them? Ignore them?

4. **Should scaling be automatic or user-controlled?**
   - Automatic: Better UX, but less control
   - Manual: More control, but requires user knowledge

5. **How to communicate scaling to users?**
   - Color scale legend
   - Statistics panel
   - Tooltips showing actual values

## Conclusion

**Key Takeaways**:
1. **Linear scaling is rarely optimal** for biological data
2. **Percentile-based scaling** is the safest, most common approach
3. **Log transformation** is powerful for highly skewed data
4. **Always compute statistics** before choosing a method
5. **Provide user control** when possible

**Recommended Starting Point**:
- **Contact frequencies**: Percentile-based (5th-95th percentile)
- **Distance maps**: Percentile-based on "nearness" values (or piecewise if local/long-range distinction matters)

This provides a robust, standard approach that works well for most genomics visualization use cases while being relatively simple to implement.
