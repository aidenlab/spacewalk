# Refactor: highlighting — one state, many writers, one renderer

> **STATUS: PROPOSAL (RFC).** Not started. Drafted 2026-06-02 as the next major piece after the
> event-bus arc ([refactor-event-bus-usage.md](refactor-event-bus-usage.md), Phases 0–2 shipped in
> PRs #62–#64). Motivated by a pre-existing point-cloud highlighting bug that no point fix cleanly
> resolves because the design itself is the defect. No code changed yet.

Date: 2026-06-02
Branch: _none yet_ (suggest `refactor/highlighting-redesign`)
Companion to: [architecture/wiring-diagram.md](architecture/wiring-diagram.md) and
[refactor-event-bus-usage.md](refactor-event-bus-usage.md) (this work **subsumes that doc's
Phase 3** — the `DidEnter/LeaveGenomicNavigator` events dissolve into producers here).
Shape: **collapse N push-based emitters + 2 stateful highlighters + split clear-paths into one
observable selection → one reconciler → one per-viz `renderHighlight`**.

## Trigger

Mousing the genomic-navigator color ramp does **not** highlight the 3D structure **for point
cloud**. Ball-and-stick highlights fine from the navigator; the IGV and Juicebox cursors highlight
point cloud fine. So the same visualization is highlightable from one input and not another, and
the same input highlights one render style and not another. That asymmetry is the tell: the bug is
not a missing call, it's a design where each (input × render-style) pair is wired independently and
only the self-consistent pairs happen to work.

Repro: `data/pointcloud/single-trace-multiple-genomic-locations.sw` (1 trace, 9 contiguous chr19
regions, no gaps), render style = point cloud, mouse the navigator ramp.

**This bug is pre-existing** — git-confirmed the highlight-path files are byte-for-byte unchanged
across the entire event-bus arc. The event-bus cleanup did not cause it and a point fix would not
retire the class of bug it represents.

## How highlighting works today

There is no highlight *state*. There are two imperative highlighter objects that mutate Three.js
geometry directly, four producers that call into them by side effect, and two-and-a-half clear
paths that each know about a different subset of render styles.

### The two highlighters (stateful, geometry-mutating)

| Highlighter | Owns | Highlight does | Clear does |
|---|---|---|---|
| `BallHighlighter` (`ballHighlighter.js`) | `instanceIdList` (a `Set`) + the balls `InstancedMesh` | writes `highlightColor` into `instanceColor`; **also** calls `genomicNavigator.highlightWithInterpolantWindowList` | repaints `instanceColor` from `materialProvider`, nulls `instanceIdList` |
| `PointCloudHighlighter` (`pointCloudHighlighter.js`) | `objects` (mesh list) + per-mesh material/color attrs | deemphasizes **all** meshes, re-emphasizes `objects` | repaints all meshes from `materialProvider`, nulls `objects` |

Both are created in `sceneManager.createHighlighters()` and handed to the active viz as
`pickHighlighter` (`sceneManager.js:126,140,188`). Ribbon has **no** highlighter — it moves two
`highlightBeads` directly (`ribbon.js:65-86`).

### The four producers (all push by side effect)

| Producer | Site | Highlight call | Clear call |
|---|---|---|---|
| Navigator ramp | `genomicNavigator.onCanvasMouseMove` (`:81`) | `sceneManager.delegateGenomicInterpolant({ interpolantList })` **+ pokes IGV `cursorGuide.updateWithInterpolant`** (`:93`) | mouseleave → `DidLeaveGenomicNavigator` |
| IGV cursor | `IGVPanel.setCustomCursorGuideMouseHandler` (`:181`) | `delegateGenomicInterpolant({ interpolantList:[i] })` + `genomicNavigator.highlightFromInterpolant` | `DidHideCrosshairs` (vendor bus) |
| Juicebox crosshairs | `juiceboxPanel.handleCrosshairs` (`:192`) | `delegateGenomicInterpolant({ interpolantList:[x,y] })` + `genomicNavigator.highlightFromInterpolant` | `DidHideCrosshairs` (vendor bus) |
| 3D raycast | `picker.intersect` (`:35`) | `sceneManager.ballHighlighter.processHit(hit)` — **hardcoded ball, point cloud excluded** | `ballHighlighter.unhighlight()` + `genomicNavigator.repaint()` |

### The split clear-paths (the asymmetry, made explicit)

`delegateGenomicInterpolant` (the **highlight** router, `sceneManager.js:82`) covers all three
render styles. The **clear** routers do not:

| Clear router | Triggered by | Clears ball? | Clears point cloud? | Clears ribbon? |
|---|---|---|---|---|
| `delegateLeaveGenomicNavigator` (`:107`) | navigator mouseleave | **no** (handled out-of-band by `picker.receiveEvent`, `picker.js:30`) | yes | yes |
| `delegateHideCrosshairs` (`:95`) | IGV/Juicebox `DidHideCrosshairs` | yes | **no** | yes |
| `picker.receiveEvent` (`:23`) | `DidEnter/LeaveGenomicNavigator` | yes (ball only) | no | no |

Ball's navigator-leave clear lives in the **picker**, not the scene manager. Point cloud has **no**
crosshairs-hide clear. Each cell that says "no" is a latent stuck-highlight or
fails-to-highlight bug; today only the point-cloud-from-navigator cell is user-visible because of
how the producers interleave.

## The defect, stated structurally

The diagnosis (via temporary console probes, since reverted): on the navigator → point-cloud path,
the call reaches `PointCloudHighlighter.highlightWithObjectList` with a **valid mesh**
(`objectCount:1, anyUndefined:false`) and runs `highlight()`. It is **not** a missing or broken
call. The highlight is applied and then clobbered, because the highlighter is a piece of imperative
state that four producers and three clear-paths all write through without any of them owning it.

Concrete fragilities that make this inevitable:

1. **No single source of truth.** "What is highlighted right now" exists only as side effects
   smeared across geometry attributes on two different objects. Nothing can read it, log it, or
   reconcile it. There is no breakpoint for "the selection changed."
2. **`highlightWithObjectList` has a commented-out `unhighlight()`** (`pointCloudHighlighter.js:35`)
   plus a uuid-dedup early-return — it relies on `highlight()` re-deemphasizing everything to
   self-correct. Correct-by-accident, not by construction.
3. **The picker hardcodes `ballHighlighter`** (`picker.js:48`) and puts `point_cloud` in its
   raycast `exclusionSet` (`:3`). The 3D-raycast producer literally cannot highlight point cloud.
4. **Two highlighters referenced inconsistently** — `pickHighlighter` is whichever one the active
   viz was handed, but the picker and the clear-paths reach for them by name. The wiring only lines
   up for the self-consistent (input × style) pairs.
5. **A producer with a side-channel.** The navigator additionally pokes IGV's cursor guide
   (`genomicNavigator.js:93`), which can re-enter `delegateGenomicInterpolant` through IGV's
   handler — a second writer firing inside the first writer's call.
6. **The highlighter reaches back into a producer.** `BallHighlighter.highlight()` calls
   `genomicNavigator.highlightWithInterpolantWindowList` (`ballHighlighter.js:57`) — the renderer
   driving an input. The data flow is a cycle, not a pipeline.

## Proposed design — one state, many writers, one renderer

Model highlighting as **observable state**, render-style-agnostic, owned by exactly one object.

```
producers (pure)              state (one owner)            renderer (one switch)
─────────────────             ─────────────────            ────────────────────
navigator ramp   ─┐
IGV cursor       ─┤                                   ┌─ ball:       renderHighlight(sel)
juicebox crosshair┼─ set/clear ─►  HighlightSelection ┼─ pointCloud: renderHighlight(sel)
3D raycast       ─┘   (region indices)   │            └─ ribbon:     renderHighlight(sel)
                                         │
                                         └─ one reconciler hands sel to the active viz
```

- **`HighlightSelection`** — a single observable value owned by one controller (e.g.
  `HighlightController`). It is a set of region indices (or genomic-interpolant windows), **with no
  knowledge of render style**. It has exactly two mutators: `set(selection)` and `clear()`.
- **Producers become pure.** Each input — navigator ramp, IGV cursor, Juicebox cursor, 3D raycast —
  maps its mouse event to a set of region indices and calls `set(...)` / `clear()`. Nothing else.
  No producer touches geometry; no producer knows which render style is active; no producer pokes
  another producer.
- **One reconciler.** On selection change, the controller hands the current selection to the active
  visualization's `renderHighlight(selection)`. The **render-style switch lives in exactly one
  place** — this reconciler — instead of being smeared across `delegateGenomicInterpolant`,
  `delegateLeaveGenomicNavigator`, `delegateHideCrosshairs`, and `picker`.
- **Each viz implements `renderHighlight(selection)`** as a pure function of selection → geometry:
  empty selection renders the un-highlighted state, non-empty renders the highlight. Highlight and
  clear stop being separate code paths — clear is just `renderHighlight(∅)`. This single change
  retires every "no" cell in the clear-path table above.
- **The navigator's ramp canvas becomes a renderer too** (it already paints a highlight strip in
  `paintWithInterpolantWindowList`). It subscribes to the same selection, so the ramp highlight and
  the 3D highlight can never disagree — and the highlighter→navigator back-call
  (`ballHighlighter.js:57`) disappears.

