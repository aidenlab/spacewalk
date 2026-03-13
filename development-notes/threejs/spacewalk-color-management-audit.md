# Spacewalk Color Management Audit

**Date:** 2026-03-12
**Audited by:** Claude Opus 4.6
**Context:** Reviewed Spacewalk's Three.js color handling against the same sRGB/linear issues we fixed in PGB (commit `3cb2636`).

---

## Renderer Setup: Correct

`js/initializers/threeJSInitializer.js:54-58`

```js
THREE.ColorManagement.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
```

Both settings are in place. Three.js works internally in linear space and converts to sRGB on output.

---

## What's Handled Correctly

### Hex strings (Apple Crayon palette)
The dominant color pattern throughout. Three.js auto-converts hex from sRGB to linear. No action needed.

### `rgb255ToThreeJSColor(r, g, b)` — central conversion function
`js/utils/colorUtils.js:180`

```js
function rgb255ToThreeJSColor(r, g, b) {
    return new THREE.Color(r/255, g/255, b/255).convertSRGBToLinear()
}
```

All data-sourced RGB (color ramps, color picker, color map PNGs) routes through this function. The sRGB→linear conversion is correct.

### Color ramps
`js/utils/colorMapManager.js` — both JSON arrays and PNG image pixel data are processed through `rgb255ToThreeJSColor()`. Correct.

### Color picker
User input RGB values route through `rgb255ToThreeJSColor()`. Correct.

### Custom shader (ballAndStick.js)
`js/ballAndStick.js:365-399` — uses `onBeforeCompile` on a MeshPhongMaterial. Only replaces `#include <common>` and the `diffuseColor` line. The `#include <colorspace_fragment>` chunk from MeshPhongMaterial survives untouched. Safe.

### Hardcoded fallback reds
`js/colorRampMaterialProvider.js:15,19,25` — `new THREE.Color(1, 0, 0)`. Since `(1, 0, 0)` is identical in both linear and sRGB, these are fine.

### Session state round-trip
`scaleBarService.js:159`, `groundPlane.js:60`, `gnomon.js:84`, `sessionServices.js:128` — all reconstruct colors via `new THREE.Color(r, g, b)` where `r, g, b` come from serialized `THREE.Color` properties (already linear). The round-trip is consistent: linear out, linear back in. No bug.

---

## Action Item: Deprecated API

`js/utils/colorUtils.js:180`

`.convertSRGBToLinear()` is deprecated in newer Three.js versions. Update to the modern equivalent:

```js
// Before (deprecated)
function rgb255ToThreeJSColor(r, g, b) {
    return new THREE.Color(r/255, g/255, b/255).convertSRGBToLinear()
}

// After (modern)
function rgb255ToThreeJSColor(r, g, b) {
    return new THREE.Color().setRGB(r/255, g/255, b/255, THREE.SRGBColorSpace)
}
```

This is a one-line change with no visual difference. `setRGB` with `SRGBColorSpace` tells Three.js the input is sRGB and it converts to linear internally — the same result, using the current API.

---

## Conclusion

Spacewalk's color management is sound. The `rgb255ToThreeJSColor()` centralizer and consistent use of hex strings means there are no sRGB/linear mix-ups of the kind we fixed in PGB. The only actionable item is modernizing the one deprecated `.convertSRGBToLinear()` call.
