# Refactor: event-bus usage — keep the broadcasts, kill the disguised calls

> **STATUS: COMPLETE (2026-06-04).** Drafted 2026-06-01 as the final item in the
> architecture-improvement arc. **Phases 0–2 shipped** in PRs #62–#64 (dead-code removal, single
> source for `DidLoadEnsembleFile`, demoting point-to-point "events" to calls). **Phase 3 shipped**
> as part of the highlighting redesign ([refactor-highlighting-redesign.md](refactor-highlighting-redesign.md)):
> `DidEnter/LeaveGenomicNavigator` is gone — see that doc and the §3 below.

Date: 2026-06-01
Branch: _none yet_ (suggest `refactor/event-bus-usage`)
Companion to: [architecture/wiring-diagram.md](architecture/wiring-diagram.md) (the DI graph this
event traffic rides on top of).
Shape: **delete the dead weight → give the one real broadcast a single source → demote the
point-to-point "events" back to calls**.

## Trigger

The event bus has been the primary decoupling strategy for the app, but two recurring pains
prompted this review:

1. **Events get reached for when they aren't the right tool.** It's frictionless to `post` a
   message, so a plain function call routed to one known recipient often becomes a global event.
2. **Event-driven bugs are very hard to trace.** When the UI doesn't react to a load, there's no
   single breakpoint: you don't know which poster fired, the subscribers run in registration
   order with no declared dependency, and some handlers are async fire-and-forget.

This doc is the honest answer to "are we using events well, and where can we improve?"

## The bus

`src/spacewalkEventBus.js` — a hand-rolled global singleton (`SpacewalkEventBus.globalBus`):

- `subscribe(type, object)` — `object` is either a `receiveEvent`-bearing object or a bare function.
- `post({ type, data })` — synchronous; iterates subscribers in **registration order**.
- `unsubscribe`, `hold`/`release`/`isHeld` + a `stack`/`_hold` batching mechanism.

Separately, the vendored igv/juicebox `browser.eventBus` is subscribed once
(`juiceboxPanel.js:151`, `DidHideCrosshairs`). That one is out of scope — it's the vendor's bus,
not ours.

## The actual event graph

19 posts, 20 subscribes, 9 live event types in `src/`:

| Event | Posters | Subscribers | Shape | Verdict |
|---|---|---|---|---|
| `DidLoadEnsembleFile` | **6** (`app.js:229,266`, `sessionBootstrapper.js:30`, `sessionServices.js:129`, `spacewalkFileLoadWidgetServices.js:138`, `uiBootstrapper.js:153`) | 6 (traceSelector, genomicNavigator, guiManager, liveContactMapService, liveDistanceMapService, juiceboxPanel) | genuine fan-out, **no single source** | KEEP event, **fix the 6 posters** |
| `DidChangeColorMap` | 1 (`colorMapManager.js:171`) | 4 (sceneManager, colorRampMaterialProvider, genomicNavigator, guiManager) | genuine fan-out | KEEP as-is |
| `DidEnterGenomicNavigator` | **3** (IGVPanel, genomicNavigator, juiceboxPanel) | 1 (picker) | many→one | CONSOLIDATE |
| `DidLeaveGenomicNavigator` | **3** (same) | 2 (picker, sceneManager) | many→few | CONSOLIDATE |
| `DidSelectTrace` | 1 (`traceSelector.js:83`) | 2 (sceneManager, genomicNavigator) | 1→2 | KEEP (borderline) |
| `DidSelectPanel` | N panels (`panel.js:33`) | N panels (`panel.js:43`) | sibling broadcast (z-index) | KEEP |
| `DidLoadSWBEnsembleGroup` | 1 (`SWBDatasource.js:73`) | 1 (`spacewalkFileLoadWidgetServices.js:173`) | **point-to-point** | CONVERT to call |
| `DidEndDrag` | 1 (`draggable.js:56`) | panels, id-filtered (`panel.js:56`) | **callback in disguise** | CONVERT to callback |

## The defects (each pinned to a location)

### 1. Dead weight — remove regardless of the rest

- **A second, entirely dead event bus.** `src/widgets/eventBus.js` is a parallel `EventBus`
  implementation with **zero importers** (confirmed: no `widgets/eventBus` reference anywhere in
  `src/`). Pure dead code.
- **`AppWindowDidResize`** — subscribed (`panel.js:44`) and handled (`panel.js:52`) but **never
  posted anywhere**. A dead handler branch waiting for an event that no longer exists.
- **`DidEndRenderContainerDrag`** — **posted** (`draggable.js:55`) but **never subscribed**. A
  dead post.
- **Unused bus machinery.** `unsubscribe()`, `hold()`, `release()`, `isHeld()`, and the
  `stack`/`_hold` batching are **never called** anywhere in `src/`. The bus ships a
  transaction/batching feature and a teardown path that nothing uses. (Consequence: no subscriber
  is ever removed — fine today because all subscribers are app-lifetime singletons, but it means
  there is no lifecycle story at all.)

### 2. `DidLoadEnsembleFile` has six sources and no single owner

The payload is centralized (`ensembleManager.createEventBusPayload()`), but the **firing is
not**. All six load entry points repeat the identical three-line ritual:

```js
await ingestEnsemble…(…)
const data = ensembleManager.createEventBusPayload()
SpacewalkEventBus.globalBus.post({ type: "DidLoadEnsembleFile", data })
```

