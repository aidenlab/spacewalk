# Linear Color Space: A Critical Step in Data-Driven Color Rendering

## The Problem You Didn't Know You Had

When your application maps data values to colors — interpolating between two colors, alpha-blending a foreground onto a background, or computing a weighted color average — you're doing arithmetic on RGB values. If those values are in sRGB (the standard encoding used by CSS, hex colors, `ImageData` buffers, PNG files, and virtually every color picker), the arithmetic is wrong.

sRGB is **gamma-encoded**. The relationship between the stored value and the physical light intensity it represents is nonlinear. A pixel value of 128 does not represent half the light of 255 — it represents roughly 21.4% of the light. This encoding exists because human vision is more sensitive to differences in dark tones than bright ones, so gamma encoding allocates more of the 0-255 range to shadows where our eyes need the precision.

The consequence: any time you do math on sRGB values as if they were linear quantities, you get the wrong answer.

## Where This Matters

Any operation that treats color channel values as numbers to be combined:

| Operation | Example | Effect of sRGB Error |
|---|---|---|
| **Linear interpolation** | Gradient from red to white | Midtones appear too dark and oversaturated |
| **Alpha compositing** | Translucent overlay on background | Blended region appears darker than it should |
| **Weighted averaging** | Blending N colors by weight | Result skews toward darker values |
| **Additive blending** | Combining light contributions | Highlights are too dim, darks too muddy |
| **Scaling brightness** | `color * 0.5` for dimming | Non-uniform dimming; shadows crushed, highlights barely affected |

These operations are pervasive in scientific visualization, where the viewer needs to reliably read quantitative meaning from color.

## The Correct Pipeline

```
sRGB input (0-255)
    │
    ▼
Linearize (gamma decode)
    │
    ▼
Do your math (interpolate, blend, average, scale)
    │
    ▼
Gamma encode (back to sRGB)
    │
    ▼
Write to output (canvas ImageData, CSS, texture, etc.)
```

## The Conversion Functions

### sRGB to Linear (Gamma Decode)

The official sRGB transfer function, for a channel value normalized to [0, 1]:

```
linear = srgb <= 0.04045
       ? srgb / 12.92
       : ((srgb + 0.055) / 1.055) ^ 2.4
```

In JavaScript, operating on 0-255 input:

```js
function srgbToLinear(c255) {
    const c = c255 / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
```

### Linear to sRGB (Gamma Encode)

The inverse, producing a 0-255 integer:

```js
function linearToSrgb(c) {
    const s = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055
    return Math.round(s * 255)
}
```

### Lookup Table for Performance

The sRGB-to-linear direction has only 256 possible inputs, making a precomputed table trivial:

```js
const srgbToLinearLUT = new Float64Array(256)
for (let i = 0; i < 256; i++) {
    const c = i / 255
    srgbToLinearLUT[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
```

A single array lookup replaces the power function, which matters when processing thousands of pixels.

## Concrete Example: Why It's Visibly Wrong

Consider interpolating between red `(255, 0, 0)` and white `(255, 255, 255)` at the midpoint (`t = 0.5`).

### In sRGB (incorrect)

```
r = 255 * 0.5 + 255 * 0.5 = 255
g = 0   * 0.5 + 255 * 0.5 = 128
b = 0   * 0.5 + 255 * 0.5 = 128
Result: (255, 128, 128) — a dark, saturated pink
```

### In linear space (correct)

```
Convert to linear:
  red_linear:   (1.0, 0.0, 0.0)
  white_linear: (1.0, 1.0, 1.0)

Interpolate:
  (1.0, 0.5, 0.5)

Convert back to sRGB:
  linearToSrgb(1.0)  = 255
  linearToSrgb(0.5)  = 188
  linearToSrgb(0.5)  = 188
Result: (255, 188, 188) — a brighter, more natural pink
```

The sRGB midpoint (128) represents 21.4% of linear light. The correct midpoint (188) represents 50%. The difference is clearly visible — the naive version produces a gradient with an unnatural dark band in the middle.

## Application to Common Rendering Patterns

### Pattern 1: Color Gradient (e.g., Distance Map)

Mapping a scalar value `t` in [0, 1] to a color between `colorA` and `colorB`:

```js
// WRONG — interpolating in sRGB
const r = Math.floor(colorA.r * (1 - t) + colorB.r * t)

// CORRECT — linearize, interpolate, re-encode
const aR = srgbToLinearLUT[colorA.r]
const bR = srgbToLinearLUT[colorB.r]
const r = linearToSrgb(aR * (1 - t) + bR * t)
```

Convert both endpoints to linear once before the loop; only the `linearToSrgb` call happens per pixel.

### Pattern 2: Alpha Compositing (e.g., Contact Map)

Blending a foreground color with alpha onto a background:

