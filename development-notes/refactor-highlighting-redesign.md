# Refactor: highlighting — one state, many writers, one renderer

> **STATUS: BUG FIXED, strip-painter cleanup landed — [PR #65](https://github.com/aidenlab/spacewalk/pull/65)
> open (2026-06-03), awaiting review.** Drafted 2026-06-02 as the next major piece after the event-bus
> arc ([refactor-event-bus-usage.md](refactor-event-bus-usage.md), Phases 0–2 shipped in PRs #62–#64).
> Motivated by a pre-existing point-cloud highlighting bug that no point fix cleanly resolves because
> the design itself is the defect.
>
> Shipped on branch `refactor/highlighting-redesign` (PR #65):
> - **Phase 1** (8c92395) — `HighlightController` + selection state in shadow mode.
> - **Phase 2** (71e218d) — **bug fixed**: navigator strip is a first-class renderer of the shared
>   selection (`genomicNavigator.renderHighlight`), so it tracks in point-cloud mode.
> - **Phase 3** (94a4627) — deleted the redundant legacy strip painters now that the strip has one
>   owner: `highlightFromInterpolant` / `highlightWithInterpolantWindowList`, the ribbon-only gate,
>   the IGV/Juicebox direct calls, and the `BallHighlighter → genomicNavigator` back-call.
>
> **Deferred (optional, not bug-driven):** the rest of the original Phase 3 below — making the 3D
> vizzes `renderHighlight(selection)` renderers, deleting the `delegate*` routers, and dissolving
> event-bus Phase 3 (`DidEnter/LeaveGenomicNavigator` + `picker.isEnabled` + `point_cloud` exclusion).

Date: 2026-06-02
Branch: `refactor/highlighting-redesign`
Companion to: [architecture/wiring-diagram.md](architecture/wiring-diagram.md) and
[refactor-event-bus-usage.md](refactor-event-bus-usage.md) (this work **subsumes that doc's
Phase 3** — the `DidEnter/LeaveGenomicNavigator` events dissolve into producers here).
Shape: **collapse N push-based emitters + 2 stateful highlighters + split clear-paths into one
observable selection → one reconciler → one per-viz `renderHighlight`**.

## Trigger

> **Bug surface (confirmed 2026-06-02):** the **genomic navigator's own highlight strip** — the
> overlay band painted on the color ramp itself (`#spacewalk_color_ramp_canvas_highlight` /
> `highlight_ctx`, drawn by `paintWithInterpolantWindowList`) — **not** the 3D structure highlight.
> An earlier diagnosis mislabeled this as "the 3D structure doesn't highlight"; the 3D point-cloud
> highlight from the navigator actually works (Phase 1 confirmed the selection tracks and the
> delegate reaches `PointCloudHighlighter` with a valid mesh). What's missing is the strip.

Mousing the navigator ramp in **point-cloud** mode does **not** paint the navigator's own highlight
strip. It paints fine in ball-and-stick and ribbon mode. The split has a precise mechanism — who
paints the strip differs per render style:

- **Ribbon:** `onCanvasMouseMove` calls `highlightFromInterpolant` directly (`genomicNavigator.js:98`),
  but **only** under `renderStyle === Ribbon.renderStyle`. ✅
- **Ball-and-stick:** the navigator drives the 3D highlighter, and `BallHighlighter.highlight()`
  **reaches back** with `genomicNavigator.highlightWithInterpolantWindowList(...)`
  (`ballHighlighter.js:57`) — the strip is painted as a *side effect of the 3D highlighter*. ✅
- **Point cloud:** `PointCloudHighlighter` holds **no `genomicNavigator` reference at all** (its
  constructor takes only `ensembleManager`, `igvPanel`) and never calls back. Nothing paints the
  strip. ❌

So the navigator strip is the navigator's own concern in exactly one render style (ribbon), is
carried by a backward highlighter→input coupling in another (ball), and is carried by nobody in the
third (point cloud). The strip's upkeep was never owned by the navigator; it leaks out of whichever
3D highlighter happens to call home.

Repro: `data/pointcloud/single-trace-multiple-genomic-locations.sw` (1 trace, 9 contiguous chr19
regions, no gaps), render style = point cloud, mouse the navigator ramp — the strip stays blank.

**This bug is pre-existing** — git-confirmed the highlight-path files are byte-for-byte unchanged
across the entire event-bus arc. The event-bus cleanup did not cause it and a one-line point fix
(ungate the navigator's self-paint for all render styles) would mask it without removing the
backward coupling that makes the strip's ownership ambiguous.

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

The visible bug (navigator strip blank in point-cloud mode) is the symptom; the structural defect
is that **no single thing owns "what is highlighted," and the navigator strip in particular has no
owner** — it is repainted as a side effect of whichever 3D highlighter happens to call back, so it
exists in ribbon (self-painted) and ball (highlighter back-call) and vanishes in point cloud
(no back-call). The Phase 1 selection-state instrumentation confirmed the 3D path itself is fine:
the delegate reaches `PointCloudHighlighter.highlightWithObjectList` with a valid mesh and the
selection tracks cleanly with no clobber. The breakage is purely "the strip is rendered by nobody,"
not "the highlight is computed wrong."

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
6. **The highlighter reaches back into a producer — and this *is* the bug.**
   `BallHighlighter.highlight()` calls `genomicNavigator.highlightWithInterpolantWindowList`
   (`ballHighlighter.js:57`): the 3D renderer drives the navigator-strip renderer. The strip's
   upkeep rides on this cycle, so it works only where the cycle exists (ball) and dies where it
   doesn't (point cloud, whose highlighter has no navigator reference). Making the strip a
   first-class renderer of the shared selection deletes this back-call and the per-style asymmetry
   in one move.

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

## Constraint: gaps in the genomic extent

An ensemble's genomic extent can have **gaps** — stretches with no region, either because the
data isn't in the file or because a defect was deliberately ignored. This is **not** specific to a
render style; it can occur for both ball-and-stick and point cloud. The navigator (and every other
input) must ignore gap regions gracefully — hovering a gap highlights nothing, it does not throw
and does not highlight a neighbor.

Two places this must hold:

1. **Producer side (gap → no selection).** `ensembleManager.getGenomicInterpolantWindowList`
   already rejects gaps: an interpolant that falls between extents matches no extent's
   `[start, end]` and the method returns `undefined`. Every producer must treat `undefined` as an
   explicit **`clear()`**, never as a degenerate `set([])`. (Phase 1 wires all four producers this
   way.)
2. **Renderer side (index → maybe-no-handle).** Because indices index the *extent* list, a renderer
   mapping `index → geometry handle` (`meshList[index]`, an `instanceId`, a curve point) must
   tolerate a **missing** handle and skip it, not assume 1:1 alignment. `renderHighlight(selection)`
   filters the selection to the handles it actually has before mutating geometry. This is the
   forward-looking guard for the "data simply isn't there" case.

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
**Landed (94a4627) — the strip-painter slice:** deleted the `ballHighlighter → genomicNavigator`
back-call, the navigator's `highlightFromInterpolant` / `highlightWithInterpolantWindowList`, the
ribbon-only self-paint gate, and the IGV/Juicebox direct `highlightFromInterpolant` calls. The
navigator strip now has exactly one writer (`renderHighlight(selection)` off the controller).

**Deferred (optional, tech-debt — not bug-driven):**
- Strip the geometry side effects out of the four producers; they only `set/clear`.
- Delete `delegateGenomicInterpolant` / `delegateLeaveGenomicNavigator` / `delegateHideCrosshairs`
  routing, the two standalone highlighter classes' public mutators.
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