Why this kills the bug class: the navigator and IGV inputs traverse the **identical** path
(both just `set(selection)`), so they cannot diverge by render style. There is no per-(input×style)
wiring left to get wrong.

## What this subsumes

- **Event-bus Phase 3.** `DidEnterGenomicNavigator` / `DidLeaveGenomicNavigator` exist only to
  toggle `picker.isEnabled` and to clear the ball highlighter out-of-band. Once the picker is just
  another producer writing to the selection, "is the pointer in the navigator?" becomes ordinary
  state (or simply: the navigator is the active producer), and both events plus the
  `picker.isEnabled` flag disappear.
- **The `picker.exclusionSet` point-cloud exclusion** — the picker stops naming a highlighter, so
  there is nothing to exclude.

## Proposed commit plan

Small, individually shippable commits in the style of the hardening / deepening / event-bus passes.
Earlier phases introduce the state without removing the old paths, so each is independently
verifiable in the viewport.

### Phase 0 — characterize + freeze the contract (no behavior change)
- Land this RFC.
- Add the missing clear cells **as the cheapest possible bandaid only if needed to keep `main`
  shippable** during the refactor (point cloud in `delegateHideCrosshairs`). Optional; skip if we
  go straight to Phase 1.

### Phase 1 — introduce `HighlightSelection` + controller, shadow-mode
- Add the observable selection + controller, owned where the highlighters are created
  (`sceneManager`). Nothing reads it yet; producers additionally `set/clear` it alongside their
  existing calls. Verify it tracks correctly by logging (no visual change).

