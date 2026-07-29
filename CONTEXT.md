# Spacewalk

Spacewalk visualizes the 3D structure of chromatin captured by super-resolution microscopy, alongside the 1D genomic tracks (IGV) and 2D contact maps (Juicebox) that describe the same locus.

This glossary is the project's canonical vocabulary. It defines *what terms mean*, not how anything works — for mechanism, see `development-notes/`.

## Language

### The data

**Ensemble**:
A collection of traces loaded from a single `.sw` file — the unit of "what is currently loaded."
_Avoid_: dataset (Juicebox uses `dataset` for a Hi-C map, which is a different thing)

**Ensemble group**:
A named subset within a `.sw` file; one group is current at a time, selected by its key.

**Trace**:
One measured 3D path through the genome — a single observation of the structure. An ensemble holds many.
_Avoid_: model, structure (the 3D structure is what gets *rendered*, not a trace)

**Genomic extent**:
One discrete genomic region of a trace, with a genomic span in base pairs and a slice of the ramp. The ordered list of them is the ensemble's spine; a position in that list is an **index**.
_Avoid_: bin (a Hi-C map concept), locus (that's the whole span)
_Accepted shorthand_: region, window

**Gap**:
A stretch of the genomic span with no genomic extent — data absent, or a defect deliberately ignored. Gaps exist only in base-pair space; the ramp is laid out by index, so every interpolant lands in a region. A **ball** is still drawn at a gap, undersized; a **stick** bridges straight across it.

**Locus**:
The genomic span the loaded ensemble covers, as a whole.

**`.sw`**:
The HDF5 file format Spacewalk reads. The only supported format.

### Coordinates

**Interpolant**:
A continuous coordinate in `[0,1]` along the ramp (equivalently, along the ribbon curve). The shared first language of every input: producers speak interpolants, and the discrete index is a *projection down* from one.

**Quantization**:
Deriving a discrete index from a continuous interpolant. The governing conceit of navigation in Spacewalk: **navigation is continuous, the data is discrete.**

### Rendering the structure

**Render style**:
Which of the three mutually exclusive ways the 3D structure is drawn: **ball-and-stick**, **ribbon**, or **point cloud**. Exactly one is active.
_Avoid_: mode, view type

**Visualization**:
The object that draws the 3D structure in one render style. The **active visualization** is the one for the current render style — the single place the render-style switch lives.
_Avoid_: viz (fine in conversation, not in identifiers or issue titles)

**Ball**:
The sphere drawn at one genomic extent's 3D location — a measured position. One per index, gaps included; a ball at a gap is drawn deliberately undersized, marking data that is absent rather than a location that was measured.

**Stick**:
The cylinder drawn between two consecutive *present* extents. A stick asserts connectivity along the molecule, not distance, and bridges gaps — it may span an absent extent, joining the two locations on either side. Sticks can be hidden without ceasing to exist.

**Radius step**:
Ball and stick radii are chosen from a fixed ladder of discrete values; the control moves an index along the ladder and the radius itself is never named by the user. The same conceit as **quantization** — continuous intent, discrete realization.

**Material provider**:
The source of color for the 3D structure: given an interpolant, it yields a color. The **color-ramp material provider** colors by genomic position; the **track material provider** colors by the data in one or more checked IGV tracks, blended.

### Highlighting

**Selection**:
The single shared highlight state — a list of `{ index, interpolant }` entries. Every input writes it; every surface renders it. One state, many writers, one renderer per surface.

**Surface**:
Something that reflects the selection. There are two: the **navigator strip** (the band on the color ramp) and the **3D structure**.

**Producer**:
An input that converts a pointer position into selection entries and writes them. There are four: the navigator ramp, the IGV pointer, the Juicebox crosshairs, and the 3D raycast picker.
_Avoid_: source, input (as nouns for this role)

**Driver / receiver**:
A participant that *writes* the selection is a driver; one that *reflects* it is a receiver. The relationship is deliberately asymmetric — the navigator is the only participant that is both.

**Highlight**:
What lights up at a discrete index — the strip band, the lit ball, the point-cloud subset. Always quantized to a whole genomic extent.

**Locator**:
A continuous position marker that tracks the raw pointer, not a discrete region: the ribbon **bead** and the IGV cursor guide line. Distinct from a highlight, and never called one — the bead glides where the highlight steps.

**Genomic navigator**:
The color-ramp strip that both drives highlighting (on hover) and renders it (as a band).
_Avoid_: color ramp (that's the gradient the navigator draws), ruler

### The 2D maps

**Hi-C map**:
A static, externally measured contact map, rendered by Juicebox's own tile pipeline.

**Live contact map**:
A contact map computed on demand from the loaded ensemble's traces, rendered by Spacewalk.

**Live distance map**:
A distance matrix computed on demand from the same traces, rendered by Spacewalk. Derived alongside the live contact map, never separately.

### Persistence

**Session**:
The restorable state of the app — loaded ensemble, render style, camera, tracks, checked material-provider tracks.
