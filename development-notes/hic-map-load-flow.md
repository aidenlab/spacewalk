# Hi-C Map Load Flow of Control

This document describes the sequence of function calls and events when loading a Hi-C map file.

## Entry Point: User Action

1. **User selects a Hi-C file** via one of these methods:
   - Local file input: `<input name="contact-map" type="file">` in `index.html`
   - Dropbox button
   - URL modal
   - ENCODE hosted map modal
   - Data modal (pre-configured maps)

## Initial Handler Setup

The file input handler is configured in:
- **`js/initializers/panelInitializer.js`** (line 67-80)
  - Calls `configureContactMapLoaders()` with `loadHandler: (path, name, mapType) => juiceboxPanel.loadHicFile(path)`
- **`js/widgets/contactMapLoad.js`** (line 40-48)
  - Sets up event listener: `localFileInput.addEventListener('change', async e => { ... await loadHandler(file, name, mapType) })`

## Main Flow Sequence

### 1. `juiceboxPanel.loadHicFile(url, name, mapType)` 
   **File**: `js/juicebox/juiceboxPanel.js` (line 380-409)
   
   - Creates config: `{ url, name, isControl }`
   - Calls `this.present()` to show the panel
   - **Calls**: `await this.browser.loadHicFile(config)` (line 391)
   - After loading, calls `await this.browser.parseGotoInput(...)` to navigate to current locus (line 404)

### 2. `browser.loadHicFile(config, noUpdates)`
   **File**: `juicebox.js/js/hicBrowser.js` (line 631-633)
   
   - Delegates to: `return this.dataLoader.loadHicFile(config, noUpdates)`

### 3. `dataLoader.loadHicFile(config, noUpdates)`
   **File**: `juicebox.js/js/dataLoader.js` (line 71-170)
   
   **Sequence of operations:**
   
   a. **Clear session** (line 77)
      - `this.browser.clearSession()`
   
   b. **Start spinner** (line 80)
      - `this.browser.contactMatrixView.startSpinner()`
   
   c. **Load dataset** (line 96)
      - `const dataset = await Dataset.loadDataset(Object.assign({alert: hicFileAlert}, config))`
      - This loads the .hic file and parses its structure
   
   d. **Set genome** (line 100)
      - `this.browser.genome = new Genome(dataset.genomeId, dataset.chromosomes)`
      - **EVENT FIRED**: If genome changed, posts `EventBus.globalBus.post(HICEvent("GenomeChange", this.browser.genome.id))` (line 103)
   
   e. **Create and set state** (lines 106-137)
      - Creates a `State` object (default, from config, or synced)
      - **Calls**: `this.browser.setActiveDataset(dataset, state)` (lines 109, 123, 130, 135)
      - **Calls**: `await this.browser.setState(state)` (lines 124, 136)
   
   f. **Notify map loaded** (line 139)
      - `this.browser.notifyMapLoaded(dataset, state, dataset.datasetType)`
   
   g. **Load normalization vector index** (lines 153-165)
      - Background loading of normalization vectors if available
   
   h. **Sync browsers** (line 167)
      - `syncBrowsers()` - synchronizes state across multiple browser instances

### 4. `browser.setActiveDataset(dataset, state)`
   **File**: `juicebox.js/js/hicBrowser.js` (line 489-491)
   
   - Delegates to: `this.stateManager.setActiveDataset(dataset, state)`
   
   **File**: `juicebox.js/js/stateManager.js` (line 53-58)
   - Sets `this.activeDataset = dataset`
   - Sets `this.activeState = state` (if provided)

### 5. `browser.setState(state)`
   **File**: `juicebox.js/js/hicBrowser.js` (line 782-792)
   
   - **Calls**: `await this.stateManager.setState(state)` (line 783)
   - **Calls**: `await this.update()` (line 790) - **This renders the map to canvas**
   - **Calls**: `this.notifyLocusChange(eventData)` (line 791)
   
   **File**: `juicebox.js/js/stateManager.js` (line 88-116)
   - Clones the state
   - Adjusts pixel size based on minimum requirements
   - Configures locus if not present
   - Returns `{ chrChanged, resolutionChanged }`

### 6. `browser.update()`
   **File**: `juicebox.js/js/hicBrowser.js` (line 800+)
   
   - Delegates to: `this.contactMatrixView.update()`
   
   **File**: `juicebox.js/js/contactMatrixView.js` (line 206+)
   - **Calls**: `await this.repaint()` (line ~210)
   - Clears the main canvas (`this.ctx.clearRect(...)`)
   - Renders tiles based on the active dataset to `this.ctx`
   - This is where the Hi-C map is actually painted to the canvas

