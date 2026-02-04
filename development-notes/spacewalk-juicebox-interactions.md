# Spacewalk-Juicebox Interaction Modes

This document captures all modes of interaction between Spacewalk and Juicebox.js.

## 1. Live Map Loading & Rendering

**Live Contact Maps**: Calculated from ensemble 3D structures, rendered to Juicebox canvas (`ctx_live`)
**Live Distance Maps**: Calculated from ensemble distances, rendered to Juicebox canvas (`ctx_live_distance`)

- Datasets are lazily loaded when users switch to live map tabs
- Live maps use Juicebox's color scale and rendering infrastructure
- Contact records update the LiveMapDataset when frequencies are calculated

## 2. Hi-C File Loading

Spacewalk loads Hi-C files into Juicebox via `loadHicFile()`. When loading, Spacewalk passes its ensemble locus as the initial view region to ensure synchronization.

## 3. Genome Synchronization

**Key difference from standalone Juicebox**: In Spacewalk, the ensemble has a genome (via IGV), but Juicebox may have a different genome or no genome. This creates a synchronization challenge that applies to both Hi-C maps and live maps.

**The problem:**
- Spacewalk's ensemble is loaded into IGV with a specific genome (e.g., hg38)
- Juicebox's `browser.genome` may be undefined until a Hi-C file is loaded
- Even if Juicebox has a genome, it may differ from IGV's genome (e.g., Hi-C file uses hg19, ensemble uses hg38)
- Spacewalk's locus is the single source of truth and must work regardless of genome differences

**Structural differences between Juicebox and IGV genomes:**

**Juicebox Genome structure** (genome.js):
- `chromosomes`: **Array** of chromosome objects
  - Each chromosome: `{ name, size, bpLength, index }`
  - Accessed via array index: `chromosomes[0]`, `chromosomes[1]`, etc.
  - Lookup via `chromosomeLookupTable` (object/map) for name-based access
- `id`: String genome identifier (e.g., "hg38", "hg19")
- Created from Hi-C file data: `new Genome(dataset.genomeId, dataset.chromosomes)`
- Hi-C files (via MPM/straw dependency) provide genome information embedded in the .hic file format

**IGV Genome structure**:
- `chromosomes`: **Map** (or Map-like structure) of chromosome objects
  - Accessed via `.values()`: `chromosomes.values()` returns iterator
  - Accessed via `.get(name)`: `chromosomes.get(chrName)` for name-based lookup
  - Each chromosome: `{ name, size, bpLength, index }` (similar structure)
- `id`: String genome identifier (e.g., "hg38", "hg19")
- Loaded from genome definition files (JSON configs in `src/resources/genomes.json`)
- Genome definitions include: `fastaURL`, `indexURL`, `cytobandURL`, `aliasURL`, etc.

**Key structural differences:**
1. **Storage**: Juicebox uses Array, IGV uses Map
2. **Access pattern**: Juicebox uses array indexing, IGV uses Map methods (`.values()`, `.get()`)
3. **Source**: Juicebox gets genome from .hic file (via MPM/straw dependency), IGV gets genome from JSON config files
4. **Conversion needed**: When creating live maps, Spacewalk converts IGV's Map to Array format:
   - `Array.from(igvPanel.browser.genome.chromosomes.values())` → converts Map to Array
   - Maps to format: `{ name, size, bpLength, index }`
   - Reorders to put "All" chromosome first (if exists)

**How Hi-C files provide genome information:**
- Hi-C files (.hic format) contain embedded genome information in their header
- Juicebox uses MPM/straw dependency to read .hic files
- When a .hic file is loaded, `hicFile.genomeId` and `hicFile.chromosomes` are extracted
- These are used to create Juicebox's `Genome` object: `new Genome(dataset.genomeId, dataset.chromosomes)`
- The genome ID may be recognized (e.g., "hg38", "hg19") or may need to be matched via `matchGenome()` function

