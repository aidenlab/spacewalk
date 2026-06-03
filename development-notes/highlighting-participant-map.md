# Highlighting — participants, surfaces, and flows

> **STATUS: Current.** Describes how highlighting works today, after the highlighting redesign
> Phases 1–3 ([refactor-highlighting-redesign.md](refactor-highlighting-redesign.md), PR #65). This
> is the *map* — the cast of participants and the paths a highlight takes. The RFC is the *plan*;
> read this first to understand the moving parts, then the RFC for where they are headed.

Highlighting is the most multifaceted interaction in Spacewalk. The complexity is combinatorial:
**two different things get highlighted, four different inputs can drive a highlight, and the 3D
structure highlight has three render-style-specific implementations.** A naïve "interaction diagram"
of any one path hides the fact that the same user intent ("light up region 7") arrives from four
directions and lands on two surfaces by two very different mechanisms.

This document separates those concerns: first the **surfaces** (what lights up), then the
**producers** (what drives it), then the **spine** that connects them, then a **walkthrough of each
of the four input styles**, and finally the **clear paths** — which are where the subtlety actually
lives.

---

## 1. Two surfaces get highlighted

A single hover lights up *two independent things*. Keeping them distinct is the key to the whole
picture, because — after the redesign — they travel completely different roads.

```mermaid
%%{init: {'themeVariables': {'fontSize': '18px', 'fontFamily': 'arial'}, 'flowchart': {'nodeSpacing': 60, 'rankSpacing': 50}}}%%
flowchart LR
    HOVER["One hover / cursor"] --> STRIP["Surface A:<br/>Navigator strip"]
    HOVER --> STRUCT["Surface B:<br/>3D structure"]
    STRUCT --> S_BALL["ball-and-stick:<br/>instanceColor"]
    STRUCT --> S_PC["point cloud:<br/>de/emphasized meshes"]
    STRUCT --> S_RIB["ribbon:<br/>two highlightBeads"]
```

| Surface | What it is | Who paints it | Render-style-aware? |
|---|---|---|---|
| **A — Navigator strip** | The colored band drawn on the color-ramp canvas (`#spacewalk_color_ramp_canvas_highlight` / `highlight_ctx`) in the genomic navigator | `genomicNavigator.renderHighlight(selection)`, the **sole** registered renderer on `HighlightController` | **No** — one code path for every style |
| **B — 3D structure** | The highlighted geometry in the 3D view | One of three highlighters, chosen by render style (below) | **Yes** — three separate implementations |

The three flavors of Surface B:

| Render style | Highlighter | Highlight does | Clear (`unhighlight`) does |
|---|---|---|---|
| ball-and-stick | `BallHighlighter` | writes `highlightColor` into the balls' `instanceColor` for the hit `instanceId`s | repaints those instances from the material provider |
| point cloud | `PointCloudHighlighter` | swaps **all** meshes to the deemphasized material, then re-emphasizes the selected meshes | repaints all meshes from the material provider |
| ribbon | `Ribbon` (no highlighter object) | moves two pre-made `highlightBeads` spheres onto the curve at the hovered interpolant(s) and shows them | hides the two beads |

> **The bug we just fixed lived in Surface A.** Before the redesign the strip had *no owner* — it
> was repainted as a side effect of whichever Surface-B highlighter happened to call back into the
> navigator. That worked in ribbon (navigator self-painted) and ball (the highlighter reached back)
> and **silently failed in point cloud** (its highlighter had no navigator reference). The redesign
> made Surface A a first-class renderer of a shared selection, so it now tracks for every style.

---

## 2. Four producers drive a highlight

Each input is a **producer**: it converts a pointer position into a set of *region indices*
(positions in the current genomic-extent list) and reports them. All four speak the same first
language — a genomic **interpolant** in `[0,1]` — which `ensembleManager.getGenomicInterpolantWindowList`
turns into `{ genomicExtent, index }` windows (or `undefined` for a gap).

| Producer | Site | Trigger → what it computes | Note |
|---|---|---|---|
| **Navigator ramp** | `genomicNavigator.onCanvasMouseMove` | mouse-Y on the ramp → one interpolant `1 - yNorm` | also pokes IGV's cursor guide (§6) |
| **IGV cursor** | `IGVPanel.setCustomCursorGuideMouseHandler` | cursor bp on a genomic track → one interpolant | registered once at init (HMR footgun, §6) |
| **Juicebox crosshairs** | `juiceboxPanel.handleCrosshairs` | crosshair x,y on the contact map → **two** interpolants | the only producer that yields two regions at once |
| **3D raycast picker** | `picker.intersect` | ray from the mouse into the scene → a hit `instanceId` | **balls only** — point cloud, ribbon, stick are in the raycaster `exclusionSet` |

> **Asymmetry to remember:** direct 3D interaction (the picker) only fires in **ball-and-stick**
> mode. You cannot click-highlight a point-cloud point or a ribbon segment — those object names are
> excluded from the raycast. The other three producers work in all three render styles.

---

## 3. The spine — one selection for the strip, per-style delegation for the structure

This is the heart of the design, and the place where "what's done" and "what's deferred" diverge.
Every producer fans out to **both** pipelines:

```mermaid
%%{init: {'themeVariables': {'fontSize': '17px', 'fontFamily': 'arial'}, 'flowchart': {'nodeSpacing': 45, 'rankSpacing': 55}}}%%
flowchart TB
    subgraph P["Producers — compute region indices"]
        NAV["Navigator ramp"]
        IGV["IGV cursor"]
        JB["Juicebox crosshairs"]
        PICK["3D raycast picker (balls only)"]
    end

    subgraph A["Surface A pipeline — UNIFIED, render-style-agnostic"]
        HC["HighlightController<br/>selection: set of region indices<br/>set / clear"]
        RH["genomicNavigator.renderHighlight(selection)"]
        STRIP[("Navigator strip")]
        HC -->|"reconcile: fan out to renderers"| RH --> STRIP
    end

    subgraph B["Surface B pipeline — LEGACY, per render style"]
        DEL["sceneManager.delegateGenomicInterpolant(data)"]
        SW{"active renderStyle?"}
        BH["BallHighlighter"]
        PCH["PointCloudHighlighter"]
        RIB["Ribbon.handleGenomicInterpolant"]
        STRUCT[("3D structure")]
        DEL --> SW
        SW -->|ball| BH --> STRUCT
        SW -->|"point cloud"| PCH --> STRUCT
        SW -->|ribbon| RIB --> STRUCT
    end

    NAV -->|"set / clear"| HC
    IGV -->|"set / clear"| HC
    JB  -->|"set / clear"| HC
    PICK -->|"set / clear"| HC

    NAV -->|delegateGenomicInterpolant| DEL
    IGV -->|delegateGenomicInterpolant| DEL
    JB  -->|delegateGenomicInterpolant| DEL
    PICK -.->|"ballHighlighter.processHit<br/>(bypasses the delegate)"| BH
```

Read the diagram as two columns hanging off the same four producers:

- **Surface A (left) is the redesign's finished half.** Every producer calls
  `highlightController.set(indices, source)` or `.clear(source)`. The controller dedupes, diffs, and
  on change `reconcile()`s by handing the selection to every registered renderer. Today there is
  exactly one renderer — the navigator strip — and the **render-style switch does not exist on this
  path at all**. Navigator and IGV and Juicebox and picker traverse the *identical* code to paint
  the strip, which is precisely why they can no longer disagree by render style.

- **Surface B (right) is still the legacy tangle.** Producers call
  `sceneManager.delegateGenomicInterpolant(data)`, which switches on the active render style and
  forwards to that viz's `handleGenomicInterpolant(data)`, which drives its highlighter. The picker
  is the odd one out: it **bypasses the delegate** and pokes `ballHighlighter` directly (it already
  knows it's in ball mode, since only balls are hittable).

> **Mental model:** the strip is now "one state, one renderer." The structure is still "one router,
> three implementations, plus a picker side-door." The deferred work in the RFC is to make Surface B
> look like Surface A — each viz becomes a `renderHighlight(selection)` renderer on the same
> controller, and `delegateGenomicInterpolant` + the switch dissolve.

A note on **`genomicNavigator.repaint()`**, which appears in several flows below: it is *not* part of
the selection pipeline. It redraws the color ramp itself (and incidentally clears the strip canvas).
It fires on trace/colormap/ensemble changes and as a belt-and-suspenders strip clear. Don't confuse
it with `renderHighlight([])`, which is the selection pipeline's way of clearing the strip.

---

## 4. The four highlighting styles, walked end to end

Each subsection is one of the user-facing "styles" of highlighting — the same outcome reached from a
different input. Sequence diagrams show the **set** (hover) path; clears are collected in §5.

### 4a. Driven by the genomic navigator — *the bug we just fixed*

Mousing the color ramp. This is the path that was broken in point-cloud mode.

```mermaid
%%{init: {'themeVariables': {'fontSize': '16px', 'fontFamily': 'arial'}}}%%
sequenceDiagram
    actor U as User
    participant GN as GenomicNavigator
    participant EM as EnsembleManager
    participant HC as HighlightController
    participant SM as SceneManager
    participant VIZ as active 3D viz
    U->>GN: mousemove over ramp
    GN->>EM: getGenomicInterpolantWindowList([1 - yNorm])
    alt window(s) found
        GN->>HC: set(indices, 'navigator')
        HC->>GN: renderHighlight(selection) → paint strip
        GN->>SM: delegateGenomicInterpolant({interpolantList})
        SM->>VIZ: handleGenomicInterpolant(...) → 3D highlight
        GN->>GN: poke IGV cursorGuide.updateWithInterpolant (§6)
    else gap (undefined)
        GN->>HC: clear('navigator') → strip clears
        GN->>SM: delegateGenomicInterpolant({}) → 3D clears*
    end
```

\* *ribbon does **not** clear on the empty delegate — see §5.* The strip clears correctly either way
because `clear('navigator')` runs the unified pipeline. **Before the redesign**, the strip half of
this flow only existed in ribbon (self-paint) and ball (highlighter back-call); point cloud reached
the 3D structure fine but never painted the strip. That gap is what Phase 2 closed.

### 4b. Driven by the IGV panel cursor

Mousing a genomic track in the embedded IGV browser.

```mermaid
%%{init: {'themeVariables': {'fontSize': '16px', 'fontFamily': 'arial'}}}%%
sequenceDiagram
    actor U as User
    participant IGV as IGV browser
    participant IP as IGVPanel handler
    participant EM as EnsembleManager
    participant HC as HighlightController
    participant SM as SceneManager
    U->>IGV: cursor over track
    IGV->>IP: customCursorGuideMouseHandler({bp, interpolant})
    IP->>IP: reject if bp outside locus
    IP->>EM: getGenomicInterpolantWindowList([interpolant])
    alt window(s) found
        IP->>HC: set(indices, 'igvCursor') → strip paints
    else gap
        IP->>HC: clear('igvCursor') → strip clears
    end
    IP->>SM: delegateGenomicInterpolant({interpolantList:[interpolant]}) → 3D
```

Structurally identical to the navigator path on the strip side — same `set`/`clear`, same renderer.
This sameness *is* the fix: the navigator and IGV can no longer diverge by render style.

### 4c. Driven by the Juicebox crosshairs

Mousing the contact map. Unique in producing **two** regions (the x and y of the crosshair).

```mermaid
%%{init: {'themeVariables': {'fontSize': '16px', 'fontFamily': 'arial'}}}%%
sequenceDiagram
    actor U as User
    participant JB as Juicebox browser
    participant JP as JuiceboxPanel.handleCrosshairs
    participant EM as EnsembleManager
    participant HC as HighlightController
    participant SM as SceneManager
    U->>JB: crosshairs over contact map
    JB->>JP: handleCrosshairs({interpolantX, interpolantY})
    JP->>JP: reject if either axis outside locus
    JP->>EM: getGenomicInterpolantWindowList([iX, iY])
    alt window(s) found
        JP->>HC: set(indices, 'juiceboxCrosshairs') → strip paints both bands
    else gap
        JP->>HC: clear('juiceboxCrosshairs') → strip clears
    end
    JP->>SM: delegateGenomicInterpolant({interpolantList:[iX, iY]}) → 3D
```

The two interpolants flow through unchanged: the strip paints two bands, ball/point-cloud highlight
two regions, and ribbon's two `highlightBeads` are exactly why there are *two* of them.

### 4d. Driven by direct 3D interaction (the raycast picker)

Hovering the 3D model itself. **Ball-and-stick only** — the picker excludes point-cloud, ribbon, and
stick geometry from the raycast.

```mermaid
%%{init: {'themeVariables': {'fontSize': '16px', 'fontFamily': 'arial'}}}%%
sequenceDiagram
    actor U as User
    participant PK as Picker.intersect
    participant HC as HighlightController
    participant BH as BallHighlighter
    participant GN as GenomicNavigator
    U->>PK: mouse over 3D scene (isEnabled?)
    PK->>PK: raycast, filter exclusionSet + invisible
    alt hit a ball (new instanceId)
        PK->>HC: set([instanceId], 'picker') → strip paints
        PK->>BH: processHit(hit) → ball highlight (bypasses delegate)
    else no hit
        PK->>HC: clear('picker') → strip clears
        PK->>BH: unhighlight()
        PK->>GN: repaint()
    end
```

This is the one producer whose two pipelines are wired differently: it pushes the strip through the
controller like everyone else, but reaches the ball highlighter **directly** rather than through
`delegateGenomicInterpolant`. The picker is also gated by `isEnabled`, toggled by the navigator
enter/leave events (§6).

The fact that direct 3D hover now paints the strip (via `set([instanceId])`) is itself a redesign
win — it used to ride the same fragile back-call as the navigator-driven ball highlight.

---

## 5. Clearing is the subtle part

Highlighting is easy; *un*-highlighting is where the asymmetry lives. Surface A clears uniformly —
every path that ends a highlight calls `highlightController.clear`, which runs `renderHighlight([])`.
**Surface B does not**: which highlighters get cleared depends on *how* the highlight ended, and the
coverage has holes.

```mermaid
%%{init: {'themeVariables': {'fontSize': '16px', 'fontFamily': 'arial'}}}%%
flowchart TB
    E1["Navigator mouseleave<br/>(DidLeaveGenomicNavigator)"] --> R1["delegateLeaveGenomicNavigator"]
    E2["IGV / JB DidHideCrosshairs"] --> R2["delegateHideCrosshairs"]
    E3["Picker enter/leave navigator<br/>or no-hit"] --> R3["picker handlers"]
    E4["Gap under cursor<br/>(empty delegate)"] --> R4["delegateGenomicInterpolant({})"]
    R1 --> HC[("highlightController.clear<br/>strip always clears")]
    R2 --> HC
    R3 --> HC
```

The strip side (`HC`) is clean. The structure side is the matrix below — every "no" is a latent
stuck-highlight:

| Clear trigger | Router | Clears strip? | Clears ball? | Clears point cloud? | Clears ribbon? |
|---|---|---|---|---|---|
| Navigator mouseleave (`DidLeaveGenomicNavigator`) | `delegateLeaveGenomicNavigator` | ✅ | **no** — done by the picker's `DidLeave` handler instead | ✅ `handleLeaveGenomicNavigator` | ✅ `handleHideHighlights` |
| IGV / Juicebox cursor hide (`DidHideCrosshairs`) | `delegateHideCrosshairs` | ✅ | ✅ `handleHideCrosshairs` | **no** | ✅ `handleHideHighlights` |
| Picker: enter/leave navigator, or no-hit | `picker.receiveEvent` / `intersect` | ✅ | ✅ `ballHighlighter.unhighlight` | — | — |
| Gap under a still-hovering cursor (empty delegate) | `delegateGenomicInterpolant({})` | ✅ (producer also `clear`s) | ✅ `unhighlight` | ✅ `unhighlight` | **no** — `handleGenomicInterpolant` has no else branch |

Two consequences worth internalizing:

1. **Ball's navigator-leave clear lives in the *picker*, not the scene manager.** When you leave the
   navigator, `delegateLeaveGenomicNavigator` clears point cloud and ribbon, but the ball is cleared
   out-of-band by the picker's `DidLeaveGenomicNavigator` handler (which also re-enables the picker).
   This split is exactly the kind of per-(input × style) wiring the redesign aims to delete.
2. **Ribbon does not self-clear on a gap.** `Ribbon.handleGenomicInterpolant` only *shows* beads; it
   has no else branch, so an empty delegate leaves them where they were. They get hidden on leave
   (`handleHideHighlights`), not on hovering a gap — a small latent asymmetry, harmless today.

This whole matrix collapses once each viz becomes a `renderHighlight(selection)` renderer: clear
stops being a separate path and becomes `renderHighlight([])`, the same as the strip.

---

## 6. Cross-participant coupling (the non-obvious edges)

A few edges don't fit the clean producer→pipeline story and are worth calling out so they aren't
mistaken for bugs:

- **The navigator pokes IGV's cursor guide.** On a successful navigator hover,
  `onCanvasMouseMove` calls `igvPanel.browser.cursorGuide.updateWithInterpolant(...)` so the IGV
  ruler tracks the ramp. This is a producer reaching sideways into another input's UI — it does not
  re-enter the highlight pipeline, but it is why mousing the ramp also moves the IGV cursor line.
- **`DidEnter` / `DidLeaveGenomicNavigator` gate the picker.** These two events exist mainly to set
  `picker.isEnabled` (don't raycast the 3D model while the user is working the ramp) and to clear the
  ball highlighter on the boundary. The redesign folds these into ordinary producer state, which is
  why event-bus Phase 3 is *subsumed* by the highlighting RFC.
- **HMR footgun.** IGV's cursor→highlight handler is registered once at init via
  `browser.setCustomCursorGuideMouseHandler`. Vite HMR leaves the old closure installed, so editing
  `IGVPanel.js` / `genomicNavigator.js` and hot-swapping makes IGV highlighting look broken until a
  **full page reload**. Hard-refresh when instrumenting these files.

---

## 7. Gaps in the genomic extent (a constraint every producer honors)

An ensemble's genomic extent can have **gaps** — stretches with no region (data absent, or a defect
deliberately ignored). This is independent of render style. The contract:

- **Producer side:** an interpolant that lands in a gap makes `getGenomicInterpolantWindowList`
  return `undefined`. Every producer treats that as an explicit **`clear()`**, never a degenerate
  `set([])`. Hovering a gap highlights nothing; it does not throw and does not highlight a neighbor.
- **Renderer side:** because the selection holds *indices*, `renderHighlight(selection)` maps
  `index → genomicExtentList[index]` and `.filter(Boolean)`s indices it has no extent for. The 3D
  highlighters apply the same tolerance when mapping `index → mesh / instanceId / curve point`.

See the RFC's "Constraint: gaps in the genomic extent" section for the deeper rationale.

---

## 8. Where this is going

| Half | State | Shape |
|---|---|---|
| **Surface A — navigator strip** | ✅ Done (Phases 1–3) | One observable selection → one reconciler → one renderer. No render-style switch on this path. |
| **Surface B — 3D structure** | ⚠️ Legacy | Per-style `delegateGenomicInterpolant` switch + three highlighters + a picker side-door + the split clear-paths in §5. |

The target (deferred, not bug-driven — see the RFC's "Phase 3 deferred" section) is to make Surface B
look like Surface A: each viz registers a `renderHighlight(selection)` renderer on the same
`HighlightController`, the producers stop calling `delegateGenomicInterpolant`, and
`delegateGenomicInterpolant` / `delegateLeaveGenomicNavigator` / `delegateHideCrosshairs`, the
standalone highlighter mutators, the `DidEnter/LeaveGenomicNavigator` events, `picker.isEnabled`, and
the `point_cloud` raycast exclusion all dissolve. At that point the §5 clear matrix disappears
entirely — there is one path, four producers wide and N renderers deep, and nothing left to wire
wrong.

---

## See also

- [refactor-highlighting-redesign.md](refactor-highlighting-redesign.md) — the RFC / plan this map documents the result of (PR #65).
- [architecture/wiring-diagram.md](architecture/wiring-diagram.md) — how these participants are assembled and injected.
- [interaction-diagram-spacewalk-igv.md](interaction-diagram-spacewalk-igv.md) — the IGV cursor-guide edge in more detail.
- [interaction-diagram-spacewalk-juicebox.md](interaction-diagram-spacewalk-juicebox.md) — the Juicebox crosshairs edge in more detail.