### 7. `browser.notifyMapLoaded(dataset, state, datasetType)`
   **File**: `juicebox.js/js/hicBrowser.js` (line 368-370)
   
   - Delegates to: `this.notifications.notifyMapLoaded(dataset, state, datasetType)`
   
   **File**: `juicebox.js/js/notificationCoordinator.js` (line 142-155)
   
   **Updates UI components:**
   - `_initializeContactMatrixViewForMapLoad()` (line 145)
     - Enables mouse handlers if not already enabled
     - Clears image caches
   - `_updateChromosomeSelectorForMapLoad(dataset)` (line 146)
   - `_updateRulersForMapLoad(dataset)` (line 147)
   - `_updateNormalizationWidgetForMapLoad(data)` (line 148)
     - **Calls**: `normalizationWidget.receiveEvent({ type: "MapLoad", data })` (line 99)
   - `_updateResolutionSelectorForMapLoad()` (line 149)
   - `_updateColorScaleWidgetForMapLoad()` (line 150)
   - `_updateControlMapWidgetForMapLoad()` (line 151)
   
   **Note**: `contactMatrixView` is NOT notified via eventBus here. Instead, it's initialized directly via `_initializeContactMatrixViewForMapLoad()`. However, `contactMatrixView` subscribes to `MapLoad` events on the eventBus (line 77 of contactMatrixView.js), but these events are not posted via `eventBus.post()` in the current implementation.

### 8. `browser.notifyLocusChange(eventData)`
   **File**: `juicebox.js/js/hicBrowser.js` (line 376-378)
   
   - Delegates to: `this.notifications.notifyLocusChange(eventData)`
   
   **File**: `juicebox.js/js/notificationCoordinator.js` (line 242-254)
   
   **Updates UI components:**
   - `_updateChromosomeSelectorForLocusChange(state)` (line 248)
   - `_updateScrollbarForLocusChange(state)` (line 249)
     - **Calls**: `scrollbarWidget.receiveEvent({ type: "LocusChange", data: { state } })` (line 196)
   - `_updateResolutionSelectorForLocusChange(state, resolutionChanged, chrChanged)` (line 250)
   - `_updateLocusGotoForLocusChange(state)` (line 251)
     - **Calls**: `locusGoto.receiveEvent({ type: "LocusChange", data: { state } })` (line 229)

### 9. Spacewalk Event Subscription
   **File**: `js/juicebox/juiceboxPanel.js` (line 282-293)
   
   - `juiceboxPanel` subscribes to `MapLoad` events on `this.browser.eventBus`
   - **Handler**: When `MapLoad` event is received:
     - Calls `tabAssessment()` to manage tab visibility
     - If active dataset is NOT a live map, calls `contactMatrixView.update()` after 50ms delay
   
   **Note**: However, `MapLoad` events are NOT currently posted via `eventBus.post()` in the juicebox.js codebase. The subscription exists but may not be triggered unless events are posted elsewhere or this is legacy code.

### 10. `browser.parseGotoInput(locusString)`
   **File**: `js/juicebox/juiceboxPanel.js` (line 404)
   
   - Called after `loadHicFile()` completes
   - Navigates to the current genomic locus from `ensembleManager.locus`
   - **File**: `juicebox.js/js/hicBrowser.js` (line 660-662)
     - Delegates to: `return this.interactions.parseGotoInput(input)`
   - This may trigger another `setState()` call, which triggers `update()` and `notifyLocusChange()`

## Events Fired During Load

1. **`GenomeChange`** (if genome ID changed)
   - Posted via: `EventBus.globalBus.post(HICEvent("GenomeChange", this.browser.genome.id))`
   - Location: `juicebox.js/js/dataLoader.js` (line 103)

2. **`MapLoad`** (indirectly, via direct method calls)
   - Components receive via `receiveEvent({ type: "MapLoad", data })` calls
   - **NOT posted via eventBus.post()** in current implementation
   - Components that receive it:
     - `normalizationWidget` (via direct call in notificationCoordinator)
     - `contactMatrixView` (via direct initialization, not event)
     - Various widgets subscribe to it but may not receive it unless posted elsewhere

3. **`LocusChange`** (after state is set)
   - Posted via: `notifyLocusChange()` method (not eventBus.post)
   - Components receive via `receiveEvent({ type: "LocusChange", data: { state } })` calls
   - Components that receive it:
     - `chromosomeSelector`
     - `scrollbarWidget`
     - `resolutionSelector`
     - `locusGoto`
     - `contactMatrixView` (subscribes but may not receive if not posted)

## Key Canvas Operations

- **Main Hi-C Canvas**: `contactMatrixView.ctx` (CanvasRenderingContext2D)
  - Cleared in `contactMatrixView.repaint()` via `this.ctx.clearRect(0, 0, viewportWidth, viewportHeight)`
  - Rendered to in `contactMatrixView.repaint()` by painting tiles from the active dataset

- **Live Map Canvases**: `contactMatrixView.ctx_live` and `contactMatrixView.ctx_live_distance` (ImageBitmapRenderingContext)
  - These are NOT affected by Hi-C map loading
  - They are separate contexts for live map rendering

## Summary

The flow is:
1. User selects file → `loadHandler` → `juiceboxPanel.loadHicFile()`
2. `browser.loadHicFile()` → `dataLoader.loadHicFile()`
3. Load dataset → Set active dataset → Set state
4. `setState()` → `update()` → `repaint()` → **Canvas rendered**
5. `notifyMapLoaded()` → Update UI components
6. `notifyLocusChange()` → Update UI components for locus
7. `parseGotoInput()` → Navigate to locus (may trigger another update)

**Critical Point**: The main canvas (`ctx`) is cleared and repainted in `contactMatrixView.repaint()`, which is called from `contactMatrixView.update()`, which is called from `browser.setState()`. This happens **after** `setActiveDataset()` is called, so the active dataset determines what gets rendered.
