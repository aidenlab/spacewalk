# Wiring Diagram — App construction & dependency injection

How the running system is assembled and how dependencies reach each module. Assembly is in two halves (#109): `assembleViewer()` in `src/viewer.js` builds the 3D viewer, whole on its own and with no `igv` or `juicebox.js` import; `App` calls it, then builds the app chrome and attaches the companion panels (IGV, Juicebox) to the viewer through the ports. Every dependency is explicit; nothing reaches into `app.js` to grab a singleton.

> 📐 **Standalone SVG addendum:** [`wiring-diagram.svg`](./wiring-diagram.svg) — open in a browser or image viewer to pan/zoom at full resolution. The inline render below is the same diagram but constrained to the document's column width. Regenerate via `npx -y @mermaid-js/mermaid-cli -i development-notes/architecture/wiring-diagram.mmd -o development-notes/architecture/wiring-diagram.svg -b transparent` after editing [`wiring-diagram.mmd`](./wiring-diagram.mmd).

**Conventions:**
- **Solid arrow (`-->`)** — constructor injection (dep passed via `new X({...})`)
- **Dashed arrow (`-.->`)** — late-bound dependency via `wireDependencies({...})` setter
- **Thick arrow (`==>`)** — runtime/on-demand construction or lazy-getter resolution
- **Labelled arrow (`-- port -->`)** — a runtime call across a port (see `CONTEXT.md`, **Port**)

The arrow points *from supplier to consumer*: `EM --> SM` means "EnsembleManager is passed to SceneManager."

Modules are grouped by lifecycle stage. `App.initialize()` walks them in order top → bottom — stages 1–4 inside `assembleViewer()`, then 5–6 — and each stage's modules can only depend on what's already been built. The **Viewer** box is the carve-out boundary: nothing inside it depends on anything outside it.

```mermaid
flowchart TD
    classDef stage fill:#f5f5f5,stroke:#999,color:#333
    classDef core fill:#e8f0fe,stroke:#4a7fc1,color:#1a1a1a
    classDef threejs fill:#e8f5e9,stroke:#5ca35c,color:#1a1a1a
    classDef ui fill:#fff4e5,stroke:#d49a3c,color:#1a1a1a
    classDef panel fill:#fce4ec,stroke:#b85a8a,color:#1a1a1a
    classDef service fill:#f3e5f5,stroke:#9c5cb5,color:#1a1a1a
    classDef datasource fill:#e0f7fa,stroke:#3a98a8,color:#1a1a1a
    App((App)):::stage
    AV((assembleViewer)):::stage
    subgraph Viewer[Viewer - no igv, no juicebox.js]
        subgraph S1[Stage 1 - Core managers]
            EM[EnsembleManager]:::core
            CMM[ColorMapManager]:::core
            TMP[TrackMaterialProvider]:::core
            CRMP[ColorRampMaterialProvider]:::core
        end
        subgraph S2[Stage 2 - Three.js]
            Scene[scene]:::threejs
            Cam[camera]:::threejs
            Renderer[renderer]:::threejs
            Picker[Picker]:::threejs
            CLR[CameraLightingRig]:::threejs
            SF[SceneFixtures]:::threejs
            SM[SceneManager]:::threejs
        end
        subgraph S3[Stage 3 - Viewer UI]
            GUI[GUIManager]:::ui
            RR[ReferenceRuler]:::ui
            SettM[SettingsManager]:::ui
            Trace[TraceSelector]:::ui
            GN[GenomicNavigator]:::ui
        end
        subgraph S4[Stage 4 - Viewer glue]
            EIC[EnsembleIngestionController]:::service
        end
        subgraph S7[On file load]
            SWB[SWBDatasource]:::datasource
        end
    end
    subgraph S5[Stage 5 - Panels attached to the viewer]
        IGV[IGVPanel]:::panel
        JB[JuiceboxPanel]:::panel
        LDM[LiveDistanceMapService]:::service
        LCM[LiveContactMapService]:::service
    end
    subgraph S6[Stage 6 - App glue and chrome]
        SS[SessionService]:::service
        Chrome[UIBootstrapper - navbar, hand loading, sessions, share]:::ui
    end
    App --> AV
    AV --> EM
    AV --> CMM
    AV --> TMP
    AV --> CRMP
    CMM --> CRMP
    EM --> TMP
    AV --> Renderer
    AV --> Scene
    AV --> Cam
    AV --> Picker
    AV --> CLR
    AV --> SF
    AV --> SM
    CRMP --> SM
    EM --> SM
    Scene --> SM
    CLR --> SM
    SF --> SM
    AV --> GUI
    AV --> RR
    AV --> SettM
    AV --> Trace
    AV --> GN
    SM --> GUI
    EM --> GUI
    CMM --> GUI
    EM --> Trace
    EM --> GN
    SM --> GN
    Scene --> SettM
    RR --> SettM
    SF --> SettM
    AV --> EIC
    EM --> EIC
    SM --> EIC
    CRMP --> EIC
    GN --> EIC
    TMP --> EIC
    GN -.-> Picker
    SM -.-> Picker
    SF -.-> CLR
    GN -.-> SM
    EM ==> SWB
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
    LCM -.-> JB
    IGV -- signal port: setMaterialProvider --> SM
    App --> SS
    EM --> SS
    SM --> SS
    IGV --> SS
    JB --> SS
    TMP --> SS
    CLR --> SS
    EIC --> SS
    App --> Chrome
    SS ==> Chrome
    EIC ==> Chrome
```

**Edge legend recap:** dashed arrows into Picker (`GN -.-> Picker`, `SM -.-> Picker`) read as "Picker receives genomicNavigator and sceneManager via `picker.wireDependencies({...})`"; `GN -.-> SM` is `sceneManager.createHighlighters({...})`. The thick arrows into the app chrome denote that its file-load, session, and share widgets reach `EnsembleIngestionController` and `SessionService` through lazy-getter thunks, because they are wired before `SessionService` exists. The one labelled arrow is the signal port: IGV's `MaterialProviderController` plugs the active material provider into the viewer by calling `sceneManager.setMaterialProvider()`.

## What the diagram is saying

- **The viewer is whole on its own.** `assembleViewer()` builds scene, ensemble manager, ingestion, visualizations, navigator, picker, camera and lighting, and fixtures, and returns a `Viewer` that owns the render loop and resize handling. `src/viewer.test.js` walks its import graph and fails if `igv` or `juicebox.js` is reachable. A viewer-only page calls `assembleViewer()` and stops.
- **App attaches, it doesn't reach in.** The panels receive viewer parts by constructor injection and talk back through the ports; no arrow points from a panel into the Viewer box except the signal port.
- **Layered, not tangled.** Stages are strictly ordered: each stage's modules can only receive deps from earlier stages.
- **Late-bound deps are explicit.** When a module is constructed before its dependency exists (`Picker` needs `genomicNavigator`, which needs `SceneManager`), the dashed `wireDependencies` arrow shows that — not a hidden module import.
- **Lazy getters where callbacks outlive wiring.** `spacewalkFileLoadWidgetServices` and `shareWidgets` wire their modal handlers before `SessionService` exists, so they receive thunks that resolve at user-click time.

## What this diagram is **not**

- Not a class diagram — it does not enumerate methods or fields.
- Not a runtime call graph — see [`runtime-sequence-drag-drop.md`](./runtime-sequence-drag-drop.md) for the "user drops a `.sw` file" flow.
- Not exhaustive — minor utility imports (e.g. `colorUtils`, `mathUtils`) are pure functions and intentionally omitted.

## Updating this diagram

When you add a new module or rewire an existing one:
1. Decide which side of the carve-out it is on. If it is 3D and only 3D, it is built in `assembleViewer()` and must not import `igv` or `juicebox.js`; otherwise it belongs to `App`.
2. Find the stage it belongs to (or add one if a genuinely new layer).
3. Add the box + classify it (`core` / `threejs` / `ui` / `panel` / `service` / `datasource`).
4. Add solid arrows for constructor injection, dashed for `wireDependencies`, dotted for lazy thunks.
5. If you find yourself reaching for `import { foo } from './app.js'` to read shared state, **stop** — that pattern was removed in PRs #42–#45. Pass it through.
