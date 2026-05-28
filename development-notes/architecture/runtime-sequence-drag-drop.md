# Runtime sequence — user drops a `.sw` file

A representative end-to-end flow chosen because it exercises most of the wired graph: data loading, scene rebuild, IGV cursor sync, event-bus fan-out. Companion to [`wiring-diagram.md`](./wiring-diagram.md), which shows how these objects were assembled.

**Conventions:**
- Solid arrows are direct method calls.
- Dashed arrows are returns.
- `Bus` is the global `SpacewalkEventBus` — broadcast messages are shown as arrows to it.

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant App
    participant EIC as EnsembleIngestionController
    participant EM as EnsembleManager
    participant SWB as SWBDatasource
    participant SM as SceneManager
    participant BAS as BallAndStick
    participant TMP as TrackMaterialProvider
    participant IGV as IGVPanel
    participant GN as GenomicNavigator
    participant Bus as SpacewalkEventBus

    User->>App: drop file.sw on canvas
    App->>EIC: ingestEnsemblePath(file, '0', undef)

    EIC->>EM: loadURL(file, traceKey, groupKey)
    EM->>SWB: new SWBDatasource({igvPanel})
    Note over EM,SWB: igvPanel forwarded from<br/>EnsembleManager.wireDependencies
    EM->>SWB: load(path)
    SWB-->>EM: {sample, genomeAssembly}
    EM-->>EIC: done

    EIC->>SM: setupWithTrace(currentTrace)
    SM->>SM: purgeScene() — dispose prior geometry
    SM->>BAS: new BallAndStick({ensembleManager,<br/>igvPanel, sceneManager, ...})
    SM->>BAS: addToScene(this.scene)
    SM->>SM: cameraLightingRig.configure(...)
    SM->>SM: sceneFixtures.setupForBounds(...)

    EIC->>SM: configureRenderStyle(ballStick | pointCloud)

    EIC->>TMP: clearAllTracks()
    Note right of TMP: drop stale per-track color lists<br/>(keyed to prior ensemble's extent)

    EIC->>IGV: unsetDataMaterialProviderCheckbox()
    EIC->>IGV: materialProvider = colorRamp
    Note right of IGV: flip eagerly so the<br/>repaint below is safe

    EIC->>SM: updateMaterialProvider(colorRamp)
    SM->>BAS: updateMaterialProvider(colorRamp)
    EIC->>GN: repaint()
    GN->>IGV: read materialProvider.colorForInterpolant(...)
    GN-->>EIC: done

    alt genome assembly changed
        EIC->>IGV: browser.loadGenome(newAssembly)
    end
    EIC->>IGV: locusDidChange(ensembleManager.locus)
    EIC-->>App: done

    App->>EM: createEventBusPayload()
    EM-->>App: payload
    App->>Bus: post DidLoadEnsembleFile
    Bus-->>GN: receiveEvent
    Bus-->>SM: (no-op — SceneManager doesn't subscribe to this)
    Bus-->>IGV: (panel subscribers update header/locus UI)
```

## What this sequence is saying

- **The orchestrator stays thin.** `App` only routes the drop event to `EnsembleIngestionController` and posts the final event — it does not micromanage the loaders, scene, or panels.
- **Ingestion is a single coordinator.** `EnsembleIngestionController` (extracted from `SceneManager` in Phase 3a) owns the cross-cutting "load + rebuild + sync UI" choreography. Before extraction, this logic was scattered across `SceneManager` and made it the largest file in the repo.
- **Material-provider flip is eager, not event-driven.** Step 13 (`igvPanel.materialProvider = colorRamp`) used to happen via the `DidLoadEnsembleFile` event handler in `GenomicNavigator`, which fires *after* this method returns — but step 16 (`GN.repaint`) needs the flip to have happened, so we do it eagerly. This is one of the fixes from PR #45 and the comment is in the code.
- **Datasource is per-file.** `SWBDatasource` is constructed fresh on every load (step 4), not held as a singleton. `EnsembleManager` forwards `igvPanel` to each new instance via the late-bound wiring shown in the wiring diagram.

## What this sequence is **not**

- Not exhaustive — render-loop frames, IGV's internal track loads, and Juicebox locus sync are out of scope.
- Not the error path — `try/catch/finally` around `purgeScene()` and `isLoading` flag toggling is in the code but omitted for clarity.
- Not the session-load path — `SessionService.loadSession()` is a different sequence (orchestrates `EIC` + `juiceboxPanel.loadSession` + `loadIGVSession`).

## Where this flow can be invoked

The same `EIC.ingestEnsemblePath(...)` call is the entry point for **four** user actions:
1. Drag-and-drop (this diagram)
2. URL param `?file=...` (`App.consumeURLParams`)
3. `swtool` postMessage (`App.initializePostMessageListener`)
4. File-load modal selections (`spacewalkFileLoadWidgetServices` via the `fileLoader.load` callback wired in `UIBootstrapper`)

That single entry point is the post-Phase-3 payoff — before DI, each of those paths read singletons differently and the variations were hard to keep in sync.
