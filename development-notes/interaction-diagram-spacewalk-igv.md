# Spacewalk ↔ IGV.js Interaction Diagrams

Interaction flows for the track material provider (checkbox) and cursor guide features. Spacewalk embeds IGV.js and coordinates via its public API; no IGV modifications required.

---

## 1. Track Material Provider — Architecture

Spacewalk injects checkboxes into IGV's axis column via a shim. When IGV rebuilds (loadSession, track reorder), the DOM is torn down—Spacewalk re-injects on those events.

```mermaid
%%{init: {'themeVariables': {'fontSize': '18px', 'fontFamily': 'arial'}, 'flowchart': {'nodeSpacing': 60, 'rankSpacing': 50}}}}%%
flowchart TB
    subgraph Spacewalk["Spacewalk"]
        IGVPanel[IGVPanel]
        Shim[igvTrackMaterialProviderShim]
        TMP[TrackMaterialProvider]
        SetMP[setMaterialProvider]
        VIZ[3D Viz: Ribbon / BallAndStick / PointCloud]

        IGVPanel -->|installShim| Shim
        Shim -->|injectCheckboxes| Axis
        Shim -->|on trackorderchanged| Axis
        IGVPanel -->|activateTrackMaterialProvider| TMP
        IGVPanel -->|deactivateTrackMaterialProvider| TMP
        IGVPanel -->|setMaterialProvider| SetMP
        SetMP -->|updateMaterialProvider| VIZ
        VIZ -->|colorForInterpolant| TMP
    end

    subgraph IGVJS["IGV.js — Unmodified"]
        Axis[trackView.axis per track]
        Browser[Browser]
    end

    User[User checks checkbox] --> Axis
    Shim -->|appendChild checkbox| Axis
    Axis -->|change event| IGVPanel
    Browser -->|trackorderchanged| Shim
    Browser -->|loadSession| IGVPanel
    Browser -->|trackremoved| IGVPanel
```

### Key Points

| Aspect | Detail |
|--------|--------|
| **Injection point** | `trackView.axis` (axis column per track) |
| **Re-injection triggers** | After `createBrowser`, after `loadSession`, on `trackorderchanged` |
| **State persistence** | `track.embeddingCheckboxChecked` for session restore |
| **Excluded track types** | ruler, sequence, ideogram |

---

## 2. Cursor Guide — Architecture

Bidirectional sync: IGV mouse position → 3D scene, and 3D scene hover → IGV cursor position. Spacewalk configures handlers and re-applies visibility after IGV rebuilds.

```mermaid
%%{init: {'themeVariables': {'fontSize': '18px', 'fontFamily': 'arial'}, 'flowchart': {'nodeSpacing': 60, 'rankSpacing': 50}}}}%%
flowchart TB
    subgraph Spacewalk["Spacewalk"]
        IGVPanel[IGVPanel]
        Bus[SpacewalkEventBus]
        GN[GenomicNavigator]

        IGVPanel -->|setCustomCursorGuideMouseHandler| CG
        IGVPanel -->|post DidUpdateGenomicInterpolant| Bus
        Bus -->|receiveEvent| GN
        GN -->|post DidUpdateGenomicInterpolant| Bus
        Bus -->|receiveEvent| IGVPanel
        IGVPanel -->|updateWithInterpolant| CG
    end

    subgraph IGV["IGV.js — Unmodified"]
        CG[CursorGuide]
        RVP[RulerViewport]
        Axis[columnContainer]

        CG -->|mousemove| Axis
        CG -->|mouseMove event| RVP
        RVP -->|start, bp, end| CG
        CG -->|customMouseHandler| IGVPanel
    end

    User[User mouses over IGV] --> Axis
    User2[User hovers 3D scene] --> GN
```

### Key Points