```js
// WRONG — blending in sRGB
const out = Math.floor((fg * alpha + bg * (255 - alpha)) / 255)

// CORRECT — blend in linear space
const fgL = srgbToLinearLUT[fg]
const bgL = srgbToLinearLUT[bg]
const alpha01 = alpha / 255
const out = linearToSrgb(fgL * alpha01 + bgL * (1 - alpha01))
```

### Pattern 3: Weighted Color Average (e.g., Blending N Colors)

```js
// WRONG — averaging sRGB values
const avgR = colors.reduce((sum, c) => sum + c.r, 0) / colors.length

// CORRECT — average in linear space
const avgR = linearToSrgb(
    colors.reduce((sum, c) => sum + srgbToLinearLUT[c.r], 0) / colors.length
)
```

### Pattern 4: Brightness Scaling

```js
// WRONG — scaling sRGB
const dimmed = Math.floor(color.r * 0.5)

// CORRECT — scale in linear space
const dimmed = linearToSrgb(srgbToLinearLUT[color.r] * 0.5)
```

## When You Get It For Free

Some rendering systems handle this automatically:

- **Three.js** (with color management enabled, the default since r152): When you set a color using `setRGB(r, g, b, THREE.SRGBColorSpace)`, Three.js converts to linear internally. All shading, lighting, and material blending happens in linear space. The renderer applies gamma encoding when writing to the screen. PR #9 in Spacewalk ensured colors are correctly tagged as sRGB on input so this pipeline works.

- **CSS/SVG gradients**: The browser engine handles the interpolation. As of CSS Color Level 4, you can explicitly request linear interpolation with `color-interpolation: linearRGB`, though browser defaults vary.

- **WebGL/GPU shaders**: If your textures are marked as `SRGB` format, the GPU linearizes on sample and re-encodes on framebuffer write. Your shader math happens in linear space automatically.

## When You Must Do It Yourself

- **Canvas 2D `ImageData`**: You're writing raw bytes to a buffer. The browser interprets them as sRGB. No automatic conversion happens — you're on your own.

- **Any manual RGB arithmetic**: `lerp()`, `compositeColors()`, weighted averages, brightness adjustments — anywhere you treat channel values as numbers.

- **Color values from UI pickers, CSS strings, hex codes**: These are always sRGB-encoded. Before using them in calculations, linearize.

## Linear RGB vs. Perceptual Color Spaces (Lab, OKLab)

Linear RGB is **physically correct** — it models how light actually combines. For compositing and blending, it's the right choice.

For generating perceptually uniform gradients (where equal steps in data produce equal perceived color steps), perceptual color spaces like CIELAB or OKLab are superior. They account for the nonlinearities of human color perception beyond just gamma.

However, for most data visualization use cases:

- **Linear RGB** is sufficient and fast. The improvement over naive sRGB is dramatic; the further improvement from Lab is subtle.
- **Lab/OKLab** is worth the cost when perceptual uniformity is paramount (e.g., colormaps for quantitative analysis, accessibility-sensitive palettes).
- For two-color interpolation (which is the case in contact maps and distance maps), linear RGB produces good results. The Lab advantage becomes more pronounced with multi-hue gradients.

## Checklist for Auditing an Application

When reviewing a codebase for this issue, look for:

1. **Color interpolation / lerp functions** — Are they operating on raw 0-255 or hex-derived values? If so, they're in sRGB.

2. **Alpha blending / compositing** — Is `fg * alpha + bg * (1 - alpha)` being computed on sRGB values?

3. **Weighted color averages** — Averaging sRGB values directly?

4. **Canvas `ImageData` manipulation** — Any per-pixel color computation written to an `ImageData` buffer is a candidate.

5. **Color scaling** — Multiplying or dividing channel values for brightness, dimming, or highlighting?

6. **Texture generation** — Procedurally filling pixel data for use as textures?

In each case, the fix is the same three-step pattern: linearize inputs, do the math, gamma-encode the output.

## Summary

| | sRGB (gamma-encoded) | Linear RGB |
|---|---|---|
| **What it is** | Perceptually spaced encoding for storage and display | Physically proportional to light intensity |
| **Where it lives** | Hex colors, CSS, PNG, JPEG, ImageData, color pickers | Inside rendering pipelines, shader math, Three.js internals |
| **Good for** | Storing and displaying final pixel values | Arithmetic: blending, interpolating, compositing, scaling |
| **Bad for** | Math — interpolation produces dark, saturated artifacts | Direct display — would look washed out without re-encoding |

The rule is simple: **do math in linear space, store and display in sRGB**. Any time you're doing arithmetic on color values that will be seen by a human, apply this pipeline. The visual improvement is immediate, and the computational cost (one LUT lookup per channel on input, one power function per channel on output) is negligible.
