# Refactor RFC: Extract the material-provider registry from `IGVPanel`

**Status:** Accepted — A+D hybrid (not yet implemented)
**Date:** 2026-05-29
**Subsystem doc:** [architecture-track-material-provider-checkbox.md](architecture-track-material-provider-checkbox.md) — read that first for how the feature works today.
**Origin:** Item #5 ("large multi-responsibility modules") of the tech-debt hotspot map; first deepening candidate.

## Why

`src/IGVPanel.js` (390 lines) is the IGV browser integration panel, but it has also become the
home of a second, cohesive concept: **which IGV tracks drive the 3D model's coloring**. That
concept is a state machine with its own data, rules, and persistence — currently spread across 8
methods and a `Map` field on the panel.

The Phase 3 DI work made `IGVPanel`'s dependencies explicit but did not deepen it. The coloring
state machine is untestable today without booting a live IGV browser, and its `name|index` track-id
scheme is **duplicated** in both `IGVPanel.getUniqueTrackId` and
`TrackMaterialProvider.getUniqueTrackId` — two implementations of one scheme, a latent drift bug.

### The central tension: two concerns, two caller sets

Grepping the callers shows the coupling splits cleanly in two:

1. **The registry / activation state machine** — "which tracks are checked, activate/deactivate,
   switch providers, persist & restore." Callers:
   - `src/igvTrackMaterialProviderShim.js` — the checkbox `change` handler
   - `src/sessionServices.js` — `getSessionState` / `restoreSessionState` / `clearMaterialProviderSessionState`
   - `src/utils/utils.js` — `clearMaterialProviderSessionState`
2. **The active provider** — the single mutable field `igvPanel.materialProvider`, **read by 8+
   rendering modules** on demand during render:
   `pointCloud.js`, `pointCloudHighlighter.js`, `ballHighlighter.js`, `ballAndStick.js`,
   `ribbon.js`, `genomicNavigator.js` (read), plus `sceneManager.js`,
   `ensembleIngestionController.js`, `panelInitializer.js` (read/write).

   This field is the *output* of concern #1. Its 8-reader blast radius is the dominant design
   constraint.

## Problem space

### What the extracted module should own
1. The set of embedding-checked tracks (`Map<trackId, true>`) — the single source of truth.
2. The canonical `trackId` scheme (`name|index`) — consolidating the two current copies into one.
3. The activation state machine: toggle a track → `configure` / `removeTrackInstance` on
   `TrackMaterialProvider` → select the active provider (track provider when ≥1 track, else
   color-ramp provider).
4. Session serialize/restore, including the legacy name-only array format and the `'none'` sentinel.
5. The zoom-eligibility gate (`canUseTrackForMaterial`).

### What it should hide
The id encoding, the provider-switch rules, the legacy/new session-format branching, and the
IGV-specific zoom probe.

### Constraints any interface must satisfy
- **C1 — blast radius of the active-provider field.** 8+ modules pull `igvPanel.materialProvider`
  during render. The interface must either keep that read path alive as a delegating facade, or
  migrate every reader.
- **C2 — side-effect coupling.** Activation currently calls `sceneManager.updateMaterialProvider(p)`
  + `genomicNavigator.repaint()` inline. A deep registry must not import those; they become an
  injected `onActiveProviderChanged(provider)` callback.
- **C3 — IGV/browser coupling is the only thing blocking testability.** The zoom gate and id
  scheme reach into `track.trackView.viewports[0].checkZoomIn()` and `browser.trackViews`. Behind a
  small probe/port, the rest is pure in-process logic.
- **C4 — don't duplicate `TrackMaterialProvider`.** It already owns the color math and a per-track
  map. The registry owns *checked-intent + active selection*; the provider owns *checked tracks →
  blended colors*.
- **C5 — track lifecycle.** Tracks get removed (`trackremoved`) and reordered
  (`trackorderchanged`); the `name|index` reconciliation in `getMaterialProviderCheckedTrackIds`
  exists to survive reorder. The interface must preserve that.