| Aspect | Detail |
|--------|--------|
| **IGV → Spacewalk** | `setCustomCursorGuideMouseHandler` callback receives `{ start, bp, end, interpolant }` |
| **Spacewalk → IGV** | `cursorGuide.updateWithInterpolant(t)` (spacewalk branch only; guarded on master) |
| **Re-apply triggers** | After `createBrowser`, after `loadSession` (in `configureMouseHandlers`) |
| **Master workaround** | `doShowCursorGuide = true` so `rulerViewport.mouseMove` returns a value |

---

## 3. Combined Architecture — Both Features

```mermaid
%%{init: {'themeVariables': {'fontSize': '18px', 'fontFamily': 'arial'}, 'flowchart': {'nodeSpacing': 60, 'rankSpacing': 50}}}}%%
flowchart TB
    subgraph Spacewalk["Spacewalk"]
        IGVPanel[IGVPanel]
        Shim[igvTrackMaterialProviderShim]
        TMP[TrackMaterialProvider]
        Bus[SpacewalkEventBus]
        GN[GenomicNavigator]
    end

    subgraph IGV["IGV.js"]
        Browser[Browser]
        CG[CursorGuide]
        Axis[trackView.axis]
    end

    IGVPanel -->|createBrowser| Browser
    IGVPanel -->|installShim| Shim
    Shim -->|appendChild checkbox| Axis
    IGVPanel -->|setCustomCursorGuideMouseHandler| CG
    IGVPanel -->|setCursorGuideVisibility| CG

    Browser -->|trackorderchanged| Shim
    Browser -->|loadSession| IGVPanel
    IGVPanel -->|configureMouseHandlers| CG
    IGVPanel -->|configureMouseHandlers| Shim

    CG -->|customMouseHandler| IGVPanel
    IGVPanel -->|activateTrackMaterialProvider| TMP
    IGVPanel -->|post DidUpdateGenomicInterpolant| Bus
    Bus --> GN
    GN -->|post DidUpdateGenomicInterpolant| Bus
    Bus --> IGVPanel
    IGVPanel -->|updateWithInterpolant| CG
```

---

## 4. Sequence Diagrams (Reference)

### Track Material Provider — Sequence

```mermaid
%%{init: {'themeVariables': {'fontSize': '16px'}}}%%
sequenceDiagram
    autonumber
    participant User
    participant Shim as igvTrackMaterialProviderShim
    participant IGVPanel as IGVPanel
    participant TMP as TrackMaterialProvider

    User->>Shim: check checkbox
    Shim->>IGVPanel: activateTrackMaterialProvider(track)
    IGVPanel->>TMP: configure(track)
    IGVPanel->>IGVPanel: setMaterialProvider(trackMaterialProvider)
```

### Cursor Guide — Sequence (IGV → Spacewalk)

```mermaid
%%{init: {'themeVariables': {'fontSize': '16px'}}}%%
sequenceDiagram
    autonumber
    participant User
    participant CG as CursorGuide
    participant RVP as RulerViewport
    participant IGVPanel as IGVPanel
    participant Bus as SpacewalkEventBus

    User->>CG: mousemove over IGV
    CG->>RVP: mouseMove(event)
    RVP-->>CG: { start, bp, end }
    CG->>IGVPanel: customMouseHandler({ start, bp, end, interpolant })
    IGVPanel->>Bus: post DidUpdateGenomicInterpolant
```

### Cursor Guide — Sequence (Spacewalk → IGV)

```mermaid
%%{init: {'themeVariables': {'fontSize': '16px'}}}%%
sequenceDiagram
    autonumber
    participant User
    participant GN as GenomicNavigator
    participant Bus as SpacewalkEventBus
    participant IGVPanel as IGVPanel
    participant CG as CursorGuide

    User->>GN: hover 3D scene
    GN->>Bus: post DidUpdateGenomicInterpolant
    Bus->>IGVPanel: receiveEvent
    IGVPanel->>CG: updateWithInterpolant(interpolant)
    CG->>CG: verticalGuide.style.left = pixel
```
