# Wiring Diagram — App construction & dependency injection

How the `App` class assembles the running system and hands dependencies to each module. This is the diagram that tells the post-Phase-3 story: every dependency is explicit; nothing reaches into `app.js` to grab a singleton.

**Conventions:**
- **Solid arrow (`-->`)** — constructor injection (dep passed via `new X({...})`)
- **Dashed arrow (`-.->`)** — late-bound dependency via `wireDependencies({...})` setter
- **Dotted arrow (`..>`)** — lazy getter thunk (dep resolved at user-event time, not at wire time)

Modules are grouped by lifecycle stage. `App.initialize()` walks them in order top → bottom; each stage's modules can only depend on what's already been built.

```mermaid
flowchart TD
    classDef stage fill:#f5f5f5,stroke:#999,color:#333,font-weight:bold
    classDef core fill:#e8f0fe,stroke:#4a7fc1,color:#1a1a1a
    classDef threejs fill:#e8f5e9,stroke:#5ca35c,color:#1a1a1a
    classDef ui fill:#fff4e5,stroke:#d49a3c,color:#1a1a1a
    classDef panel fill:#fce4ec,stroke:#b85a8a,color:#1a1a1a
    classDef service fill:#f3e5f5,stroke:#9c5cb5,color:#1a1a1a
    classDef datasource fill:#e0f7fa,stroke:#3a98a8,color:#1a1a1a

    App((App)):::stage

    %% Stage 1 — Core managers (initializeCoreManagers)
    subgraph S1[Stage 1 — Core managers]
        EM[EnsembleManager]:::core
        CMM[ColorMapManager]:::core
        TMP[TrackMaterialProvider]:::core
        CRMP[ColorRampMaterialProvider]:::core
    end

    %% Stage 2 — Three.js objects (ThreeJSInitializer)
    subgraph S2["Stage 2 — Three.js (ThreeJSInitializer)"]
        Scene[scene]:::threejs
        Cam[camera]:::threejs
        Renderer[renderer]:::threejs
        Picker[Picker]:::threejs
        CLR[CameraLightingRig]:::threejs
        SF[SceneFixtures]:::threejs
        SM[SceneManager]:::threejs
    end

    %% Stage 3 — UI (UIBootstrapper)
    subgraph S3[Stage 3 — UI]
        GUI[GUIManager]:::ui
        SBS[ScaleBarService]:::ui
        SettM[SettingsManager]:::ui
        Trace[TraceSelector]:::ui
        GN[GenomicNavigator]:::ui
    end

    %% Stage 4 — Panels & services (PanelInitializer)
    subgraph S4[Stage 4 — Panels & services]
        IGV[IGVPanel]:::panel
        JB[JuiceboxPanel]:::panel
        LDM[LiveDistanceMapService]:::service
        LCM[LiveContactMapService]:::service
    end

    %% Stage 5 — App-level glue (assignPanelObjects)
    subgraph S5[Stage 5 — App-level glue]
        EIC[EnsembleIngestionController]:::service
        SS[SessionService]:::service
    end

    %% Stage 6 — Datasource (constructed per file load by EnsembleManager)
    subgraph S6["Stage 6 — On file load"]
        SWB[SWBDatasource]:::datasource
    end

    %% Stage 1 wiring
    App --> EM
    App --> CMM
    App --> TMP
    App --> CRMP
    CMM --> CRMP
    EM --> TMP

    %% Stage 2 wiring (SceneManager built last in this stage)
    App --> Renderer
    App --> Scene
    App --> Cam
    App --> Picker
    App --> CLR
    App --> SF
    App --> SM
    CRMP --> SM
    EM --> SM
    Scene --> SM
    CLR --> SM
    SF --> SM

    %% Stage 3 wiring
    App --> GUI
    App --> SBS
    App --> SettM
    App --> Trace
    App --> GN
    SM --> GUI
    EM --> GUI
    CMM --> GUI
    EM --> Trace
    EM --> GN
    SM --> GN
    CRMP --> GN
    Scene --> SettM
    SBS --> SettM
    SF --> SettM

    %% Stage 4 wiring
    App --> IGV
    App --> JB
    App --> LDM
    App --> LCM
    CRMP --> IGV
    TMP --> IGV
    EM --> IGV
    GN --> IGV
    SM --> IGV
    EM --> JB
    SM --> JB
    GN --> JB
    JB --> LDM
    EM --> LCM
    JB --> LCM
    IGV --> LCM
    LDM --> LCM

    %% Stage 5 wiring
    App --> EIC
    App --> SS
    EM --> EIC
    SM --> EIC
    IGV --> EIC
    CRMP --> EIC
    GN --> EIC
    TMP --> EIC
    EM --> SS
    SM --> SS
    IGV --> SS
    JB --> SS
    TMP --> SS
    CLR --> SS
    EIC --> SS

    %% Late-bound (wireDependencies) — dashed
    IGV -.->|wireDependencies| SM
    GN -.->|wireDependencies| Picker
    Picker -.->|wireDependencies| Picker
    LCM -.->|wireDependencies| JB
    SF -.->|wireDependencies| CLR
    IGV -.->|wireDependencies| EM
    IGV -.->|wireDependencies| SM

    %% Stage 6 — SWBDatasource constructed inside EnsembleManager.loadURL
    EM ==>|new on file load| SWB
    IGV -.->|via EnsembleManager.wireDependencies| SWB

    %% Lazy-getter thunks — dotted
    SS ..>|via uiBootstrapper, shareWidgets| GN
    EIC ..>|via spacewalkFileLoadWidgetServices| EM
```

## What the diagram is saying

- **App is the only orchestrator.** Every module is owned and constructed by `App` (directly or via one of its three initializers: `ThreeJSInitializer`, `UIBootstrapper`, `PanelInitializer`).
- **Layered, not tangled.** Stages 1 → 5 are strictly ordered: each stage's modules can only receive deps from earlier stages.
- **Late-bound deps are explicit.** When a module is constructed before its dependency exists (`Picker` needs `genomicNavigator` which doesn't exist yet at Three.js init time), the dashed `wireDependencies` arrow shows that — not a hidden module import.
- **Lazy getters where callbacks outlive wiring.** `spacewalkFileLoadWidgetServices` and `shareWidgets` wire their modal handlers before `EnsembleIngestionController` exists, so they receive thunks that resolve at user-click time.

## What this diagram is **not**

- Not a class diagram — it does not enumerate methods or fields.
- Not a runtime call graph — see [`runtime-sequence-drag-drop.md`](./runtime-sequence-drag-drop.md) for the "user drops a `.sw` file" flow.
- Not exhaustive — minor utility imports (e.g. `colorUtils`, `mathUtils`) are pure functions and intentionally omitted.

## Updating this diagram

When you add a new module or rewire an existing one:
1. Find the stage it belongs to (or add one if a genuinely new layer).
2. Add the box + classify it (`core` / `threejs` / `ui` / `panel` / `service` / `datasource`).
3. Add solid arrows for constructor injection, dashed for `wireDependencies`, dotted for lazy thunks.
4. If you find yourself reaching for `import { foo } from './app.js'` to read shared state, **stop** — that pattern was removed in PRs #42–#45. Pass it through.