- **C6 — exactly two providers, permanently.** There are only ever two material providers: the
  color-ramp provider and the track material provider. This ensemble of classes is cast in concrete
  and will not grow. Provider selection is therefore a fixed binary switch (track provider when ≥1
  track is checked, else color-ramp) — **not** a registry of N providers. Any design premised on
  pluggable/extensible provider sources is out of scope by definition.

### Grounding sketch (constraints made concrete — not a proposal)
```js
// today — scattered across IGVPanel, with inline scene/navigator side-effects:
igvPanel.setMaterialProviderTrackChecked(track, true)
await igvPanel.activateTrackMaterialProvider(track)   // zoom-gate + configure + switch + repaint
// ...and 8 modules elsewhere pull on demand:
const rgb = igvPanel.materialProvider.colorForInterpolant(t)
```

## Dependency classification

- The registry's **own logic** (checked set, id scheme, switch rules, session formats): **In-process** — directly testable once merged.
- The **IGV browser + checkbox DOM** (track listing, zoom probe, checkbox reflection): **True
  external** — isolate behind a port and provide an in-memory test adapter.
- `TrackMaterialProvider`: **In-process** collaborator, injected; not duplicated.

## Candidate designs

### Design A — Minimal surface (1–3 entry points)
```js
class MaterialProviderController {
  constructor({ trackProvider, colorRampProvider, trackEnv, onActiveProviderChanged })
  async setTrackChecked(track, checked)   // THE mutation: gate → configure/remove → reselect → notify
  get activeProvider()                     // current provider
  serialize()                              // → ids[] | 'none'
  async restore(state)                     // ids[] | names[] | 'none'
  clear()
}
```
- **Hides:** id scheme, switch rules, zoom gate, session formats — all private.
- **Deps:** `trackEnv` is a tiny probe `{ listTracks(), indexOf(track), canColorFrom(track) }`;
  `onActiveProviderChanged` replaces the inline scene/navigator calls.
- **C1:** `igvPanel.materialProvider` becomes a one-line getter → `controller.activeProvider`.
  **Zero churn** for the 8 readers.
- **Trade-off:** `setTrackChecked` is overloaded (gate + mutate + notify); restore loops over it.
  Smallest surface, very testable, least flexible.

### Design B — Maximize flexibility / extension ❌ REJECTED
```js
class MaterialProviderRegistry {
  register(track) / unregister(track) / isRegistered(track)
  setEligibilityProbe(fn)                       // pluggable zoom rule
  addProviderSource(name, provider, predicate)  // N providers, not 2
  get activeProvider()                          // top of priority stack
  on('activeproviderchanged', cb)               // own micro-emitter
  getSnapshot() / applySnapshot(snap)           // pluggable serializers
}
```
- **Rejected by C6.** The two-provider ensemble is permanent, so pluggable provider sources /
  priority stacks solve for a future that will never arrive. Recorded only to show the option was
  considered.

### Design C — Optimize for the common caller (toggle trivial), push model
```js
class TrackColoringStore {
  async toggle(track)        // returns new checked bool; reverts UI itself if ineligible
  clear()
  serialize() / async restore(ids)
  // NO public activeProvider — store PUSHES via onChange; readers cache it
}
```
- The dominant caller is the checkbox handler — make it a single `toggle(track)`. The active
  provider is **pushed** through the existing `sceneManager.updateMaterialProvider` channel;
  `igvPanel.materialProvider` as a public read is **deleted**.
- **C1:** biggest migration — all 8 readers move from pull to a cached/injected provider.
- **Trade-off:** cleanest conceptual model (no shared mutable field), but the largest blast radius.
  Optimizes the toggle path at the cost of migrating the render path.

