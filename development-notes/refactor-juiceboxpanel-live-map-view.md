# Refactor RFC: Extract the live-map render surface from `JuiceboxPanel`

**Status:** Accepted — A+C hybrid (not yet implemented)
**Date:** 2026-05-29
**Subsystem doc:** [interaction-diagram-spacewalk-juicebox.md](interaction-diagram-spacewalk-juicebox.md) — read that first for how the live maps work today.
**Origin:** Item #5 ("large multi-responsibility modules") of the tech-debt hotspot map; second deepening candidate. Follows the pattern set by the IGVPanel registry extraction ([refactor-igvpanel-material-provider-registry.md](refactor-igvpanel-material-provider-registry.md), shipped in PR #53).

## Why (and an honest scope note)

`src/juicebox/juiceboxPanel.js` (571 lines) is the Juicebox browser integration panel, but it has
also become the owner of the **live-map render surface** — it creates the two live `<canvas>`
elements, sizes them, builds spinner overlays, and stashes their 2d contexts on Juicebox's
`contactMatrixView`. The live-map *services* then reach back through the panel to draw.

Unlike the IGVPanel registry (which was rich in invisible session/reconciliation logic, ideal for
boundary tests), **this cluster is mostly DOM choreography and pixel rendering** — the stuff the
viewport audits better than any assertion. So the prize here is **untangling and clear ownership,
not testability.** There is exactly one piece of genuinely invisible logic worth a test (the
live-map config derivation); everything else is verified by looking at the maps.

### The tangle: a bidirectional dependency + a shared-mutable side-channel

```
                 ┌─────────────── repaint forwarding ──────────────┐
                 ▼                                                  │
   LiveContactMapService ──reaches into──► JuiceboxPanel.browser.contactMatrixView.ctx_live_*
   (lcm, threshold slider,                 (creates/sizes canvases, spinners, stashes ctx)
    Calculate, color read)
```

- **JuiceboxPanel** (`initializeLiveMapCanvases`, `updateLiveMapCanvasSizes`,
  `showLiveMapSpinner`/`hideLiveMapSpinner`) creates the canvases and stashes their contexts on
  Juicebox's `contactMatrixView` as `ctx_live_contact` / `ctx_live_distance` — a shared-mutable
  side-channel.
- **LiveContactMapService** reaches *back* through `juiceboxPanel.browser.contactMatrixView.ctx_live_*`
  to find the canvas to draw on, and calls `juiceboxPanel.showLiveMapSpinner()` /
  `updateLiveMapCanvasSizes()`.
- Net: panel → service (forwards color/tab repaints) **and** service → panel (grabs canvas +
  spinner). A cycle, stitched by a late `wireDependencies`.

`liveMapRenderUtils.js` (the render math) is already pure and deep — the model the rest should look like.

### Three concerns mashed together
- **(A) Render surface** — canvases, 2d contexts, sizing, spinners. *Trapped in the panel, reached-into by the services.* ← extraction target
- **(B) Compute** — the hic-straw `LiveContactMap` instance, threshold slider, Calculate, color sourcing. *LiveContactMapService / LiveDistanceMapService.*
- **(C) Juicebox tab/navbar choreography** — `assessTab` (~100 lines), `configureTabs`. *Legitimately the panel's job, but `assessTab` is overgrown.*

## Problem space

### What the extracted `LiveMapView` should own
The two live canvases + their 2d contexts, container creation/placement inside the Juicebox
viewport, sizing to the viewport, spinner overlays, and the contact/distance/hic canvas show-hide
that `assessTab` currently does inline.

### What it should hide
The `ctx_live_*` contexts (no longer stashed on `contactMatrixView` as a public side-channel), the
container DOM structure, and the spinner overlay markup.

### Constraints any design must honor
- **C1 — embedded surface.** The live canvases physically live *inside* Juicebox's viewport DOM
  (`browser.layoutController.getContactMatrixViewport()`) and size to its viewport. The view needs
  a handle to the Juicebox viewport/`contactMatrixView`; it can't be a free-floating element.
- **C2 — color source.** Colors are read from Juicebox (`contactMatrixView.colorScale`,
  `backgroundColor`). Something must read them at render time.
- **C3 — three repaint triggers.** Repaint is requested from tab switch (`assessTab`), the
  color-change coordinator callbacks, and the threshold slider. All must be able to drive a repaint.
- **C4 — lcm registration.** `calculateLiveMaps` calls `browser.loadLiveContactMap(...)` — a
  Juicebox-browser operation, not a surface operation.
- **C5 — ensemble reset.** The `DidLoadEnsembleFile` canvas-clearing + `lcm = null` behavior must survive.
- **C6 — session reload.** `loadSession` tears down and rebuilds the Juicebox browser DOM; the view
  must be (re)mountable against the fresh viewport.

### Grounding sketch (constraints made concrete — not a proposal)
```js
// today — the surface is owned by the panel but accessed by the service via a side-channel:
this.juiceboxPanel.browser.contactMatrixView.ctx_live_contact   // service draws here
this.juiceboxPanel.showLiveMapSpinner()                          // service toggles panel spinner
// and the panel forwards back:
this.liveContactMapService.repaintContactMap({ background: rgb })
```

