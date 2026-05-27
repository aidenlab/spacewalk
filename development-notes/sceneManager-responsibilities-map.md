# SceneManager Responsibilities Map

Working document for the Phase 3 deepening pass. Goal: make `js/sceneManager.js`
(425 lines) tractable by extracting cohesive pieces into modules with narrower
interfaces.

Status: draft — 2026-05-27.

---

## Current shape

One class, one file, ~10 responsibilities mixed together. Constructor does
real work (color-picker DOM lookups + event-bus subscriptions). External
consumers reach into roughly 20 distinct properties/methods, several of which
are internal state (`ballAndStick`, `pointCloud`, `renderStyle`, `ballHighlighter`).

`SettingsManager.load()` is called three separate times inside the class.

## The 10 things SceneManager does

| # | Responsibility | Lives in | Cohesion |
|---|---|---|---|
| 1 | Owns the three visualization objects (`ballAndStick`, `pointCloud`, `ribbon`); creates/disposes them per trace | `setupWithTrace`, `purgeScene`, `rebuildTraceGeometry` | **core** |
| 2 | Carries persistent visualization state across model loads (stickMaterial, isStickVisible, ballRadiusIndex, pointOpacity, pointSizeBoundRadiusPercentage, deemphasizedColor) | constructor + `purgeScene` capture | **core** |
| 3 | Owns the two pick-highlighters | constructor; leaked publicly to `picker.js` | **core** |
| 4 | Creates / disposes / accessor-names the scene fixtures (Gnomon, GroundPlane, HemisphereLight) | `setupWithTrace`, `purgeScene`, `getGnomon`, `getGroundPlane`, `getHemisphereLight` | **fixtures** |
| 5 | Wires the gnomon + groundplane color pickers (DOM querySelector inside constructor) | constructor | **fixtures** |
| 6 | Owns ScaleBarService (instantiates it, exposes accessor) | `initializeScaleBarService`, `getScaleBarService` | **scale bars** |
| 7 | Reads `SettingsManager.load()` to apply saved colors/visibility for groundplane, gnomon, scale bars, reference ruler | three separate sites | **fixtures** + **scale bars** |
| 8 | Orchestrates ensemble ingestion: drives `ensembleManager.loadURL` → setupWithTrace → camera reframe → igvPanel sync | `ingestEnsemblePath`, `ingestEnsembleGroup` | **ingestion controller** |
| 9 | Render-loop pump: per-frame fan-out to active viz, material-provider broadcast | `renderLoopHelper`, `updateMaterialProvider` | **core** |
| 10 | Event bus subscriber + delegate router (genomic interpolant, hide crosshairs, leave navigator, color map change) | constructor subscribes; `receiveEvent`, `delegate*` methods | **core** |

## Cohesion groups

- **Core** (1, 2, 3, 9, 10) — the actual job of a "scene manager": active
  visualization, persistent settings, render pump, event routing. ~200 lines.
- **Fixtures** (4, 5, 7-partial) — Gnomon + GroundPlane + HemisphereLight have
  a coherent lifecycle (born in `setupWithTrace`, die in `purgeScene`) and
  bring their own settings-load + color-picker concerns with them.
- **Scale bars** (6, 7-partial) — already its own service class; SceneManager
  is just acting as a holder.
- **Ingestion controller** (8) — not really scene management. Coordinates
  EnsembleManager + IGVPanel + CameraLightingRig + SceneManager. Closer to
  app-level orchestration.

## Extraction candidates, ordered by ease

### Candidate A — ScaleBarService: hoist ownership out
**Effort:** XS. **Impact on SceneManager line count:** ~15 lines.

`ScaleBarService` is already a separate class. SceneManager just instantiates
it (`initializeScaleBarService`) and exposes it (`getScaleBarService`). Move
ownership up to `App` (or the `PanelInitializer` that already touches the
render container). Callers that today do `sceneManager.getScaleBarService()`
go through `app.scaleBarService` or get the reference passed in.

Why first: smallest blast radius. Sets the pattern of "if it's already a
service, the scene manager doesn't need to hold it for you."

### Candidate B — SceneFixtures module (Gnomon + GroundPlane + HemisphereLight)
**Effort:** S–M. **Impact on SceneManager line count:** ~80 lines (constructor color-picker block + setupWithTrace fixture setup + purgeScene fixture disposal + getters).

These three objects share a lifecycle (born with the trace, die with the
trace) and a settings story (load color + visibility from `SettingsManager`).
Their color-picker registration belongs with them, not with the visualization
owner.

Proposed shape: `new SceneFixtures(scene)` exposes `setupForBounds({min, max, center, radius})`, `dispose()`, `getGnomon()`, `getGroundPlane()`. Owns its own `SettingsManager.load()` read and its own color-picker bindings.

SceneManager keeps a `this.fixtures` reference; external callers either go
through `sceneManager.getGnomon()` (kept as a forwarder for one release) or
update to `sceneManager.fixtures.getGnomon()`.

### Candidate C — EnsembleIngestionController
**Effort:** M. **Impact on SceneManager line count:** ~50 lines.

`ingestEnsemblePath` and `ingestEnsembleGroup` are app-level orchestration:
they pull on `ensembleManager`, `igvPanel`, `cameraLightingRig`, *and*
SceneManager. They're called from `app.js` (URL params, postMessage,
drag-drop) and from `spacewalkFileLoadWidgetServices.js`.

This one is more invasive because callers are spread out and the orchestrator
ends up needing references to four collaborators. Save it for after A and B.

### Candidate D — leave the core
After A, B, C the remaining SceneManager (~200 lines) is a *real* scene
manager: active visualization + render pump + event routing. At that point
it's small enough to read top-to-bottom in one sitting, which is the goal.

## Recommended first move

**Candidate A** (ScaleBarService hoist). Smallest, lowest-risk, sets the
pattern. Then **B** (SceneFixtures), which is the biggest visible win.
Defer C until A and B have settled.

## Open questions

- Should `sceneManager.getGnomon()` / `getGroundPlane()` stay as forwarders
  forever, or do we update callers to go through `fixtures` directly? (Bias:
  update callers — forwarders accumulate.)
- The `picker.js` reading of `sceneManager.ballHighlighter` is a leak. Worth
  fixing during the core-deepening pass or earlier?
- `SettingsManager.load()` called from multiple sites is a smell — once
  fixtures own their own reads, is it still worth centralizing the rest?
