# M0 — Carve out the 3D viewer: tickets

> **STATUS: In progress.** The ticket list and implementation order for milestone M0.
> Overall plan: [milestones.md](milestones.md). Design: [`../spacewalk-mcp-viewer-carve-out.md`](../spacewalk-mcp-viewer-carve-out.md).
> Umbrella issue: **#104**. All tickets are labelled `ready-for-agent`; blocking edges are set as
> native GitHub issue dependencies.

## Goal

A page that is only the 3D viewer, whose bundle contains no `igv` and no `juicebox.js`, with the full
app working unchanged at every step. The first four tickets are prefactors in the full app; the rest
build the viewer page.

## Order

```
Wave 1 (parallel)     #105 material provider    #107 genome resolution    #108 delete Scale Bars
                          │                          │                          │
Wave 2                #106 IGV listens               │                          │
                          │                          │                          │
Wave 3                #109 one viewer assembly ◀─────┘                          │
                          │                                                     │
Wave 4                #110 viewer-only page                                     │
                          │                                                     │
Wave 5 (parallel)     #111 toolbar     #112 ☰ widget overlay     #113 ⚙ settings overlay ◀┘
```

Working alone, take them in number order: **105 → 106 → 107 → 108 → 109 → 110 → 111 → 112 → 113.**

## Tickets

| Order | Issue | Title | Blocked by | Status |
|---|---|---|---|---|
| 1 | #105 | Viewer owns the current material provider | — | ☐ |
| 2 | #106 | IGV follows ensemble loads as a listener | #105 | ☐ |
| 3 | #107 | Genome assembly resolved without IGVPanel | — | ☐ |
| 4 | #108 | Delete the Scale Bars | — | ☐ |
| 5 | #109 | Separate assembling the 3D viewer from assembling the app | #105, #106, #107 | ☐ |
| 6 | #110 | Viewer-only page loads an ensemble from a URL | #109 | ☐ |
| 7 | #111 | Viewer toolbar: trace select and reset camera | #110 | ☐ |
| 8 | #112 | Widget panel as an overlay from the floating ☰ | #110 | ☐ |
| 9 | #113 | Settings as a ⚙ overlay in the viewer | #108, #110 | ☐ |

### Prefactors (full app, no visible change)

- **#105 — Viewer owns the current material provider.** Visualizations, both highlighters and the
  genomic navigator stop reaching through `igvPanel.materialProvider` for color. The color-ramp
  material provider is the viewer's default; IGV's track checkboxes plug the track material provider
  in through the signal port. *The main knot — the rest of M0 depends on it.*
- **#106 — IGV follows ensemble loads as a listener.** Ingestion stops calling IGV. IGVPanel
  subscribes to `DidLoadEnsembleFile` and does its own genome swap, locus follow and checkbox reset.
- **#107 — Genome assembly resolved without IGVPanel.** The `.sw` datasource resolves the genome
  without `igvPanel.knownGenomes`; same results, including the hg19 fallback and the woolly-mammoth
  workaround. Unit-tested.
- **#108 — Delete the Scale Bars.** Gone from the scene and the settings panel; Reference Ruler
  untouched; old settings and sessions still load.

### The seam

- **#109 — Separate assembling the 3D viewer from assembling the app.** One routine builds the
  viewer with no IGV or Juicebox imports; the full app calls it, then attaches its panels. Update the
  wiring diagram in `architecture/`.

### The viewer page

- **#110 — Viewer-only page loads an ensemble from a URL.** New entry point; fills the window; loads
  the `.sw` named in a URL parameter; navigator and ball-picker highlighting work; the build shows no
  `igv`/`juicebox.js` in the bundle.
- **#111 — Viewer toolbar.** The gray bar becomes `[− trace +] … [⚙] [⌂]` (☰ stays floating over the canvas); trace select steps
  through traces; ⌂ resets the camera; usable at ~400px wide. Checked by eye.
- **#112 — ☰ widget overlay.** Today's widget panel, reparented into the viewer as an overlay,
  closed by default. Checked by eye.
- **#113 — ⚙ settings overlay.** Background, axes, ground plane, reference ruler as an overlay, no
  Scale Bars row. Checked by eye.

## Verification at each step

- `npm run build` passes; `npm test` passes.
- After every prefactor (#105–#109): run the full app and check loading, both render styles plus a
  point-cloud ensemble, highlighting from all four producers, IGV track coloring, live
  contact/distance maps, and session save/restore.
- From #110 on: also check the viewer-only page with the Load From List R2 fixtures, and inspect the
  page's bundle for `igv` and `juicebox.js`.

## Done

M0 is done when every ticket above is closed and the "Done when" in [milestones.md](milestones.md)
holds. Then: mark M0 done in `milestones.md`, set this document's status to **Done**, and start the
M1 ticket document.
