# Refactor: the Reference Ruler becomes its own widget — placeable, draggable, remembered

> **STATUS: Proposal.** Extracts the Reference Ruler out of `ScaleBarService` into
> `src/referenceRuler.js`, moves its default position to bottom-**right** of the render container,
> and makes it draggable with a persisted anchor. Prerequisite framing for the eventual deletion of
> the Scale Bars.

## The conceit (why this refactor exists)

`src/scaleBarService.js` is one class holding **two unrelated widgets** that share a file because
both of them print a number followed by "nm":

- **Scale Bars** are *glued to the data*. Their position and length are recomputed every animation
  frame from the convex hull's projected bounds (`calculateScaleBarBounds`). They answer *"how big
  is this object?"* You cannot meaningfully "place" them — they go where the data is.
- **The Reference Ruler** is *glued to the viewport*. Fixed 128px long, parked in a corner. It
  answers *"what does 128px mean right now?"* — a legend, not a measurement of anything on screen.

These are opposite kinds of object. One is a projection of the scene; the other is chrome. The only
thing the ruler needs from the scale-bar machinery is a single scalar, `nmPerPixel`, which
`scaleBarAnimationLoopHelper` already computes on one line.

This refactor takes the ruler seriously as a piece of **placeable chrome**: it has a position the
user owns, and that position is remembered.

> **The ruler is furniture, not a readout. Furniture can be moved, and stays where you put it.**

The Scale Bars are expected to be **deleted** in a follow-on pass. Extracting the ruler *first*
means that pass is a deletion rather than an untangling of two widgets that have both since grown.

## Vocabulary

| Term | Meaning |
|---|---|
| **Reference Ruler** | Fixed-length (128px) bar + nm label. Answers "how big is 128px right now." The subject of this RFC. |
| **Scale Bars** | Camera-tracking horizontal/vertical bars glued to the convex hull's projected bounds. Untouched here; slated for deletion. |
| **Render Container** | `#spacewalk-threejs-canvas-container` — `position: relative`, the ruler's coordinate space and its bounds. |
| **Anchor** | `{ corner, dx, dy }` — the ruler's persisted position: which corner it is parked at, and its inset from that corner's two edges. |
| **Corner** | One of `bottom-right` (the default), `bottom-left`, `top-left`, `top-right`. |

## The mechanism today (precise)

`insertReferenceRulerDOM()` (`scaleBarService.js:128`) writes a container with a hardcoded
`left: 20px; bottom: 20px`, `display: none`. Nothing else ever touches its position.

Visibility and color round-trip through `localStorage['spacewalk-settings'].referenceRuler` as
`{ visible, r, g, b }`, written by `SettingsManager.save()`.

`referenceRulerToJSON()` / `setReferenceRulerState()` (`scaleBarService.js:233`, `:244`) are
**dead code** — no call sites anywhere in `src/`. The ruler does *not* travel in a shared session.

## Design decisions

### 1. Position is an Anchor, not a pixel pair

A dragged position could be stored as raw `left/top` pixels. It is not, because the Render Container
is user-resizable (`resize: both` on its parent) and Spacewalk has a fullscreen mode. Raw pixels
drift away from whatever edge the user parked against.

Instead the drop point is converted to the **nearest corner** (by widget center vs. container
midlines) plus an inset from that corner's two edges. "I put it in the top-left" survives a resize,
because that is what the user actually meant.

Each corner maps to its **native CSS pair** — `bottom-right` → `right`/`bottom`, `top-left` →
`left`/`top`, with the opposite two properties cleared. The browser then tracks the corner for free:
the default position needs no JavaScript at all, and resize handling is only about containment.

During the gesture `configureDrag` writes `left/top` as usual; the conversion happens once, on
`onDragEnd`.

### 2. Insets are stored unclamped, and clamped at render

The widget's bounding box must always be fully inside the Render Container — a half-clipped ruler is
a broken-looking ruler.

But clamping *destructively* would make resize lossy: shrink the container, and a far-flung ruler
gets pulled inward; grow it back, and the original position is gone. So the user's inset is stored
as given, and clamping is applied only when computing the CSS value.

**This is what makes fullscreen work.** Entering fullscreen grows the container hugely and exiting
shrinks it back; because the stored inset was never overwritten, the ruler returns to where the user
left it.

### 3. Persistence is `localStorage`, not the session

Position is a *viewing preference*, like the ruler's color — it belongs to this user on this
machine, not to the dataset. It joins the existing record:

```
localStorage['spacewalk-settings'].referenceRuler = { visible, r, g, b, anchor: { corner, dx, dy } }
```

A record with a missing or malformed `anchor` falls back to the default, so existing users upgrade
silently.

The dead session path (`referenceRulerToJSON` / `setReferenceRulerState`) is deliberately **left
dead** — not extended, not deleted. It goes out with the Scale Bars.

### 4. Anchoring stays out of `draggable.js`

`configureDrag` gains a genuine bug fix and one option; it does not learn about corners.

The bug: `clamp(left, x, width - w)` (`draggable.js:110`) mixes a viewport coordinate (`x`) with a
size (`width - w`). It is only correct because both existing callers pass
`#spacewalk-root-container`, where `x ≈ 0`. The Render Container is nested *and itself draggable*, so
`x` is nonzero and varies. Correct form: `clamp(left, x, x + width - w)` — provably a no-op for the
existing panels.

A second, worse bug surfaced during testing: drag deltas were taken from `event.screenX/screenY`
(**screen** pixels) but added to an origin from `getBoundingClientRect()` (**viewport CSS** pixels).
Those two spaces diverge under browser zoom or a scaled display, so the target *outran the cursor* —
a multiplicative error that grows with distance travelled, not a constant offset at grab time.
Measured at roughly 1.12× vertically at ~110% zoom. Fixed by using `clientX/clientY` throughout,
which is the same space `getBoundingClientRect()` reports in.

> ⚠️ `src/widgets/utils/draggable.js` (`makeDraggable`, used by `alertDialog.js`) is a separate,
> IGV-derived helper carrying the **same** screen-vs-CSS-pixel defect. Out of scope here; fix it if
> the alert dialog is ever reported drifting under zoom.

Separately, `configureDrag` has no bottom constraint at all (`top = Math.max(top, yy)`), so a target
can be dragged off the bottom edge. Rather than change panel behavior, containment becomes an
**opt-in** option that only the ruler requests.

`configureDrag` stays *"move a thing with the mouse, keep it in bounds."* The ruler owns *"which
corner am I parked at, and where do I write that down."*

### 5. Scope boundaries

- **Mouse only.** `configureDrag` is `mousedown`/`mousemove`/`mouseup`, as are both existing
  draggable panels. Converting it to pointer events would change behavior for those panels for the
  benefit of placing a ruler on a tablet.
- **No drag chrome.** `cursor: grab` / `grabbing` is the entire affordance. Hover backgrounds or
  outlines would compete visually with the data the ruler exists to measure.
- **The whole widget is the handle.** The 5px bar alone is a cruel target; the label roughly doubles
  the grabbable height and is visually part of the same object.
- **Double-click resets** to the default anchor. Zero new UI for an escape hatch from parking the
  ruler somewhere useless.

## Notable consequences

- **The ruler is `display: none` by default, and a hidden element measures 0×0.** The anchor is
  therefore applied on *show*, not at construction.
- **No camera-orbit conflict.** OrbitControls attaches to `renderer.domElement` — the canvas, a
  *sibling* of the ruler div, not an ancestor. A `pointerdown` on the ruler never reaches the canvas.
  (Note that `configureDrag`'s `stopPropagation()` on a *mouse* event would not have suppressed a
  *pointer* dispatch anyway, had they shared an ancestor.)
- **Extraction touches three call sites** — `settingsManager.js`, `uiBootstrapper.js`, `app.js`. The
  diff is larger than the visible behavior change.
- **Containment on resize rides the existing observer** (`uiBootstrapper.initializeResizeObserver`,
  `app.js:99`) rather than adding a second one.

## Plan

Two separable commits, so the mechanical change and the behavior change can be reviewed apart:

1. **Extract, behavior-preserving.** `src/referenceRuler.js` takes the ruler's DOM, color,
   visibility, and `nmPerPixel` update. `ScaleBarService` keeps only the Scale Bars and delegates.
   No visible change — still bottom-left, still not draggable.
2. **Reposition and make draggable.** Default moves to bottom-right; Anchor model, drag wiring,
   clamp fix in `draggable.js`, double-click reset, `localStorage` round-trip.

## Follow-on (explicitly not this RFC)

- Delete the Scale Bars entirely, along with `#spacewalk_ui_manager_scale_bars`, its color picker,
  and the now-dead session methods.
- Rename what remains — "scale bar" as a term should leave the codebase with the widget.
