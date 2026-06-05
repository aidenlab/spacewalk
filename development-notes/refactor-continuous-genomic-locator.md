# Refactor: continuous genomic locator — slide the bead, quantize the highlight

> **STATUS: Proposal (2026-06-05).** Follow-on to the completed highlighting arc
> ([refactor-highlighting-redesign.md](refactor-highlighting-redesign.md), Historical; current
> behavior in [highlighting-participant-map.md](highlighting-participant-map.md), Current).
> Branch: `refactor/continuous-genomic-locator` (proposed).

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

The only genuinely new computation. Define it piecewise-linearly over the genomic-extent list:
interpolate between adjacent extents' `(centerBP, interpolant)` pairs. This (a) is continuous, and
(b) **slides smoothly across a gap** — between the last extent before the gap and the first after it —
which is the desired bead behavior. Clamp outside the first/last extent.

### Gaps — the behavior we explicitly want

Decided: **the bead slides through a gap; the discrete highlight clears over it.** The curve is a
continuous `CatmullRomCurve3`, so `getPointAt` is always defined; the bead has no reason to blink out.
This requires one behavioral change in the producers: over a gap they must **report the interpolant
with `index: undefined`** rather than calling `clear()`. The discrete renderers already tolerate a
missing index (the redesign's gap constraint); they just skip it. The bead keeps moving.

(Today a gap → `getGenomicInterpolantWindowList` returns `undefined` → full `clear()`. That is what we
change: clear the *highlight*, not the *locator*.)

### Scope guard

Only the **bead** goes continuous. The strip band and the lit ball stay quantized to the window —
making *those* sub-window-continuous would be wrong (there is no fractional region to color). This
keeps the conceit honest: continuous *navigation*, discrete *data*.

## Plan (tiny commits, viewport-verified)

Each commit is independently visible in the running app — the project's feedback loop.

1. **Widen the entry to `{ index, interpolant }`.** `HighlightController.set/isEqual` carry the pair;
   all four producers pass their native interpolant (picker uses the window center); discrete renderers
   read `.index` (byte-for-byte identical output); ribbon reads `.interpolant`. **Result:** navigator
   and juicebox beads glide immediately (they were already interpolant-native).
2. **IGV `bp → interpolant`.** Add the piecewise-linear mapping; IGV bead glides too. Verify the guide
   line and the bead now move in lockstep.
3. **Gap-sliding.** Producers emit `interpolant` with `index: undefined` over a gap instead of
   clearing; confirm the bead crosses a gap smoothly while strip/ball clear. Repro fixture:
   `data/pointcloud/single-trace-multiple-genomic-locations.sw` and any extent with a known gap.

## Decided / open

- **Decided:** Option A (enrich the one state) over a parallel locator channel — keeps "one state, one
  renderer."
- **Decided:** bead slides through gaps.
- **Decided:** only the bead is continuous; highlight stays quantized.
- **Open (minor):** exact `isEqual` tolerance — do we suppress re-render when only the interpolant
  changes sub-pixel? Likely no (the bead *should* track every move); revisit if it churns.

## When done

Flip this RFC to Historical, fold the discrete-highlight-vs-continuous-locator distinction into
[highlighting-participant-map.md](highlighting-participant-map.md) (it is the new "how it works"),
and update the README rows.