### Phase 2 — one reconciler + per-viz `renderHighlight(selection)`
- Implement `renderHighlight(selection)` on ball, point cloud, ribbon as pure selection→geometry
  (reuse the existing highlight/deemphasize bodies; merge the clear path into the empty-selection
  case). Wire the controller to call the active viz's `renderHighlight` on change.
- Verify all four inputs × all three render styles in the viewport, including the repro file.

### Phase 3 — make producers pure, delete the old paths
- Strip the geometry side effects out of the four producers; they only `set/clear`.
- Delete `delegateGenomicInterpolant` / `delegateLeaveGenomicNavigator` / `delegateHideCrosshairs`
  routing, the two standalone highlighter classes' public mutators, and the
  `ballHighlighter → genomicNavigator` back-call.
- Remove `DidEnter/LeaveGenomicNavigator` + `picker.isEnabled` + the `point_cloud` exclusion
  (event-bus Phase 3 falls out here).
- Verify the full matrix again.

## Open questions

1. **Selection granularity** — region indices vs. genomic-interpolant windows? The producers
   currently speak interpolant windows (`getGenomicInterpolantWindowList`); the highlighters speak
   indices / mesh objects / instanceIds. The selection should hold whichever is the *common
   denominator* both producers and all three renderers can derive from — likely region indices,
   with each renderer mapping index → its own geometry handle.
2. **Where does the controller live** — a new `HighlightController`, or fold it onto `sceneManager`
   (which already owns `createHighlighters` and the render-style switch)? Leaning new object for
   testability ([[feedback_test_invisible_logic_only]] — selection bookkeeping is exactly the kind
   of invisible logic worth a unit test; the rendered highlight stays eye-audited).
3. **Does the navigator ramp renderer need to stay a special case**, or can it implement the same
   `renderHighlight(selection)` interface as the 3D vizzes? If the latter, the reconciler fans out
   to *all* registered renderers (3D viz + ramp) and the two can never disagree.
4. **HMR footgun to document in the implementation** — IGV's cursor→highlight handler is registered
   once at init via `browser.setCustomCursorGuideMouseHandler`; Vite HMR leaves it stale. Hard-
   refresh when instrumenting `IGVPanel.js` / `genomicNavigator.js`.
