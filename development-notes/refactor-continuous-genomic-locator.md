# Refactor: continuous genomic locator — slide the bead, quantize the highlight

> **STATUS: Historical — COMPLETE (PR #70, merged 2026-06-05).** Follow-on to the completed
> highlighting arc ([refactor-highlighting-redesign.md](refactor-highlighting-redesign.md), Historical).
> Shipped in three commits on `refactor/continuous-genomic-locator`; the ribbon bead now glides as a
> continuous locator while the highlight stays quantized. Current behavior is folded into
> [highlighting-participant-map.md](highlighting-participant-map.md) (Current) — read that for how it
> works today; this RFC is retained as the plan/rationale.

## The conceit (why this refactor exists)

There are two different things we have been calling by one name:

- **The truth in the data** is *discrete*: an ensemble has a finite list of genomic extents (24 balls →
  24 windows). What is *highlighted* — the strip band, the lit ball, the point-cloud subset — is
  legitimately one of those discrete windows.
- **Navigation through genomic space is *continuous*.** When the cursor glides up the navigator ramp,
  or along an IGV track, the user is moving through a continuous genomic coordinate. The discrete
  index is a **quantization** of that continuous coordinate — a projection *down* from it, not the
  other way around.

The highlighting redesign unified everything onto the discrete index (`HighlightController.selection`
is "a sorted array of region indices"). That was correct for the *highlight*. But it accidentally
forced the **locator** — the maraschino bead that rides the ribbon curve — through the same discrete
channel, so the bead hops window-to-window instead of gliding. Meanwhile IGV's own cursor-guide *line*
stayed continuous (it's positioned from raw `bp`), which is exactly why the line glides while the bead
hops: they ended up on different sides of the quantization.

This RFC re-separates the two quantities **without** giving back the single-state win:

> **One state, one renderer — but the state carries the continuous coordinate, and the discrete index
> is derived from it.** Discrete surfaces read the index; the bead reads the float.

We are not "boiling the ocean." We are declining to discard a number the producers already have.

## The mechanism today (precise)

State (`src/highlightController.js:21`): `this.selection` is a sorted array of bare region indices.

The quantization happens at both ends:

- **In:** every continuous producer computes a float and immediately drops it:
  - navigator `src/genomicNavigator.js:81` — `interpolantList = [ 1.0 - yNormalized ]` (a curve
    interpolant ∈ [0,1]) → `getGenomicInterpolantWindowList(...).map(({ index }) => index)`.
  - juicebox `src/juicebox/juiceboxPanel.js:188` — `handleCrosshairs({ interpolantX, interpolantY })`
    → `getGenomicInterpolantWindowList([ interpolantX, interpolantY ]).map(({ index }) => index)`.
    (The X/Y pair is the origin of the *two* beads.)
  - IGV `src/igvCursorGuide.js` — `bp = referenceFrame.start + x·bpPerPixel` → `indexForBP(bp)`.
  - picker `src/picker.js:60` — `hit.instanceId` (discrete by nature; no float to keep).
- **Out:** ribbon `src/ribbon.js:79` — `this.curve.getPointAt(extent.interpolant)`, where
  `extent.interpolant` is the **center** of window `index`. So the bead can only land on N points.

The ribbon already speaks curve-interpolant. Navigator and juicebox already produce curve-interpolants.
Only IGV needs a `bp → interpolant` mapping.

## The change — Option A (chosen)

A selection entry stops being a bare `number` and becomes:

```
{ index: number | undefined,   // the discrete window (for strip / ball / point cloud); undefined over a gap
  interpolant: number }        // the continuous curve coordinate ∈ [0,1] (for the bead); always present
```

`HighlightController.selection` is a list of these. `set()` / `isEqual()` compare on the pair.

| Surface (renderer) | Reads | Behavior |
|---|---|---|
| navigator strip, ball-and-stick, point cloud | `.index` | unchanged — discrete, quantized, skip `undefined` |
| **ribbon bead** | `.interpolant` | **new — glides continuously**, `curve.getPointAt(interpolant)` |

| Producer | Supplies `interpolant` | Supplies `index` |
|---|---|---|
| navigator | `1.0 - yNormalized` (native) | derived via `getGenomicInterpolantWindowList`, or `undefined` over a gap |
| juicebox | `interpolantX`, `interpolantY` (native) | derived, or `undefined` |
| IGV | `bp → interpolant` (new mapping, see below) | `indexForBP(bp)`, or `undefined` |
| picker | `extent.interpolant` of the picked window (center) | `hit.instanceId` |

### IGV's `bp → interpolant` mapping

The only genuinely new computation, and `igvCursorGuide.locatorForBP(bp)` (shipped commit 2) does it:
within the region the pointer falls in, glide the interpolant linearly across that region's ramp extent
`[start, end]` as `bp` crosses its genomic span `[startBP, endBP]`. **Why per-window and not a single
global `bp → [0,1]`:** the ramp is assigned *by index*, not by bp — `SWBDatasource` sets
`start = i·(1/N)`, `end = (i+1)·(1/N)`, so every region gets an equal `1/N` ramp slice regardless of bp
width, and regions tile `[0,1]` contiguously. The per-window map therefore (a) keeps the bead in the
same window the strip highlights, and (b) is continuous across contiguous boundaries (`end_i ==
start_{i+1}`).

### Gaps — the behavior we explicitly want (refined to the index-uniform ramp)

**Discovery while implementing:** because the ramp is index-uniform, *there are no gaps in ramp/
interpolant space* — every interpolant in `[0,1]` lands in exactly one window. Gaps exist only in
genomic **bp** space, so the **only producer that ever meets one is IGV** (the only one working in bp).
Navigator and juicebox work in the ramp coordinate and never hit a gap.

Decided behavior: **the bead does not blink out over a gap; the discrete highlight clears.** But since
a bp gap occupies *no ramp space* (the two regions are ramp-contiguous at the junction), "slide
through" is precisely a **continuous dwell at the junction**: as the pointer crosses the gap the bead
holds at the boundary interpolant (`= end_i = start_{i+1}`), then resumes — continuous, no hop, no
blink. `locatorForBP` returns `{ index: undefined, interpolant: <junction> }` for an interior gap (and
`undefined` → `clear` only when the pointer is outside the modeled span entirely). The discrete
renderers skip the `undefined` index (the redesign's gap constraint); the bead renders from the
interpolant.

(Today, pre-fix: an interior gap → `locatorForBP` returns `undefined` → full `clear()` → the bead
blinks out and back. The fix clears the *highlight*, not the *locator*.)

### Scope guard

Only the **bead** goes continuous. The strip band and the lit ball stay quantized to the window —
making *those* sub-window-continuous would be wrong (there is no fractional region to color). This
keeps the conceit honest: continuous *navigation*, discrete *data*.

## Plan (tiny commits, viewport-verified) — ALL SHIPPED on branch `refactor/continuous-genomic-locator`

Each commit is independently visible in the running app — the project's feedback loop.

1. ✅ **Widen the entry to `{ index, interpolant }`.** `HighlightController.set/isEqual` carry the pair;
   all four producers pass their native interpolant (picker uses the window center); discrete renderers
   read `.index` (output identical); ribbon reads `.interpolant`. **Result:** navigator and juicebox
   beads glide immediately (they were already interpolant-native). *User-verified.*
2. ✅ **IGV `bp → interpolant`** (`locatorForBP`, per-window linear; see above). IGV bead glides in
   lockstep with its guide line. *User-verified.*
3. ✅ **Gap-sliding (dwell).** `locatorForBP` returns `{ index: undefined, interpolant: <junction> }`
   for an interior gap so the bead dwells continuously instead of blinking; `ballAndStick.renderHighlight`
   filters the `undefined` index (strip/point-cloud already filtered via `.filter(Boolean)`).

## Decided / open

- **Decided:** Option A (enrich the one state) over a parallel locator channel — keeps "one state, one
  renderer."
- **Decided:** bead does not blink over gaps — with the index-uniform ramp this is a continuous dwell
  at the junction (a bp gap occupies no ramp space).
- **Decided:** only the bead is continuous; highlight stays quantized.
- **Resolved (was open):** `isEqual` compares the interpolant too, so every continuous move re-renders
  — intended (the bead tracks every move). No churn observed in verification; revisit only if it shows.

## When done

Flip this RFC to Historical, fold the discrete-highlight-vs-continuous-locator distinction into
[highlighting-participant-map.md](highlighting-participant-map.md) (it is the new "how it works"),
and update the README rows.