(`app.js:227-229`, `app.js:264-266`, `sessionBootstrapper.js:28-30`, `sessionServices.js:128-129`,
`spacewalkFileLoadWidgetServices.js:136-138`, `uiBootstrapper.js:151-153`.)

The "load → announce" contract is split across the codebase. Any new load path that forgets the
last two lines silently half-loads the app, and there is **no single place to breakpoint** the
moment "an ensemble became current." This is the concrete root of the event-debugging pain.

### 3. Ordering is implicit and partly async

`post()` is synchronous and runs subscribers in registration order, but two `DidLoadEnsembleFile`
handlers break that model:

- `traceSelector.receiveEvent` wraps an `async` IIFE (awaits `getTraceCount()`).
- `juiceboxPanel.receiveEvent` is itself `async` (awaits `parseGotoInput`).

`post()` awaits nothing, so these are fire-and-forget. The order in which the canvas clears, the
locus repaints, and the trace count resolves is an emergent property of registration order plus
microtask scheduling — invisible in the code and untestable.

### 4. Point-to-point messages wearing event costumes

- `DidLoadSWBEnsembleGroup`: one poster (`SWBDatasource.js:73`) → exactly one handler
  (`spacewalkFileLoadWidgetServices.js:173`). A function call routed through a global singleton.
- `DidEndDrag`: broadcast to **every** panel, each of which does
  `if (data === this.panel.getAttribute('id'))` (`panel.js:56`) just to discover whether the
  message was meant for it. A direct `onDragEnd(id)` callback passed into `configureDrag` is the
  same behavior with a traceable call stack.

## What's actually good — and stays

The fan-out events earn their keep and should **not** be "simplified" into direct references:

- `DidChangeColorMap` (1 → 4 unrelated consumers) and the fan-out *aspect* of
  `DidLoadEnsembleFile` (6 unrelated subsystems reacting to one fact) are true "a fact became
  true, whoever cares may react" broadcasts. The decoupling is real; the alternative (the loader
  holding references to all six subsystems) is strictly worse.
- `DidSelectPanel` (sibling z-index arbitration) is a legitimate N↔N broadcast.

The guiding rule this refactor encodes: **events for one-fact-many-reactors broadcasts; direct
calls/callbacks for one-known-recipient.**

## Proposed commit plan

Independent, individually shippable, in the small-commit style used by the hardening and
deepening passes. Phases 0 and 1 are pure cleanup; later phases change call shape.

### Phase 0 — delete the dead weight (no behavior change)
- Delete `src/widgets/eventBus.js`.
- Remove the `AppWindowDidResize` subscribe (`panel.js:44`) and its handler branch (`panel.js:52`).
- Remove the `DidEndRenderContainerDrag` post (`draggable.js:55`).
- Remove `unsubscribe()`, `hold()`, `release()`, `isHeld()`, and the `stack`/`_hold` fields from
  `spacewalkEventBus.js` (or keep `unsubscribe` if Phase 3 will need it — decide at implementation
  time).
- Verify: `npm run build`, then load an ensemble and drag a panel.

### Phase 1 — one source for `DidLoadEnsembleFile`
- Add a single method (e.g. `ensembleIngestionController.ingestAndAnnounce(...)`, or have
  `ensembleManager` post as the tail of ingestion) that ingests **and** posts the event as its
  last step.
- Collapse all six post-sites to call it. The copy-pasted three-liner disappears; the event keeps
  its fan-out; you gain the single breakpoint.
- Verify: every load path (drag-drop, postMessage, session restore, SWB group, file widget,
  bootstrap) still updates the UI.

### Phase 2 — demote the point-to-point "events" to calls
- `DidLoadSWBEnsembleGroup` → direct call from `SWBDatasource` to the one handler (inject the
  callback or call a method on a known collaborator).
- `DidEndDrag` → an `onDragEnd(id)` option on `configureDrag`, replacing the global broadcast +
  id-filter in `panel.js`.

### Phase 3 — consolidate the genomic-navigator enter/leave ✅ SHIPPED (2026-06-04)
- `DidEnter/LeaveGenomicNavigator` was posted from three places (navigator, IGV, juicebox) to express
  one piece of state ("is the pointer in a 1D producer?"), driving `picker.isEnabled` + a clear.
  **Resolved by dissolving it entirely** rather than consolidating: each producer self-clears on its
  own boundary, and the picker gates on cursor-over-canvas instead of the flag (the render loop nulls
  pointer coords on canvas `mouseleave`). This also fixed a latent stale-coordinate picker bug. Done
  as the final phase of the highlighting redesign — see
  [refactor-highlighting-redesign.md](refactor-highlighting-redesign.md) and
  [highlighting-participant-map.md](highlighting-participant-map.md) §6.

## Open questions

1. **Where does the single `DidLoadEnsembleFile` source live** — on `EnsembleIngestionController`
   (the ingest owner) or `EnsembleManager` (the payload owner)? Leaning controller, since the
   event means "ingestion finished."
2. **Do we ever need true ordering** among the six `DidLoadEnsembleFile` subscribers (Defect 3),
   or is the current emergent order acceptable? If we need it, Phase 1's single source is the
   natural place to sequence the awaits explicitly instead of relying on the bus.
3. **Keep `unsubscribe` or not?** Only matters if any future subscriber becomes non-app-lifetime.