**Conversion process (IGV → Juicebox format):**
When creating live maps, Spacewalk must convert IGV's genome structure to Juicebox's expected format:
1. Extract chromosomes from IGV's Map: `Array.from(igvPanel.browser.genome.chromosomes.values())`
2. Map each chromosome to Juicebox format: `{ name, size, bpLength, index }`
3. Handle "All" chromosome: Move to front if it exists, re-index all chromosomes
4. Find chromosome index for state: Convert array index (0-based) to Juicebox state format (1-based, where 0 = whole genome)
5. Create dataset config with converted chromosomes and IGV's genome ID

**Solution: Different genome sources for different map types**

**For Hi-C maps:**
1. **Spacewalk** (juiceboxPanel.js:437-455): `loadHicFile(url, name, mapType)`
   - Creates config with Spacewalk's locus: `config.locus = \`${chr}:${genomicStart}-${genomicEnd}\``
   - Calls `this.browser.loadHicFile(config)`

2. **Juicebox** (dataLoader.js:70-106): `loadHicFile(config)` processes Hi-C file:
   - Loads Hi-C dataset which contains its own genome information
   - Sets `this.browser.genome = new Genome(dataset.genomeId, dataset.chromosomes)` (dataLoader.js:99)
   - **Critical**: Juicebox's genome comes from the Hi-C file, not from IGV
   - If genome changes, triggers `notifyGenomeChange()` (dataLoader.js:103)
   - Applies Spacewalk's locus via `parseGotoInput(config.locus)` (dataLoader.js:112)

3. **Result**: Hi-C map uses its own genome (from the .hic file), but Spacewalk's locus is applied to ensure synchronization

