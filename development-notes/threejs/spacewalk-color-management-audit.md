# Spacewalk color management (Three.js sRGB / linear)

**Status:** Current. First audited 2026-03-12, refreshed 2026-11 against `src/` (three ^0.184).
**Origin:** We checked Spacewalk for the sRGB/linear mix-ups we fixed in PGB (commit `3cb2636`).
For the theory, see [../linear-color-space-for-data-visualization.md](../linear-color-space-for-data-visualization.md).

**Verdict:** sound. Three.js works in linear space and converts to sRGB on output. Every way a
color enters the scene says which space it's in.

---

## Renderer

`src/initializers/threeJSInitializer.js`:

```js
THREE.ColorManagement.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
```

## How colors enter, all in `src/utils/colorUtils.js`

| Source | Path | Why it's right |
|---|---|---|
| Apple Crayon palette | `appleCrayonColorThreeJS(name)` → `new THREE.Color(hex)` | Three.js treats hex input as sRGB and converts it. |
| Data RGB 0–255 (color ramps, color-map PNGs, color picker, track colors) | `rgb255ToThreeJSColor(r, g, b)` → `setRGB(..., THREE.SRGBColorSpace)` | This is the one central conversion. Its callers are `colorMapManager.js`, `sharedColorPicker.js` and `trackMaterialProvider.js`. |
| HSV | `hsvToThreeJSColor` → `setRGB(..., THREE.SRGBColorSpace)` | Same as above. |
| Back out to 0–255 for the UI | `threeJSColorToRGB255(color)` → `linearToSrgb` | The inverse of the above. |

The deprecated `.convertSRGBToLinear()` call, which was the old audit's one action item, is
gone. `rgb255ToThreeJSColor` uses `setRGB` with an explicit color space.

## Exceptions that are fine

- **Fallback red** in `src/colorRampMaterialProvider.js`: `new THREE.Color(1, 0, 0)`. Pure red is
  the same in both spaces.
- **Session round-trip:** `groundPlane.js`, `gnomon.js`, `referenceRuler.js`, `sceneFixtures.js`
  and the scene background in `threeJSInitializer.js` rebuild colors with
  `new THREE.Color(r, g, b)` from serialized `THREE.Color` components. Those components are
  already linear, so it's linear out and linear back in.
- **Ball-and-stick shader** (`src/ballAndStick.js`, `onBeforeCompile`) only replaces
  `#include <common>` and the `diffuseColor` line. `#include <colorspace_fragment>` survives.

## The rule for new code

Don't write `new THREE.Color(r, g, b)` with 0–1 values that came from sRGB data (a CSS color,
a PNG pixel, a user pick). Route them through `rgb255ToThreeJSColor`, or use
`setRGB(..., THREE.SRGBColorSpace)`. Bare `new THREE.Color(r, g, b)` is only correct for
components that are already linear, such as ones read back from a `THREE.Color`.