## Dependency classification
- **Render math** (`liveMapRenderUtils`): **In-process**, pure — already testable, no change needed.
- **Render surface** (`LiveMapView`): depends on the Juicebox browser viewport DOM — **True
  external** (juicebox.js). Narrow handle (`getViewport`) injected.
- **Compute** (`LiveContactMap`): hic-straw — **True external**, but already an injected constructed
  instance. Config derivation around it is **In-process**.

## Candidate designs

### Design A — Extract a `LiveMapView` (surface owner); keep the services for compute
```js
class LiveMapView {
  constructor({ getViewport })   // getViewport() -> Juicebox contactMatrixView
  mount(); resize(); clear()
  renderContact(lcm, colors); renderDistance(lcm, colors)
  showSpinner(which); hideSpinner()
  showContact(); showDistance(); showHic()   // absorbs canvas show/hide from assessTab
}
```
Panel owns the view; services receive it instead of reaching through `juiceboxPanel.browser…`.
Kills the `ctx_live_*` side-channel and the service→panel reach. *Trade-off:* smallest change,
clear ownership; doesn't merge the two services or fully tame `assessTab`.

### Design B — Merge everything into one `LiveMapController`; panel becomes a thin host
Fold both services + the surface into one controller (lcm, canvases, slider, Calculate, render).
Panel exposes only a mount point + `onTabShown` / `onColorChange`. *Trade-off:* biggest
consolidation — cycle and the two-service split both vanish (the distance service is already a
satellite) — but largest blast radius, merges files.

### Design C — Panel owns the surface; services go pure-ish (render target passed in)
Invert ownership: panel owns a `LiveMapRenderTarget`; services hold only the lcm + compute and
render *into* a target passed as an argument: `service.repaintContact(target, colors)`. *Trade-off:*
dependency graph becomes a clean DAG, but every render call site must supply the target.

### Design D — Ports & adapters around Juicebox
Define a `JuiceboxSurface` port (`viewportElement()`, `attachCanvas()`, `foreground/backgroundColor()`,
`onColorChange()`, `onTabShown()`); production adapter wraps the real browser; the cluster depends
only on the port and is testable with a fake. *Trade-off:* most testable/cleanest isolation, but
juicebox.js's surface (`contactMatrixView`, `layoutController`, `coordinator`, `colorScale`) is
broad and leaky — pinning the port is real work for a mostly-visual payoff.

## Decision — A + C hybrid

Extract a **`LiveMapView`** that the **panel owns** (A), and have the services **receive the view**
rather than reaching back through `juiceboxPanel.browser.contactMatrixView` (C). Move the
contact/distance/hic canvas show-hide out of `assessTab` into the view to shrink that method.

Why this breaks the tangle, as a clean DAG:
```
   JuiceboxPanel ──owns──► LiveMapView ◄──renders into── LiveContactMapService / LiveDistanceMapService
        │                                                          ▲
        └──────────────── triggers repaint ───────────────────────┘
```
- panel → view (owns/mounts/sizes), panel → service (repaint triggers on tab/color change),
  service → view (draws). **No service → panel back-edge; no `ctx_live_*` side-channel.**
- The services still need the Juicebox browser for color reads (C2) and `loadLiveContactMap` (C4),
  but via a narrow `getJuiceboxBrowser()` handle — **not** the whole panel.

**Deferred:** Design B's full service-merge (the two services are really one concept — note it as a
follow-up once the surface is out) and Design D's full Juicebox port (expensive for a visual payoff).

## Testing strategy

Per the project's selective, viewport-first philosophy (see `feedback_test_invisible_logic_only`):
**one** test, on the only invisible logic in the cluster.

- **New test:** extract the live-map config derivation from `calculateLiveMaps` — the chromosome-list
  build, the `all`-chromosome reordering to index 0, the `binSize` math, and the
  pointcloud-bake-vs-runtime branch — into a pure function and test *that* (given a genome +
  locus + datasource flags, it produces the expected `LiveContactMap` config).
- **Not tested:** canvas sizing, spinner toggling, tab show/hide, and all rendering — verified by
  looking at the maps in the viewport.
- **Test environment:** none beyond plain objects — the derivation is pure.

## Implementation recommendations (durable, not path-coupled)
- The **view** owns every reference to the live canvases and their contexts; nothing else stashes a
  context on `contactMatrixView`.
- The **panel** owns the view's lifecycle: `mount()` on session load (replacing
  `initializeLiveMapCanvases`), `resize()` where it currently calls `updateLiveMapCanvasSizes`,
  re-mount on `loadSession` (C6).
- The **services** depend on the view (surface) + a narrow Juicebox-browser handle (color reads +
  `loadLiveContactMap`), never the whole panel.
- Keep `liveMapRenderUtils` exactly as-is — it's the pure core the view delegates to.

## Open questions
- **Color sourcing:** should the view read fg/bg from Juicebox (centralizing the `colorScale` /
  `backgroundColor` read), or should callers pass colors in (keeping the view ignorant of Juicebox
  color state)? Leaning: callers pass colors, view stays pure-ish.
- **lcm registration:** `browser.loadLiveContactMap(...)` is a Juicebox-integration call living in
  the service — leave it there (service holds the browser handle) or hand it to the panel?
- **Service merge:** revisit Design B (merge contact + distance services) after the surface is
  extracted, once the remaining coupling is visible.
