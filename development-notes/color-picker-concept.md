# Anchored Color Picker — Concept & Implementation Notes

## The Problem with Traditional Color Pickers

Standard HSL wheels and RGB sliders suffer from what might be called the **blank canvas problem**: the space is too open. Most people don't think in terms of hue angles or saturation percentages. They think in terms of named, recognizable colors — "something mossy," "a deep ocean blue," "a warm salmon."

Typical color pickers force users to navigate a continuous, unbounded space with no semantic footholds. The result is decision fatigue and imprecise color choices.

---

## The Concept: Anchor → Refine

The proposed interaction has two stages:

**Stage 1 — Anchor.** Present a grid of named, recognizable color dots (e.g. the Apple Crayon palette). The user picks the dot that puts them in the right neighborhood. The name of the color ("ocean," "moss," "cayenne") carries semantic weight and gives the user immediate confidence they're in the right territory.

**Stage 2 — Refine.** Clicking a dot opens a small postage-stamp-sized variation tile — a compact n×n grid of swatches derived from the anchor color. The tile explores a bounded region of HSL space around the chosen color, holding hue roughly fixed while varying saturation and lightness. The user taps or clicks their preferred shade.

The constraint is the feature, not a limitation. By locking variation to a neighborhood, the picker eliminates the anxiety of infinite possibility. You cannot accidentally turn ocean blue into hot pink.

---

## The Variation Tile

The tile is an n×n grid of swatches. Each cell represents a point in a 2D slice of HSL space:

- **Horizontal axis** — saturation, from desaturated (left) to fully saturated (right)
- **Vertical axis** — lightness, from bright (top) to dark (bottom)
- **Hue** — held fixed at the anchor color's hue (with optional small drift, ±10–15°, for warmth/coolness variation)

A ring or crosshair marks the position of the original anchor color within the tile, so the user can always see where "home" is and navigate relative to it.

The tile is intentionally small — roughly postage-stamp sized. The quantization to an n×n grid is a UX feature: it gives the user discrete, tappable targets rather than a continuous field requiring pixel-precise interaction.

---

## JavaScript Implementation

### Hex → HSL conversion

```js
function hexToHSL(hex) {
  let r = parseInt(hex.slice(1, 3), 16) / 255;
  let g = parseInt(hex.slice(3, 5), 16) / 255;
  let b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;

  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100)
  };
}
```

### Generate the n×n variation grid

Given an anchor hex color and a grid size `n`, this returns a 2D array of HSL strings representing the variation tile. Saturation and lightness ranges are configurable.

```js
/**
 * Generate an n×n variation grid centered on an anchor color.
 *
 * @param {string} hex        - Anchor color, e.g. "#004a88"
 * @param {number} n          - Grid dimension (7 → 7×7, 10 → 10×10)
 * @param {object} options
 *   @param {number} sMin     - Minimum saturation % (default 20)
 *   @param {number} sMax     - Maximum saturation % (default 100)
 *   @param {number} lMin     - Minimum lightness % (default 12)
 *   @param {number} lMax     - Maximum lightness % (default 75)
 *   @param {number} hDrift   - Max hue drift in degrees (default 0)
 *
 * @returns {object} {
 *   grid: string[][],       // n×n array of "hsl(h, s%, l%)" strings
 *   anchorCol: number,      // column index nearest to anchor
 *   anchorRow: number       // row index nearest to anchor
 * }
 */
function generateVariationGrid(hex, n = 7, options = {}) {
  const {
    sMin = 20,
    sMax = 100,
    lMin = 12,
    lMax = 75,
    hDrift = 0
  } = options;

  const { h, s, l } = hexToHSL(hex);

  const grid = [];

  for (let row = 0; row < n; row++) {
    const rowColors = [];
    // Lightness decreases top-to-bottom: row 0 = lMax, row n-1 = lMin
    const lightness = lMax - (row / (n - 1)) * (lMax - lMin);

    for (let col = 0; col < n; col++) {
      // Saturation increases left-to-right
      const saturation = sMin + (col / (n - 1)) * (sMax - sMin);

      // Optional hue drift: left = cooler (−hDrift), right = warmer (+hDrift)
      const hue = hDrift > 0
        ? h + (col / (n - 1) - 0.5) * 2 * hDrift
        : h;

      rowColors.push(`hsl(${Math.round(hue)}, ${Math.round(saturation)}%, ${Math.round(lightness)}%)`);
    }

    grid.push(rowColors);
  }

  // Find the grid cell nearest to the original anchor color
  const anchorCol = Math.round((s - sMin) / (sMax - sMin) * (n - 1));
  const anchorRow = Math.round((lMax - l) / (lMax - lMin) * (n - 1));

  return {
    grid,
    anchorCol: Math.max(0, Math.min(n - 1, anchorCol)),
    anchorRow: Math.max(0, Math.min(n - 1, anchorRow))
  };
}
```

### Example usage

```js
const appleCrayonPalette = {
  ocean:      "#004a88",
  moss:       "#018448",
  cayenne:    "#891100",
  maraschino: "#ff2101",
  // ... etc
};

// 7×7 grid for "ocean"
const result = generateVariationGrid(appleCrayonPalette.ocean, 7);
console.log(result.grid);        // 7×7 array of hsl() strings
console.log(result.anchorCol);   // column where original sits
console.log(result.anchorRow);   // row where original sits

// 10×10 grid with slight hue drift for warmth variation
const result10 = generateVariationGrid(appleCrayonPalette.ocean, 10, {
  sMin: 15,
  sMax: 100,
  lMin: 10,
  lMax: 80,
  hDrift: 12   // ±12° hue range across horizontal axis
});
```

---

## Rendering the Tile (Canvas approach)

The variation tile renders efficiently onto a `<canvas>` element. The anchor position is marked with a ring.

```js
function renderVariationTile(canvas, hex, n = 7, cellSize = 18) {
  const { grid, anchorCol, anchorRow } = generateVariationGrid(hex, n);
  const ctx = canvas.getContext('2d');

  canvas.width  = n * cellSize;
  canvas.height = n * cellSize;

  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      ctx.fillStyle = grid[row][col];
      ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
    }
  }

  // Draw anchor ring
  const cx = anchorCol * cellSize + cellSize / 2;
  const cy = anchorRow * cellSize + cellSize / 2;
  const r  = cellSize * 0.32;

  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();

  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
}
```

---

## Design Notes

- **Tile size** — 7×7 at 18px/cell = 126px². At 10×10 it's 180px². Both fit comfortably in a postage-stamp popup without overwhelming the surrounding UI.
- **Hue drift** — keeping `hDrift: 0` produces a pure saturation/lightness grid. Setting it to ~10–15° lets the user shift slightly warm or cool, which is useful for neutrals and near-whites.
- **Saturation floor** — `sMin` should not go to 0 unless you want a gray column. A floor of 15–25% keeps all swatches feeling related to the anchor hue.
- **Popup UX** — the tile works best as a floating panel positioned adjacent to the tapped dot, dismissed by tapping elsewhere. On touch targets, `cellSize` should be at least 22–24px for comfortable selection.
- **Output** — the selected color can be returned as an HSL string, converted back to hex, or passed directly to a CSS custom property.

---

## Summary

| Step | What happens |
|------|-------------|
| User sees | Grid of named Apple Crayon dots, grouped by family |
| User taps dot | Postage-stamp variation tile appears, n×n HSL grid |
| Anchor ring | Shows where the original named color sits in the tile |
| User taps swatch | Color is selected; tile dismisses |
| Output | HSL string or hex, ready to use |

The two-stage approach matches how people actually reason about color: coarse semantic intent first, precise numeric value second.
