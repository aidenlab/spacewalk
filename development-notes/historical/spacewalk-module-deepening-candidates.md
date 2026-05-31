# Spacewalk Module-Deepening Candidates

Date: 2026-05-29
Branch: `main`
Companion to: `spacewalk-tech-debt-hotspots.md` (this expands item #5, "Large multi-responsibility modules")

## Framing

The DI work (PRs #42–45) solved coupling *visibility* — every module now declares its
dependencies in its constructor instead of reaching for `app.js` singletons. It deliberately
did **not** deepen anything: it moved the wiring, not the responsibilities. That's why only
`SceneManager` actually shrank (it got a true split in Phase 3a); the other large modules are
within ±2 lines of their 2026-05-27 sizes.

A **deep module** (Ousterhout) has a small interface hiding a large implementation — more
testable, more AI-navigable, testable at the boundary instead of inside. Size turned out to be
a misleading proxy here: the real signal is interface-breadth vs. hidden-implementation, and
whether a cohesive concept is trapped inside a host object.

Re-measured sizes (post-DI):

| Module | 2026-05-27 | now | verdict |
|---|---|---|---|
| `juicebox/juiceboxPanel.js` | 576 | 571 → 441 | ✅ candidate 2 done (PR #56) — LiveMapView extracted |
| `IGVPanel.js` | 388 | 390 → 250 | ✅ candidate 1 done (PR #53) — registry extracted |
| `app.js` | 373 | 374 → 309 | ✅ candidate 3 done (PR #58) — launch-intent parser extracted |
| `ballAndStick.js` | 343 | 347 | big but already deep — leave it |
| `datasource/SWBDatasource.js` | — | 337 | deep, one layering smell — small fix |
| `sceneManager.js` | 425 | 292 | already split (Phase 3a) |

## Prioritized candidates

### Candidate 1 — Track→material-provider registry, trapped inside `IGVPanel` ✅ DONE (PR #53, merged 2026-05-29)

> Extracted to `MaterialProviderController` + a `TrackEnvironment` port (A+D hybrid).
> `IGVPanel` 390 → 250 lines. Repo's first automated tests (4 boundary tests on the invisible
> session/reconciliation logic). Fixed a pre-existing bug: removing a coloring track now drops
> its contribution and re-blends / falls back to the ramp. RFC:
> `development-notes/refactor-igvpanel-material-provider-registry.md`.
**Cluster:** `IGVPanel.js` (8 methods: `activate/deactivate/removeTrackFromMaterialProvider`,
`canUseTrackForMaterial`, `getUniqueTrackId`, `setMaterialProviderTrackChecked`,
`clear/getMaterialProviderCheckedTrackIds`) + the `materialProviderCheckedTracks` Map +
`trackMaterialProvider.js`.

**Why coupled:** IGVPanel owns the *entire* concept of "which IGV tracks drive the 3D model's
coloring" — activation rules, the checked-track Map, session persistence of checked IDs, and
provider-switching (track ↔ color-ramp). This is a cohesive sub-module wearing IGVPanel's skin.
It also transitively pokes `sceneManager.updateMaterialProvider` and `genomicNavigator.repaint`
on every change.

**Dependency category:** **In-process** for the registry/bookkeeping; the IGV browser itself is
**True external** (mock at the boundary — the registry only needs track identity + a zoom check,
not the whole browser).

**Test impact:** no existing tests to replace (zero-test repo); this *creates* the first testable
boundary. The activation/session-restore logic — the part most likely to harbor bugs, e.g. the
`|-1` / index-reconciliation in `getMaterialProviderCheckedTrackIds` — becomes testable with
plain track stubs instead of a live IGV browser.

**Why first:** most clearly-bounded concept, real lurking-bug surface, lowest risk, pops out
cleanly. Highest value-to-risk ratio of the three.

### Candidate 2 — Live-map rendering, trapped inside `JuiceboxPanel` ✅ DONE (PR #56, merged 2026-05-30)

> Extracted the live-map render surface to `LiveMapView` (owns the contact/distance
> canvases, their 2d contexts, spinner overlays, viewport sizing, and rendering). Broke
> the panel↔service cycle and removed the `ctx_live_*` side-channel JuiceboxPanel used to
> stash contexts on `contactMatrixView`; the live-map services now render through the view.
> `JuiceboxPanel` 571 → 441 lines. RFC:
> `development-notes/refactor-juiceboxpanel-live-map-view.md`.
> **Follow-up bug #55** (live map clobbered Juicebox's `.hic` `activeDataset` → Hi-C tab
> blurry after Calculate) fixed Spacewalk-side in **PR #57**: gate `loadLiveContactMap` so
> it fires only when no real `.hic` map is loaded (`activeDataset && !activeDataset.isLive`).
> No juicebox.js change needed — the live tabs already render to their own canvases.

**Cluster:** `juicebox/juiceboxPanel.js` (571 lines, ~20 public methods) + `liveContactMapService.js`
+ `liveDistanceMapService.js` + `liveMapRenderUtils.js`.

**Why coupled:** JuiceboxPanel personally builds and sizes the live-map canvas DOM
(`initializeLiveMapCanvases`, `updateLiveMapCanvasSizes`, spinner overlays), owns the canvas
references, *and* hand-wires `liveContactMapService` via `wireDependencies`, then forwards
color/repaint calls to it. The panel is doing Juicebox-browser integration **and** being the
live-map render surface — two concepts in one object.

**Dependency category:** mostly **In-process** (canvas/DOM is local-substitutable via jsdom).
Deepenable directly.

**Test impact:** extraction creates the first testable boundary for "given a contact matrix +
threshold, produce the rendered live map" — currently untestable without booting a full Juicebox
browser.

**Why second:** biggest *size* win, but touches DOM and three services, so more involved and
higher-risk than candidate 1.

### Candidate 3 — URL-param + session bootstrap, inside `App` ✅ DONE (PR #58, merged 2026-05-30)

> Shape C (pure core + thin executor, mirroring Candidate 1). Extracted `parseLaunchIntent(href)`
> → `{ kind: 'file' | 'session' | 'none' }` into `src/launchIntent.js` (zero imports, by-value
> tested) + a thin `SessionBootstrapper` executor + `sessionURLCodec.js` (isolates the lone
> `igv-utils`/BGZip touch). `app.js` lost `consumeURLParams`/`extractFileParam`/`spacewalkParams`;
> `sessionServices.js` lost `getUrlParams`/`uncompressSessionURL`. 8 new pure tests. `app.js`
> 374 → 309 lines. RFC: `development-notes/refactor-app-session-bootstrap.md`.
> Scope note: this is the **launch-URL front door only** — drag/drop, postMessage, GUI file-load,
> ensemble-group, and trace iteration keep their own paths; `ingestEnsemblePath` remains the
> shared ensemble-ingestion sink (the bootstrapper is one of its callers).
> Gotcha: vitest can't resolve `igv-utils`' entry, so the pure core must carry no igv-utils import.

**Cluster:** `app.js` (`consumeURLParams`, the spacewalk/juicebox/igv session-URL routing, the
param-parsing helpers) + `sessionServices.js`.

**Why coupled:** App is legitimately an orchestrator, but the "parse URL params → decide which
session source wins → restore it" decision logic is a distinct concern bolted onto the
render-loop/assembly root. The `assign*` methods are two-phase-construction scaffolding (already
partly relieved by the `initializers/` extraction).

**Dependency category:** **In-process** (pure routing/decision logic over param objects).

**Test impact:** session-precedence rules become unit-testable without constructing an `App`.

**Why third:** nice-to-have; smallest behavioral risk, least lurking-bug surface.

## Smaller, separate items

- **`SWBDatasource` → `guiManager` layering fix.** SWBDatasource imports
  `guiManager.updateEnsembleGroupDisplay` — a datasource reaching *up* into the GUI layer. Replace
  with an event/return value. Small targeted fix, not a deepening refactor.

- **Event-bus implicit coupling (cross-cutting theme, not a single-module refactor).** 11 modules
  subscribe to `SpacewalkEventBus`. That's *implicit* coupling — real dependencies hidden behind
  global pub/sub — and it's the main thing that will keep modules hard to test even after
  deepening. Worth a dedicated conversation; out of scope for the three candidates above.

## Explicitly not doing

- **`ballAndStick.js`** — big (347) but already deep: a small interface (`addToScene`, `dispose`,
  `updateBallRadius`, show/hide) hiding heavy THREE.js geometry construction (instanced meshes,
  the radius table, circular-genome convex-hull sticks). It's a leaf. Size is not the problem.

## Next action

**All three prioritized candidates shipped:** 1 (PR #53), 2 (PR #56 + bug #55 via PR #57),
3 (PR #58). What remains are the **smaller, separate items** above — pick when desired:
- `SWBDatasource → guiManager` layering fix (datasource reaching up into the GUI).
- Event-bus implicit coupling (cross-cutting; warrants its own conversation).