**For live maps:**
1. **Spacewalk** (juiceboxPanel.js:467): `loadLiveMapDataset()` is called
   - Gets `chr` from `ensembleManager.locus` (Spacewalk's single source of truth)
   - Calls `igvPanel.browser.genome.getChromosome(chr)` (juiceboxPanel.js:483)
   - **Critical**: Uses IGV's genome, not `this.browser.genome`

2. **Spacewalk** (juiceboxPanel.js:491-496): Converts IGV genome chromosomes to dataset format:
   - `Array.from(igvPanel.browser.genome.chromosomes.values())` → gets all chromosomes from IGV's genome
   - Maps to format: `{ name, size, bpLength, index }`

3. **Spacewalk** (juiceboxPanel.js:517-524): Creates LiveMapDataset config:
   - `genomeId: igvPanel.browser.genome.id` → **Critical**: Uses IGV's genome ID
   - `chromosomes: chromosomes` → chromosome list from IGV's genome

4. **Spacewalk** (juiceboxPanel.js:546-549): Calls `this.browser.loadLiveMapDataset({ datasetConfig, state: stateConfig })`
   - Passes dataset with IGV's genome information

5. **Juicebox**: `loadLiveMapDataset()` creates dataset with IGV's genome
   - **Note**: Juicebox's `browser.genome` may still be undefined or different from IGV's genome

6. **Spacewalk** (juiceboxPanel.js:570-572): After dataset loads, applies Spacewalk's locus:
   - `browser.parseGotoInput(\`${chr}:${genomicStart}-${genomicEnd}\`)` 
   - **Critical**: Uses Spacewalk's locus (single source of truth)

**Key points:**
- **Hi-C maps**: Use genome from the .hic file (may differ from IGV's genome)
- **Live maps**: Use IGV's genome (matches the ensemble)
- **Spacewalk's locus**: Applied to both map types, ensuring synchronization regardless of genome differences
- **Juicebox's `browser.genome`**: May be undefined or different from IGV's genome, but this doesn't prevent map loading
- This differs from standalone Juicebox where the dataset's genome and browser's genome are always the same

## 4. Locus Synchronization (Uni-directional)

**Spacewalk → Juicebox** (Single direction):
- Spacewalk's ensemble locus is the single source of truth
- Applied when: ensemble loads, session loads, Hi-C files load, live maps render
- Juicebox never updates Spacewalk's locus

**Complete method call sequence when Spacewalk updates Juicebox's locus:**

1. **Spacewalk** (juiceboxPanel.js:132): `this.browser.parseGotoInput(locusString)`

2. **hicBrowser** (hicBrowser.js:665-666): `parseGotoInput(input)` → delegates to `this.interactions.parseGotoInput(input)`

3. **interactionHandler** (interactionHandler.js:518-538): `parseGotoInput(input)` 
   - Parses locus string
   - Calls `goto(xLocus.chr, xLocus.start, xLocus.end, yLocus.chr, yLocus.start, yLocus.end)`

4. **interactionHandler** (interactionHandler.js:111-123): `goto(chr1, bpX, bpXMax, chr2, bpY, bpYMax)`
   - Calls `browser.state.updateWithLoci()` to update state
   - Calls `_applyStateChange({ resolutionChanged, chrChanged, clearCaches: true })`

5. **interactionHandler** (interactionHandler.js:80-98): `_applyStateChange(options)`
   - Updates browser view if needed
   - Calls `browser.update()` to render
   - Calls `browser.notifyLocusChange(eventData)`

6. **hicBrowser** (hicBrowser.js:377-378): `notifyLocusChange(eventData)` → calls `this.coordinator.onLocusChange(eventData)`

7. **browserCoordinator** (browserCoordinator.js:191-234): `onLocusChange(eventData)`
   - Updates internal Juicebox components (chromosome selector, scrollbar, resolution selector, locus goto widget)
   - Calls all external callbacks: `for (const callback of this.externalCallbacks.onLocusChange) { callback(...) }`
   - **Note**: Spacewalk does not register an `onLocusChange` callback because it's unnecessary - Spacewalk controls all locus changes, so no callback is needed to detect or correct drift

**Implementation note**:
- Re-applying the locus multiple times is harmless and ensures synchronization
- The `_isApplyingSpacewalkLocus` flag exists as defensive code to prevent theoretical infinite loops, but may be unnecessary since re-applying the same locus should eventually stabilize

## 5. Session Management

- **Saving**: Juicebox session state saved (only if Hi-C dataset loaded, not live maps)
- **Loading**: Juicebox sessions restored, then Spacewalk's locus overrides any session-derived locus

## 6. Mouse/Crosshairs Interaction

- Custom crosshairs handler sends mouse position data to Spacewalk
- Triggers `DidUpdateGenomicInterpolant` events for 3D navigation
- Juicebox's `DidHideCrosshairs` events subscribed by Spacewalk components (ribbon, ballAndStick, genomicNavigator)

## 7. Tab Management

Three tabs: Hi-C Map, Live Contact Map, Live Distance Map
- Tab switching triggers dataset switching (`setActiveDataset`)
- Each tab shows/hides different canvas containers
- Hi-C tab restores `hicDataset/hicState`, Live tabs restore `liveMapDataset/liveMapState`

## 8. Dataset State Management

JuiceboxPanel maintains references:
- `hicDataset` / `hicState` (for Hi-C maps)
- `liveMapDataset` / `liveMapState` (for live maps)

Switching tabs restores the appropriate dataset/state pair.

## 9. Color Scale Changes

`colorPickerHandler()` re-renders live maps when Juicebox color scales change. Live maps use Juicebox's color scale for rendering.

## 10. Canvas Context Management

- Spacewalk injects live map canvas containers into Juicebox's viewport
- Creates `ctx_live` and `ctx_live_distance` bitmaprenderer contexts
- Canvas sizes synchronized with viewport dimensions

## 11. Coordinator Callbacks

- **`onMapLoaded`**: Triggered when maps load; handles tab assessment and repainting
- **`onLocusChange`**: Spacewalk does not register this callback - it's unnecessary since Spacewalk controls all locus changes and Juicebox is slaved to Spacewalk

## 12. Live Map Dataset Updates

When contact frequencies are calculated, they update the LiveMapDataset's contact records via `updateContactRecords()` to keep the dataset in sync.

## 13. Ensemble Lifecycle Events

On `DidLoadEnsembleFile`:
- Clears all canvases (Hi-C, live contact, live distance)
- Resets live map data
- Applies Spacewalk's locus
- Prepares panel for new maps (pre-selects Hi-C Map tab)

## 14. Panel Visibility/Mouse Events

Mouse enter/leave events on Juicebox panel trigger `DidEnterGenomicNavigator` / `DidLeaveGenomicNavigator` events for Spacewalk's 3D scene interaction.
