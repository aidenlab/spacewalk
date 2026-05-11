# SVG Export Plan — Ball-and-Stick 3D Viewer

Plan for exporting the Three.js ball-and-stick scene as a true vector SVG by projecting 3D primitives to 2D and emitting `<circle>` + `<line>` elements directly. Picked over alternatives (built-in `SVGRenderer`, raster-in-SVG, community renderers) because it produces the smallest, cleanest, publication-quality output and gives full styling control.

## Alternatives considered (for context)

1. **Three.js `SVGRenderer`** (`examples/jsm/renderers/SVGRenderer.js`) — drop-in, but flat-shaded only, tessellates every face into `<path>`, large files. Good for schematic exports.
2. **Project-and-emit (this plan)** — ~150 lines, clean output, tiny files, full control.
3. **Raster PNG embedded in SVG** — trivial but defeats vector benefit.
4. **`three-svg-renderer` (community)** — true vector with hidden-line removal; heavier integration, varying maintenance.

## Data sources (already in scene)

- **Atom centers + radii:** `BallAndStick.balls` InstancedMesh — `js/ballAndStick.js:97`. Read each instance's matrix → world position. Sphere radius = `balls.geometry.parameters.radius`.
- **Atom colors:** `instanceColor` InstancedBufferAttribute — `js/ballAndStick.js:85-90`. Per-vertex RGB from `ColorRampMaterialProvider`.
- **Bond pairs:** sequential along trace — `(vertex[i], vertex[i+1])` plus closure `(vertex[n-1], vertex[0])` if `spacewalkConfig.isCircular` — `js/ballAndStick.js:127-165`. Re-derive from trace; don't read cylinder meshes.
- **Camera:** PerspectiveCamera — `js/initializers/threeJSInitializer.js:70`.
- **Renderer/canvas size:** `#spacewalk-threejs-canvas-container` — `js/initializers/threeJSInitializer.js:38-46`.
- **Background color:** `js/initializers/threeJSInitializer.js:56-63`.

## Module layout

New file: `js/utils/svgExporter.js`. Single entry point:

```js
exportBallAndStickSVG({ scene, camera, renderer, ballAndStick, options }) → string
```

## Algorithm

### Step 1 — Gather primitives in world space
- Per atom `i`: `balls.getMatrixAt(i, m)`, extract translation → world position. Read `instanceColor` → RGB. Radius from `balls.geometry.parameters.radius` × uniform instance scale.
- Bond list = `[i, i+1]` index pairs from trace length, plus closure if circular. Bond color: uniform gray (confirm against current cylinder material).

### Step 2 — Project to screen space
- For each world point `p`: `p.clone().project(camera)` → NDC `[-1,1]`. Convert to pixel coords using canvas width/height.
- Record NDC z per atom and per bond endpoint — painter's-algorithm key.
- **Project sphere radius:** take a second world point offset by `radius` along camera-right basis vector (`camera.matrixWorld`), project it, take pixel distance to center → screen-space radius. Handles perspective foreshortening.
- Project cylinder radius the same way for stroke-width.

### Step 3 — Build draw list with depth
- Atoms: `{ kind: 'atom', cx, cy, r, color, z: ndcZ }`.
- Bonds: `{ kind: 'bond', x1, y1, x2, y2, strokeWidth, z: avg(endpointZ) }`.
- Sort combined list by `z` descending (far → near).

### Step 4 — Occlusion handling
Naive painter's algorithm causes bonds to pierce through near spheres.
- **Cheap:** z-sort only. Mostly correct; occasional artifacts.
- **Recommended:** clip each bond's endpoints inward by the projected sphere radius of its end atoms. Bond renders edge-to-edge, never enters atom disk. ~5 lines of math.

### Step 5 — Fake shading (optional)
For each atom, emit a `<radialGradient>` (offset center toward upper-left for highlight) referenced by `<circle>` fill. **Dedupe by color** to keep file size sane. Without this, atoms are flat colored disks (fine for schematic style).

### Step 6 — Assemble SVG
- Root `<svg viewBox="0 0 W H">`.
- `<rect>` background using scene background color.
- `<defs>` with deduped radial gradients.
- Sorted `<line>` + `<circle>` elements.
- **v2:** colorbar chrome (`#spacewalk_color_ramp_canvas_rgb`) — emit `<linearGradient>` + `<rect>` + `<text>` for `18Mb`/`20Mb` labels. Defer.

## UI integration

- Mirror an existing pattern (no PNG/SVG export currently exists).
- Wire function first, expose as `window.exportSVG()` for console testing. Add a button in `js/panels/` once output looks right.
- Trigger flow: build string → Blob → object URL → synthetic `<a download="spacewalk.svg">` click.

## Open questions before coding

1. **Cylinder radius value** — read from `js/ballAndStick.js:13` to project for stroke-width.
2. **Bond color** — uniform gray, or interpolate between endpoint atom colors? Current code suggests uniform gray; confirm.
3. **Shading style** — flat disks (smallest file, schematic) vs. radial-gradient pseudo-3D (matches screenshot look). Pick one for v1.
4. **Colorbar inclusion** — v1 = scene only. v2 = include colorbar chrome.

## Scope estimate

~150 lines for exporter, ~20 lines for UI hook. One afternoon including iteration on occlusion + shading.

## Suggested v1 starting point

Flat-disk atoms, clipped-line bonds (Step 4 recommended path), no colorbar, exposed via `window.exportSVG()` for testing. Iterate from there.

## Key file references

- `js/ballAndStick.js` — scene primitives, instance colors, bond derivation
- `js/colorRampMaterialProvider.js:24-40` — atom color source
- `js/initializers/threeJSInitializer.js:38-70` — renderer, camera, canvas, background
- `js/app.js:298-326` — render loop (integration reference, not modified)
- `js/genomicNavigator.js:24-27` + `index.html:462` — colorbar canvas (for v2)
- `js/utils/colorMapManager.js:193-210` — existing canvas-2D-to-dataURL pattern, model for export trigger
