# hic-straw Integration Update

## Date: 2026-05-14

## Context

hic-straw received three changes (on its `dev` branch) to make the live contact map
read like a real static Hi-C map:

1. **Bright main diagonal** — `LiveContactMap` now emits a `counts = 1` self-contact
   record for every diagonal bin instead of leaving the diagonal empty.
2. **Neighbor exclusion removed** — the `neighborExclusion` config field,
   `setNeighborExclusion()`, and the related machinery are gone. For the visualization
   use case it solved a non-problem and introduced a worse artifact.
3. **Data-driven default distance threshold** — when `config.distanceThreshold` is
   omitted, `init()` derives one from the pairwise distance distribution (35th
   percentile). A fixed default is meaningless because 3D coordinates are in arbitrary,
   per-dataset units.

spacewalk is the main consumer (via juicebox.js). The current spacewalk code:

- **will hard-break** — `liveContactMapService.js` calls `this.lcm.setNeighborExclusion(...)`,
  which no longer exists;
- **defeats the new default** — it always passes `distanceThreshold` into the config, so
  hic-straw never derives one;
- **duplicates the constant** — `defaultDistanceThreshold = 200` is the stale twin of the
  constant hic-straw just replaced;
- **overpaints the diagonal gray** — `liveMapRenderUtils.js` paints a dark diagonal line
  on top of the contact records, which would now cover the correct bright diagonal.

## Scope

**spacewalk only.** juicebox.js needs no code changes: it uses hic-straw's `Straw` purely
as a pass-through wrapper around the `LiveContactMap` instance spacewalk constructs
(`Straw` does `this.hicFile = config.liveContactMap`). juicebox.js never calls
`setNeighborExclusion` and never reads `distanceThreshold`, and the `HicFile` interface
methods it does call are unchanged. Its own hic-straw pin can be bumped opportunistically
but does not block this work.

## Changes

### 1. Bump the hic-straw dependency

- `package.json:37` — `"hic-straw": "github:aidenlab/hic-straw#v2.4.3"` →
  `"github:aidenlab/hic-straw#v3.0.0"`. hic-straw v3.0.0 is released, tagged, and has a
  GitHub release.

### 2. Remove neighbor exclusion (hard break)

**`index.html`** — remove the Exclusion control block, lines **582–590** (the
`<div class="d-flex align-items-center gap-1">` wrapper containing the Exclusion label,
`live-map-exclusion-slider`, `live-map-exclusion-value`, and the up/down steppers).

**`js/juicebox/liveContactMapService.js`**:
- `:9` — delete `const defaultNeighborExclusion = 3`.
- `:21–22, 26–27` — delete the `exclusionSlider` / `exclusionDisplay` / `exclusionUpBtn` /
  `exclusionDownBtn` element lookups.
- `:54–66` — delete the exclusion slider `input` and `change` handlers (the `change`
  handler is the hard-break call site: `this.lcm.setNeighborExclusion(...)`).
- `:81–90` — delete the exclusion stepper handlers.
- `:109–110` — delete the exclusion reset in `receiveEvent`.
- `:165, 177` — remove `neighborExclusion` from the `lcmConfig` object.
- `:214` — delete `this.exclusionSlider.max = ...`.
- `:239` — update the `repaintContactMap` doc comment that mentions "exclusion".

### 3. Data-driven default threshold

**`js/juicebox/liveContactMapService.js`**:
- `:8` — delete `const defaultDistanceThreshold = 200`; `:289` — remove it from the
  `export` statement.
- `calculateLiveMaps()`:
  - Capture `const isFreshCalculate = (this.lcm === null)` **before** `this.lcm` is
    reassigned. `receiveEvent` nulls `this.lcm` on every `DidLoadEnsembleFile`, so
    `this.lcm === null` reliably means "first Calculate for this ensemble."
  - Include `distanceThreshold` in `lcmConfig` **only when not fresh** — i.e. preserve the
    user's current slider value on a contact-mode recalculate. On a fresh calculate, omit
    it so hic-straw derives the data-driven default. (Mirrors the `preserveThreshold`
    logic added to hic-straw's `examples/live-contact-map.html`.)
  - After `await this.lcm.init()` — next to the existing `this.thresholdSlider.max = ...`
    at `:213` — sync the slider to the value the library is actually using:
    `this.thresholdSlider.value = Math.round(this.lcm.distanceThreshold)` and update
    `this.thresholdDisplay`. Note `this.lcm.distanceThreshold` is `undefined` until
    `init()` resolves; this sync must come after the `await`.
  - `get distanceThreshold()` (`:274–276`) and `setState()` (`:278–282`) — remove. Their
    only callers are in `sessionServices.js` and go away with the session-persistence
    removal below.
- `receiveEvent` (`:107–108`) — remove the threshold slider reset lines. Per Decision 3
  the slider has no meaningful pre-Calculate value; it stays at its last/placeholder
  value until the first Calculate derives and syncs it.

**`js/sessionServices.js` — remove threshold session persistence entirely.** A saved
threshold is a fixed number that may not suit a differently-scaled ensemble on restore —
fragile, and the data-driven default makes it unnecessary.
- `:6` — remove the `defaultDistanceThreshold` import.
- `:99` — remove `contactFrequencyMapDistanceThreshold` from the destructured session fields.
- `:125` — remove the `liveContactMapService.setState(...)` call.
- `:231` — remove the `spacewalk.contactFrequencyMapDistanceThreshold = ...` save line.

Old session JSON files keep a harmless, ignored `contactFrequencyMapDistanceThreshold`
key — no migration needed.

### 4. Remove the gray diagonal overpaint

**`js/juicebox/liveMapRenderUtils.js:106–109`** — delete the `// Diagonal` overpaint loop.
hic-straw now emits real `counts = 1` diagonal records, so `renderContactMap`'s main
record loop already paints a bright diagonal; the overpaint would cover it with gray.

## Resolved decisions

1. **hic-straw versioning** — released as **v3.0.0** (tagged, GitHub release published).
   Pin spacewalk to `#v3.0.0`.

2. **Session threshold semantics** — **always re-derive.** Session persistence of the
   threshold is removed entirely (see change 3): a saved fixed number is fragile across
   differently-scaled ensembles, and the data-driven default makes it redundant.

3. **`receiveEvent` slider reset** — **re-derive on fresh Calculate.** The slider needs no
   meaningful pre-Calculate value; the reset lines are removed and the first Calculate
   syncs it to the derived default.

## Verification

- Load an ensemble → Calculate → bright diagonal, threshold slider lands on a
  data-derived value, off-diagonal structure visible.
- Change contact mode → recalculates, threshold preserved.
- Drag the threshold slider → map updates live.
- No console errors — in particular no `setNeighborExclusion is not a function`.
- Distance map tab still renders.
- Session save → restore round-trips per Decision 2.
- Load a *second*, differently-scaled ensemble → Calculate → threshold re-derives (does
  not carry the previous ensemble's value).
