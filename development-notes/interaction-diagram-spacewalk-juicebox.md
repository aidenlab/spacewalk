# Spacewalk ↔ Juicebox.js Interaction Diagrams

Interaction flows for the redesigned Juicebox panel. Live contact maps and live distance maps are computed by **hic-straw's `LiveContactMap`** and rendered by **direct canvas painting** — the same simple approach used in hic-straw's own example page. Juicebox's tile pipeline is used **only** for static Hi-C maps.

> **Updated 2026-06.** Reflects current `LiveContactMap` setup: hic-straw receives the open HDF5 handle directly (baked `live_contact_map_vertices` fast path) and only falls back to runtime trace gathering for legacy pointcloud files. The old `liveMapUtils.ensureLiveMapVertexLists()` / `EnsembleManager.getLiveMapVertexLists()` indirection is gone. Also reflects Phase 3 DI (PR #44): `JuiceboxPanel`, `LiveContactMapService`, and `LiveDistanceMapService` all receive their collaborators via constructor injection; the module-level `tabAssessment` helper was folded into `JuiceboxPanel.assessTab()`.

---

## 1. Architecture Overview

Three tabs, **three separate canvases**, one rendering approach per map type:

| Tab | Canvas | Rendering | Owned by |
|-----|--------|-----------|----------|
| **Hi-C Map** | Juicebox main canvas | Juicebox tile pipeline | Juicebox.js |
| **Live Contact** | Spacewalk contact canvas (`ctx_live_contact`, 2d) | Direct `putImageData` painting | Spacewalk |
| **Live Distance** | Spacewalk distance canvas (`ctx_live_distance`, 2d) | Direct `putImageData` painting | Spacewalk |

Each tab shows its own canvas. No dataset swapping. The Hi-C tab is completely independent from the two live map tabs.

Both live maps are painted using the same pattern from hic-straw's `examples/live-contact-map.html`: iterate data, call `fillScaledPixel()` for each bin, `putImageData()`. Simple, fast, no tile pipeline overhead.

```mermaid
%%{init: {'themeVariables': {'fontSize': '18px', 'fontFamily': 'arial'}, 'flowchart': {'nodeSpacing': 60, 'rankSpacing': 50}}}%%
flowchart TB
    subgraph Spacewalk["Spacewalk"]
        LCMS[LiveContactMapService]
        LDMS[LiveDistanceMapService]
        JP[JuiceboxPanel]
        RU[liveMapRenderUtils<br/>fillScaledPixel<br/>renderContactMap<br/>renderDistanceMap]
        EM[EnsembleManager]
        DS[SWBDatasource]
        IGV[IGVPanel]
    end

    subgraph HicStraw["hic-straw"]
        LCM["LiveContactMap<br/>(computation engine)"]
    end

    subgraph JuiceboxJS["Juicebox.js"]
        Browser[HicBrowser]
        CMV[ContactMatrixView]
    end

    User[User presses Calculate] --> LCMS
    LCMS -->|read locus + traceLength| EM
    LCMS -->|read genome.chromosomes| IGV
    LCMS -->|"hdf5 + ensembleGroupKey<br/>(or traces, legacy pointcloud)"| DS
    LCMS -->|"new LiveContactMap(config)"| LCM
    LCMS -->|"lcm.init()"| LCM
    LCMS -->|"browser.loadLiveContactMap()<br/>(populates locus input + rulers)"| Browser

    LCMS -->|"renderContactMap(ctx, lcm)"| RU
    RU -->|"iterate lcm.contactRecords"| LCM
    RU -->|"putImageData"| ContactCanvas["Contact Canvas (2d)"]

    LCMS -->|renderFromLiveContactMap| LDMS
    LDMS -->|"renderDistanceMap(ctx, lcm)"| RU
    RU -->|"iterate lcm.getDistanceMatrix()"| LCM
    RU -->|"putImageData"| DistCanvas["Distance Canvas (2d)"]

    JP -->|"Hi-C tab only"| Browser
    Browser --> CMV
    CMV --> HicCanvas["Hi-C Canvas<br/>(Juicebox tiles)"]
```

---

## 2. Calculate Button — Full Sequence

When the user presses **Calculate**, a single `LiveContactMap` instance is created. Both maps are painted directly to their respective canvases. Juicebox is not involved.

```mermaid
%%{init: {'themeVariables': {'fontSize': '16px'}}}%%
sequenceDiagram
    autonumber
    participant User
    participant LCMS as LiveContactMapService
    participant EM as EnsembleManager
    participant IGV as IGVPanel
    participant DS as SWBDatasource
    participant LCM as LiveContactMap<br/>(hic-straw)
    participant JB as JuiceboxPanel
    participant Browser as HicBrowser
    participant RU as liveMapRenderUtils
    participant ContactCanvas as Contact Canvas (2d)
    participant LDMS as LiveDistanceMapService
    participant DistCanvas as Distance Canvas (2d)

    User->>LCMS: click Calculate button
    LCMS->>JB: showLiveMapSpinner()

    Note over LCMS,DS: Phase 1 — Gather config
    LCMS->>EM: locus, getLiveMapTraceLength()
    LCMS->>IGV: browser.genome.id, browser.genome.chromosomes
    LCMS->>DS: ds.isPointCloud, ds.hasLiveVertexBake()
    alt baked HDF5 (default path)
        LCMS->>LCMS: lcmConfig.hdf5 = ds.hdf5, ensembleGroupKey
    else legacy pointcloud without bake
        LCMS->>DS: buildPointCloudLiveMapTraces()
        DS-->>LCMS: traces: Array<Array<{x, y, z}>>
        LCMS->>LCMS: lcmConfig.traces = traces
    end

    Note over LCMS,LCM: Phase 2 — Create and initialize LiveContactMap
    LCMS->>LCM: new LiveContactMap(lcmConfig)
    LCMS->>LCM: init()
    LCM->>LCM: _computeDistances() → distanceMatrix, maxDistance
    LCM->>LCM: _deriveContacts() → contactRecords[] (with binOffset)
    LCM-->>LCMS: initialized

    Note over LCMS,Browser: Phase 3 — Register live map with Juicebox
    LCMS->>Browser: browser.loadLiveContactMap({ liveContactMap, name, locus })
    Note right of Browser: Populates locus input,<br/>scrollbars, rulers — does<br/>NOT paint the canvas
    LCMS->>JB: updateLiveMapCanvasSizes(contactMatrixView)

    Note over LCMS,ContactCanvas: Phase 4 — Paint contact map directly
    LCMS->>RU: renderContactMap(ctx_live_contact, lcm)
    RU->>RU: iterate lcm.contactRecords
    RU->>RU: fillScaledPixel() for each record (upper + lower triangle)
    RU->>ContactCanvas: ctx.putImageData(imageData)

    Note over LCMS,DistCanvas: Phase 5 — Paint distance map directly
    LCMS->>LDMS: renderFromLiveContactMap(lcm, colorConfig)
    LDMS->>RU: renderDistanceMap(ctx_live_distance, lcm)
    RU->>LCM: getDistanceMatrix()
    LCM-->>RU: { distances, maxDistance, traceLength }
    RU->>RU: iterate distances, fillScaledPixel() (blue→red)
    RU->>DistCanvas: ctx.putImageData(imageData)

    LCMS->>JB: hideLiveMapSpinner()
```

### Key Points

| Aspect | Detail |
|--------|--------|
| **Single LCM instance** | One `LiveContactMap` serves both maps — contact records for the contact canvas, distance matrix for the distance canvas |
| **Direct painting** | Both canvases use `getContext('2d')` → `getImageData` → `fillScaledPixel` → `putImageData`. No tile pipeline, no Straw, no HiCDataset |
| **HDF5 fast path** | Spacewalk passes hic-straw the already-open HDF5 handle so it can use the baked `live_contact_map_vertices` dataset. Legacy pointcloud files without the bake fall back to runtime centroid collapse via `ds.buildPointCloudLiveMapTraces()` |
| **Juicebox register-only** | `browser.loadLiveContactMap()` is called so Juicebox populates the locus input, scrollbars, and rulers — but the canvas itself is painted directly by Spacewalk, not by the tile pipeline |
| **Rendering utilities** | `liveMapRenderUtils.js` provides `renderContactMap()`, `renderDistanceMap()`, and `fillScaledPixel()` — shared by both services |
| **Bin offset** | `renderContactMap()` uses `lcm.binOffset` to convert absolute bin indices back to trace-relative canvas positions |

---

## 3. Slider Adjustment — Cheap Parameter Update

Adjusting the **threshold** or **exclusion** slider re-derives contact records from the existing distance matrix, then repaints the contact canvas directly. No Juicebox involvement.

```mermaid
%%{init: {'themeVariables': {'fontSize': '16px'}}}%%
sequenceDiagram
    autonumber
    participant User
    participant Slider as Threshold Slider
    participant LCMS as LiveContactMapService
    participant LCM as LiveContactMap
    participant RU as liveMapRenderUtils
    participant Canvas as Contact Canvas (2d)

    User->>Slider: drag slider (input event)
    Slider->>LCMS: update display text only

    User->>Slider: release slider (change event)
    Slider->>LCMS: change handler fires
    LCMS->>LCM: setDistanceThreshold(newValue)
    LCM->>LCM: _deriveContacts() [recompute contacts, NOT distances]
    LCMS->>RU: renderContactMap(ctx_live_contact, lcm)
    RU->>RU: iterate updated contactRecords
    RU->>Canvas: ctx.putImageData(imageData)
```

### Cost Comparison

| Operation | What it computes | Cost |
|-----------|-----------------|------|
| **Calculate button** | Distance matrix + contact records + paint both canvases | Expensive (O(traces x N^2)) |
| **Threshold / Exclusion slider** | Contact records only (from existing distance matrix) + repaint contact canvas | Cheap (O(N^2)) |
| **Contact mode change** | Full rebuild (new LCM + init + paint both canvases) | Expensive (same as Calculate) |

---

## 4. Contact Mode Change — Full Rebuild

Switching between **Frequency** and **Binary** contact modes requires a full rebuild because the derivation algorithm differs fundamentally.

```mermaid
%%{init: {'themeVariables': {'fontSize': '16px'}}}%%
sequenceDiagram
    autonumber
    participant User
    participant Select as Contact Mode Select
    participant LCMS as LiveContactMapService

    User->>Select: change Frequency → Binary
    Select->>LCMS: change handler fires
    LCMS->>LCMS: calculateLiveMaps()
    Note right of LCMS: Full rebuild: same sequence<br/>as Calculate button (Section 2)
```

---

## 5. Tab Switching — Three Separate Canvases

Each tab simply shows/hides its own canvas container. No dataset swapping, no Juicebox API calls for live tabs.

```mermaid
%%{init: {'themeVariables': {'fontSize': '16px'}}}%%
sequenceDiagram
    autonumber
    participant User
    participant Tab as Tab Button
    participant JP as JuiceboxPanel

    alt User clicks Hi-C Map tab
        User->>Tab: click Hi-C Map
        Tab->>JP: assessTab(tabButton)
        JP->>JP: show Hi-C canvas container
        JP->>JP: hide contact canvas container
        JP->>JP: hide distance canvas container
        JP->>JP: show file chooser widget
        JP->>JP: hide live map controls widget
        JP->>JP: repaint Hi-C tiles (if dataset exists)

    else User clicks Live Contact tab
        User->>Tab: click Live Contact
        Tab->>JP: assessTab(tabButton)
        JP->>JP: hide Hi-C canvas container
        JP->>JP: show contact canvas container
        JP->>JP: hide distance canvas container
        JP->>JP: hide file chooser widget
        JP->>JP: show live map controls widget
        Note right of JP: Contact canvas already<br/>painted — nothing to re-render

    else User clicks Live Distance tab
        User->>Tab: click Live Distance
        Tab->>JP: assessTab(tabButton)
        JP->>JP: hide Hi-C canvas container
        JP->>JP: hide contact canvas container
        JP->>JP: show distance canvas container
        JP->>JP: hide file chooser widget
        JP->>JP: hide live map controls widget
        Note right of JP: Distance canvas already<br/>painted — nothing to re-render
    end
```

### Canvas and Widget Visibility

| Tab | Hi-C Canvas | Contact Canvas | Distance Canvas | File Chooser | Controls |
|-----|-------------|----------------|-----------------|--------------|----------|
| Hi-C Map | visible | hidden | hidden | visible | hidden |
| Live Contact | hidden | visible | hidden | hidden | visible |
| Live Distance | hidden | hidden | visible | hidden | hidden |

---

## 6. Component Responsibilities

```mermaid
%%{init: {'themeVariables': {'fontSize': '18px', 'fontFamily': 'arial'}, 'flowchart': {'nodeSpacing': 60, 'rankSpacing': 50}}}%%
flowchart LR
    subgraph Spacewalk["Spacewalk (orchestrator + renderer)"]
        LCMS["LiveContactMapService<br/>• owns slider event handlers<br/>• creates LiveContactMap<br/>• paints contact canvas<br/>• triggers distance render"]
        LDMS["LiveDistanceMapService<br/>• receives LCM reference<br/>• paints distance canvas"]
        JP["JuiceboxPanel<br/>• manages three canvases<br/>• tab show/hide (assessTab)<br/>• Hi-C file loading<br/>• mouse-crosshair handler"]
        RU["liveMapRenderUtils<br/>• fillScaledPixel()<br/>• renderContactMap()<br/>• renderDistanceMap()"]
    end

    subgraph HicStraw["hic-straw (computation engine)"]
        LCM["LiveContactMap<br/>• computes distance matrix<br/>• derives contact records<br/>• cheap param updates"]
    end

    subgraph JuiceboxJS["Juicebox.js (Hi-C only)"]
        Browser["HicBrowser<br/>• loadHicFile()<br/>• tile rendering"]
    end

    LCMS --> LCM
    LCMS --> RU
    LDMS --> RU
    LDMS --> LCM
    JP --> Browser
```

| Component | Lives in | Owns |
|-----------|----------|------|
| `LiveContactMap` | hic-straw | Distance matrix, contact records, cheap param updates |
| `LiveContactMapService` | Spacewalk | Slider UI, Calculate button, LCM lifecycle, contact canvas painting |
| `LiveDistanceMapService` | Spacewalk | Distance canvas painting |
| `liveMapRenderUtils` | Spacewalk | `fillScaledPixel()`, `renderContactMap()`, `renderDistanceMap()` |
| `JuiceboxPanel` | Spacewalk | Three canvas containers, tab switching, Hi-C file loading |
| `HicBrowser` | Juicebox.js | Hi-C tile pipeline only |

---

## 7. Ensemble Lifecycle — DidLoadEnsembleFile

When a new ensemble loads, all three components reset independently via the event bus.

```mermaid
%%{init: {'themeVariables': {'fontSize': '16px'}}}%%
sequenceDiagram
    autonumber
    participant Bus as SpacewalkEventBus
    participant LCMS as LiveContactMapService
    participant LDMS as LiveDistanceMapService
    participant JP as JuiceboxPanel

    Bus->>LCMS: DidLoadEnsembleFile
    LCMS->>LCMS: lcm = null
    LCMS->>LCMS: reset sliders to defaults

    Bus->>LDMS: DidLoadEnsembleFile
    LDMS->>LDMS: lcm = null
    LDMS->>LDMS: clearRect on distance canvas

    Bus->>JP: DidLoadEnsembleFile
    JP->>JP: clear Hi-C canvas (fillRect snow)
    JP->>JP: clearRect on contact canvas
    JP->>JP: clearRect on distance canvas
    JP->>JP: apply Spacewalk locus
    JP->>JP: show Hi-C Map tab
```

---

## 8. Data Flow Summary

```
Ensemble 3D structures
        │
        ▼
SWBDatasource — hdf5 handle (baked live_contact_map_vertices)
                or buildPointCloudLiveMapTraces() (legacy pointcloud)
        │
        ▼  hdf5 + ensembleGroupKey  OR  traces: Array<Array<{x, y, z}>>
        │
   LiveContactMap (hic-straw)
        │
        ├──── init()
        │       ├── _computeDistances()  →  distanceMatrix (Float32Array)
        │       └── _deriveContacts()    →  contactRecords[] (with binOffset)
        │
        ├──── contactRecords            ─────►  renderContactMap()    →  contact canvas (2d)
        │     (iterated directly by                                      putImageData
        │      liveMapRenderUtils)
        │
        ├──── getDistanceMatrix()       ─────►  renderDistanceMap()   →  distance canvas (2d)
        │                                                                putImageData
        │
        ├──── setDistanceThreshold()    ───►  _deriveContacts() only (cheap)
        │                                     then renderContactMap() repaint
        │
        └──── setNeighborExclusion()    ───►  _deriveContacts() only (cheap)
                                              then renderContactMap() repaint
```

---

## 9. What Changed from the Previous Design

| Aspect | Before (original) | Middle (first refactor) | Now (current) |
|--------|-------------------|------------------------|---------------|
| **Contact map rendering** | Web worker RGBA + bitmaprenderer | Juicebox tile pipeline | Direct 2d canvas painting |
| **Distance map rendering** | Web worker RGBA + bitmaprenderer | Spacewalk RGBA + bitmaprenderer | Direct 2d canvas painting |
| **Canvases** | 3: Hi-C, ctx_live, ctx_live_distance | 2: Juicebox main (shared), distance | 3: Hi-C, contact (2d), distance (2d) |
| **Juicebox involvement** | Color scale only | Full tile pipeline for contacts | `loadLiveContactMap()` to register locus/rulers only; Hi-C tile pipeline for Hi-C files only |
| **Tab switching** | Separate canvases | Dataset swap on shared canvas | Separate canvases, show/hide via `JuiceboxPanel.assessTab()` |
| **Canvas context type** | bitmaprenderer | bitmaprenderer + Juicebox ctx | All 2d (getContext('2d')) |
| **Rendering pattern** | Custom per-pixel RGBA loops | Tile pipeline + custom RGBA | `fillScaledPixel` + `putImageData` |
| **Threshold/exclusion** | Spacewalk auto-detect | Sliders → repaintMatrix() | Sliders → renderContactMap() |
| **Worker files** | liveContactMapWorker, liveDistanceMapWorker | Deleted | Deleted |
| **Shared utility** | None | None | `liveMapRenderUtils.js` |
| **Vertex data path** | Computed per-call from EnsembleManager | `liveMapUtils.ensureLiveMapVertexLists()` indirection | Baked `live_contact_map_vertices` HDF5 fast path; legacy fallback via `ds.buildPointCloudLiveMapTraces()` |
| **Module wiring** | Singleton imports from `app.js` | Singleton imports from `app.js` | **Constructor injection** (PR #44): `JuiceboxPanel`/`LiveContactMapService`/`LiveDistanceMapService` all receive collaborators explicitly. `tabAssessment` + `juiceboxMouseHandler` folded into `JuiceboxPanel` methods; `juiceboxPanelInstance` module singleton deleted |