### Design D — Ports & adapters (isolate the IGV boundary)
```js
// PORT — everything the registry needs from "the track world":
interface TrackEnvironment {
  listTracks(); indexOf(track); isColorEligible(track);
  reflectCheckbox(track, bool);
  onTrackRemoved(cb); onTrackReordered(cb);
}
class MaterialProviderRegistry {
  constructor({ trackProvider, colorRampProvider, env /* TrackEnvironment */, onActiveProviderChanged })
  // same minimal verbs as A
}
```
- Production adapter wraps the real IGV browser + the checkbox shim DOM; the **test adapter is an
  in-memory fake** (array of fake tracks). The bug-prone parts — session reconciliation, the legacy
  name-dedup path, switch rules — become unit-testable with **no IGV and no DOM**.
- **Trade-off:** most testable and cleanest separation, but adds an adapter layer, and you must pin
  the port precisely (the IGV track shape leaks: `viewports[0].checkZoomIn`,
  `materialProviderInput`, `embeddingCheckboxChecked`).

## Comparison & recommendation

- **A** is the smallest step and kills the id duplication, but leaves the IGV coupling inline, so
  the testability win — the whole point of item #5 — is only partial.
- **C** has the purest end state but its migration cost is real and orthogonal to deepening; it's a
  separate "kill the shared mutable field" project better not bundled in here.
- **B** is rejected outright by C6 (the two-provider ensemble is permanent).
- **D** delivers the testability win but adds an adapter layer.

**Decision — A+D hybrid:** take **A's minimal verb set as the public contract**, sitting on
**D's `TrackEnvironment` port** for the IGV/DOM coupling, and keep `igvPanel.materialProvider` as a
**thin delegating getter** (from A) to avoid C's blast radius.

Because of C6, the controller holds the two providers as two plain injected fields and the active
selection is a one-line binary switch (`checkedCount > 0 ? trackProvider : colorRampProvider`) — no
registry, no priority stack, no provider map. That keeps the controller's job narrow: own the
*checked-track set* and the *binary switch*, delegate color math to `TrackMaterialProvider`,
delegate IGV/DOM access to the port.

This delivers what item #5 is actually about: the registry's logic becomes testable against an
in-memory `TrackEnvironment` — the bug-prone session reconciliation and switch rules verified
directly — while the 8 render-path readers don't move at all. Consolidate the two `getUniqueTrackId`
copies into the port as the single canonical id source. Defer C's push-model migration until a
future "kill the shared mutable field" pass.

## Testing strategy

- **New boundary tests** (against an in-memory `TrackEnvironment` + a stub `TrackMaterialProvider`):
  toggle on/off flips the active provider between track and color-ramp; an ineligible (zoomed-out)
  track is rejected and not added; `serialize`→`restore` round-trips; restore handles the legacy
  name-only format and `'none'`; restore reconciles `name|index` after a simulated reorder (C5);
  `trackremoved` of a checked track switches back to color-ramp when it was the last one.
- **Old tests to delete:** none — this is the zero-test repo's first boundary (see
  `feedback_skip_tests_for_visual_app`; this extraction is a good candidate to *seed* tests since
  the surface has now settled).
- **Test environment:** no IGV, no DOM — the in-memory `TrackEnvironment` adapter is the only
  stand-in needed.

## Migration for callers
- `igvTrackMaterialProviderShim.js` → call `controller.setTrackChecked(track, checked)` only.
- `sessionServices.js` → `serialize()` / `restore()` / `clear()`.
- `utils/utils.js` → `clear()`.
- The 8 render-path readers of `igvPanel.materialProvider` → unchanged (delegating getter).
- Production `TrackEnvironment` adapter wraps `browser.trackViews` + the zoom probe + checkbox DOM;
  `IGVPanel` constructs it after `igv.createBrowser`.

## Open questions
- Should `onActiveProviderChanged` fully replace the inline `sceneManager.updateMaterialProvider` +
  `genomicNavigator.repaint`, or coexist during migration?

## Resolved
- **A third provider is not on the roadmap.** The two-provider ensemble (color-ramp + track) is
  permanent (C6); Design B is rejected and provider selection stays a fixed binary switch.
