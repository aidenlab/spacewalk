# Architecture: Track Material Provider Checkbox Interaction

This document describes how Spacewalk and the IGV.js spacewalk branch interact via the **track material provider checkbox**—a per-track checkbox in the IGV axis column that enables genomic track data to drive 3D chromatin coloring.

> **Updated 2026-06 for Phase 3 DI.** The old `utils.setMaterialProvider(...)` helper was deleted (PR #42); its two-line body is now inlined directly in `IGVPanel`. `IGVPanel` receives `sceneManager` and `genomicNavigator` via constructor injection.

---

## Mermaid Diagram (Component + Sequence)

```mermaid
flowchart TB
    subgraph Spacewalk["Spacewalk"]
        PI[PanelInitializer]
        IGV[IGVPanel]
        TMP[TrackMaterialProvider]
        SM[SceneManager]
        GN[GenomicNavigator]
        VIZ[Ribbon / BallAndStick / PointCloud]

        PI -->|injects colorRamp + trackMaterialProvider<br/>+ sceneManager + genomicNavigator| IGV
        IGV -->|browser.on dataValueMaterialCheckbox| EVT[Event Handler]
        EVT -->|checked: activateTrackMaterialProvider| TMP
        EVT -->|unchecked: deactivateTrackMaterialProvider| TMP
        TMP -->|configure / removeTrackInstance| TMP
        IGV -->|sceneManager.updateMaterialProvider| SM
        IGV -->|genomicNavigator.repaint| GN
        SM -->|fan out updateMaterialProvider| VIZ
        VIZ -->|colorForInterpolant| TMP
    end
    
    subgraph IGVJS["IGV.js (spacewalk branch)"]
        TV[trackView.createAxis]
        AXIS[.igv-axis-column]
        CB["<input type=checkbox>"]
        BROWSER[browser.fireEvent]
        
        TV -->|append axis div| AXIS
        TV -->|create checkbox for non-ruler/sequence/ideogram| CB
        CB -->|change event| BROWSER
        BROWSER -->|"dataValueMaterialCheckbox [track]"| IGV
    end
    
    USER[User clicks checkbox] --> CB
```

```mermaid
sequenceDiagram
    participant User
    participant Checkbox as IGV Checkbox
    participant Browser as IGV Browser
    participant IGVPanel as IGVPanel
    participant TMP as TrackMaterialProvider
    participant SM as SceneManager
    participant GN as GenomicNavigator
    participant Viz as 3D Viz (Ribbon/Ball/PointCloud)

    User->>Checkbox: click
    Checkbox->>Browser: fireEvent('dataValueMaterialCheckbox', [track])
    Browser->>IGVPanel: invoke listener
    IGVPanel->>TMP: configure(track)
    Note over TMP: getFeatures, createColorList, updateAggregatedColorList
    TMP-->>IGVPanel: done
    IGVPanel->>SM: sceneManager.updateMaterialProvider(trackMaterialProvider)
    SM->>Viz: updateMaterialProvider(provider)
    Viz->>TMP: colorForInterpolant(interpolant)
    TMP-->>Viz: THREE.Color
    Viz->>Viz: repaint 3D chromatin
    IGVPanel->>GN: genomicNavigator.repaint()
```

---

## Overview

When a user checks the checkbox next to an IGV track, that track's genomic features (values or colors) are used to color the 3D chromatin structure. Multiple tracks can be active; their colors are blended. The checkbox lives in IGV.js; the logic that responds to it lives in Spacewalk.

---

## Architectural Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                    SPACEWALK                                              │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                          │
│  ┌──────────────────────┐         ┌─────────────────────────────────────────────────┐   │
│  │   PanelInitializer   │         │              IGVPanel                             │   │
│  │                      │         │                                                  │   │
│  │  Creates IGVPanel     │────────▶│  • colorRampMaterialProvider (default)            │   │
│  │  with:                │         │  • trackMaterialProvider                         │   │
│  │  • colorRampMaterial   │         │  • materialProvider (active: ramp or track)      │   │
│  │  • trackMaterial      │         │                                                  │   │
│  └──────────────────────┘         │  configureMouseHandlers():                        │   │
│                                    │    browser.on('dataValueMaterialCheckbox', ...)   │   │
│                                    │    browser.on('trackremoved', ...)                 │   │
│                                    └────────────────────┬────────────────────────────┘   │
│                                                           │                              │
│                                                           │ subscribes to events          │
│                                                           ▼                              │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐   │
│  │                         IGV.js (spacewalk branch)                                  │   │
│  │                                                                                    │   │
│  │  ┌─────────────────────────────────────────────────────────────────────────────┐   │   │
│  │  │  trackView.js  →  createAxis(browser, track)                                │   │   │
│  │  │                                                                             │   │   │
│  │  │  For each track (except ruler, sequence, ideogram):                          │   │   │
│  │  │    • Create <input type="checkbox"> in axis div                              │   │   │
│  │  │    • Append axis to .igv-axis-column                                         │   │   │
│  │  │    • input.addEventListener('change', () =>                                  │   │   │
│  │  │        browser.fireEvent('dataValueMaterialCheckbox', [this.track])          │   │   │
│  │  │    • trackView.materialProviderInput = input                                 │   │   │
│  │  └─────────────────────────────────────────────────────────────────────────────┘   │   │
│  │                                                                                    │   │
│  │  Layout:  .igv-axis-column  (50px)  contains one axis div per track                │   │
│  │           Each axis: [checkbox] [optional axis canvas]                              │   │
│  └──────────────────────────────────────────────────────────────────────────────────┘   │   │
│                                                           │                              │
│                                                           │ event: dataValueMaterialCheckbox │
│                                                           │ payload: track                │
│                                                           ▼                              │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐   │
│  │  IGVPanel (continued)                                                              │   │
│  │                                                                                    │   │
│  │  On 'dataValueMaterialCheckbox' (track):                                           │   │
│  │    if (track.trackView.materialProviderInput.checked)                               │   │
│  │      → activateTrackMaterialProvider(track)                                        │   │
│  │    else                                                                            │   │
│  │      → deactivateTrackMaterialProvider(track)                                       │   │
│  │                                                                                    │   │
│  │  On 'trackremoved' (track):                                                         │   │
│  │    if (track.trackView.materialProviderInput?.checked)                              │   │
│  │      → removeTrackFromMaterialProvider(track)                                       │   │
│  └──────────────────────────────────────────────────────────────────────────────────┘   │
│                                                           │                              │
│                                                           ▼                              │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐   │
│  │  TrackMaterialProvider (Spacewalk)                                                 │   │
│  │                                                                                    │   │
│  │  configure(track):                                                                 │   │
│  │    • viewport.getFeatures(track, chr, startBP, endBP, bpPerPixel)                  │   │
│  │    • createColorList(allFeaturesPerExtent, track)  // value-based or color-only     │   │
│  │    • trackColorLists.set(trackId, colorList)                                        │   │
│  │    • updateAggregatedColorList()  // blend multiple tracks (LAB space)              │   │
│  │                                                                                    │   │
│  │  removeTrackInstance(track):                                                       │   │
│  │    • Delete from trackColorLists, trackDataRanges                                   │   │
│  │    • updateAggregatedColorList()                                                   │   │
│  │                                                                                    │   │
│  │  colorForInterpolant(t) → THREE.Color  // used by 3D visualization                  │   │
│  └──────────────────────────────────────────────────────────────────────────────────┘   │
│                                                           │                              │
│                                                           │ sceneManager.updateMaterialProvider(p) │
│                                                           │ genomicNavigator.repaint()           │
│                                                           ▼                              │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐   │
│  │  SceneManager.updateMaterialProvider(materialProvider)                             │   │
│  │                                                                                    │   │
│  │    ribbon?.updateMaterialProvider(materialProvider)                                 │   │
│  │    ballAndStick?.updateMaterialProvider(materialProvider)                           │   │
│  │    pointCloud?.updateMaterialProvider(materialProvider)                             │   │
│  │                                                                                    │   │
│  │  (sceneManager and genomicNavigator are injected into IGVPanel at construction.    │   │
│  │   The two-line helper that used to live in utils.js was deleted in PR #42.)        │   │
│  └──────────────────────────────────────────────────────────────────────────────────┘   │
│                                                           │                              │
│                                                           ▼                              │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐   │
│  │  3D Visualization (Ribbon, BallAndStick, PointCloud)                              │   │
│  │                                                                                    │   │
│  │  Each calls materialProvider.colorForInterpolant(interpolant) for each vertex/     │   │
│  │  instance and updates geometry color attributes → 3D chromatin coloring            │   │
│  └──────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                          │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Sequence Diagram: User Checks a Track Checkbox

```
  User          IGV trackView      IGV browser       IGVPanel         TrackMaterialProvider   setMaterialProvider   3D viz
   │                  │                  │                │                      │                    │               │
   │  click checkbox   │                  │                │                      │                    │               │
   │─────────────────▶│                  │                │                      │                    │               │
   │                  │ change event      │                │                      │                    │               │
   │                  │ fireEvent('dataValueMaterialCheckbox', [track])            │                    │               │
   │                  │─────────────────▶│                │                      │                    │               │
   │                  │                  │  invoke listeners                       │                    │               │
   │                  │                  │────────────────▶│                      │                    │               │
   │                  │                  │                │  activateTrackMaterialProvider(track)        │               │
   │                  │                  │                │  configure(track)      │                    │               │
   │                  │                  │                │──────────────────────▶│                    │               │
   │                  │                  │                │  (viewport.getFeatures, createColorList,    │               │
   │                  │                  │                │   updateAggregatedColorList)                │               │
   │                  │                  │                │◀──────────────────────│                    │               │
   │                  │                  │                │  sceneManager.updateMaterialProvider(trackMaterialProvider)               │
   │                  │                  │                │───────────────────────────────────────────▶│               │
   │                  │                  │                │                      │  ribbon/ball/point   │               │
   │                  │                  │                │                      │  .updateMaterialProvider()          │
   │                  │                  │                │                      │────────────────────────────────────▶│
   │                  │                  │                │                      │                    │  colorForInterpolant()
   │                  │                  │                │                      │                    │  → repaint 3D
   │                  │                  │                │                      │                    │◀───────────────│
   │                  │                  │                │  genomicNavigator.repaint()                                  │
   │                  │                  │                │──────────────────────────────────────────────────────────────┐
   │  ◀──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
   │  3D chromatin now colored by track data
```

---

## Key Files and Responsibilities

| Component | File | Responsibility |
|-----------|------|----------------|
| **Checkbox creation** | `igv.js/js/trackView.js` | Creates checkbox in `createAxis()`, excludes ruler/sequence/ideogram; fires `dataValueMaterialCheckbox` on change; stores `trackView.materialProviderInput` |
| **Event subscription** | `spacewalk/js/IGVPanel.js` | `browser.on('dataValueMaterialCheckbox', ...)` and `browser.on('trackremoved', ...)` |
| **Track material logic** | `spacewalk/js/trackMaterialProvider.js` | `configure(track)`, `removeTrackInstance(track)`, `colorForInterpolant(t)`, `updateAggregatedColorList()`. Cleared via `clearAllTracks()` on each ensemble load (called from `EnsembleIngestionController`) |
| **Material provider dispatch** | `spacewalk/js/sceneManager.js` | `updateMaterialProvider()` fans out to ribbon, ballAndStick, pointCloud. Invoked directly by `IGVPanel` (no `utils.setMaterialProvider` indirection — deleted in PR #42) |
| **Checkbox clearing** | `spacewalk/js/utils/utils.js` | `unsetDataMaterialProviderCheckbox(igvPanel)` — called by `EnsembleIngestionController` on each ensemble load |
| **Session persistence** | `spacewalk/js/IGVPanel.js` | `getSessionState()` / `restoreSessionState()` for checked track names |

---

## Data Flow Summary

1. **User → IGV**: User toggles checkbox in axis column. IGV fires `dataValueMaterialCheckbox` with the track.
2. **IGV → Spacewalk**: IGVPanel listens and calls `activateTrackMaterialProvider` or `deactivateTrackMaterialProvider`.
3. **TrackMaterialProvider**: Fetches features via `viewport.getFeatures()`, builds color lists, blends them.
4. **Spacewalk 3D**: `IGVPanel` calls `sceneManager.updateMaterialProvider(provider)` (fans out to Ribbon, BallAndStick, PointCloud) and `genomicNavigator.repaint()` directly — both deps were injected into `IGVPanel` at construction. Each viz calls `colorForInterpolant(interpolant)` to color vertices.
5. **Reverse control**: Spacewalk can programmatically set `trackView.materialProviderInput.checked` (e.g. session restore, render-style change) and uses `unsetDataMaterialProviderCheckbox()` to clear all checkboxes when switching visualization modes.
6. **Ensemble swap**: When a new `.sw` loads, `EnsembleIngestionController` calls `trackMaterialProvider.clearAllTracks()` (cached color lists are keyed to the prior ensemble's genomic extent), flips `igvPanel.materialProvider` back to the color-ramp provider, and repaints. See PR #45 commits `75cd6d5` + `99a295d`.

---

## Exclusion Notes

- `materialProviderExclusionTrackTypes`: `['ruler', 'sequence', 'ideogram']` — these tracks do not get a checkbox.
- `canUseTrackForMaterial(track)`: Checks zoom level; if too zoomed out, checkbox is unchecked and track is not added.
