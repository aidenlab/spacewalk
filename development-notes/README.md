# Development Notes

In-repo context for Spacewalk development. These notes are the durable
cross-session context channel for this project — read them before starting
work on the relevant subsystem.

Status tags:

- **Current** — describes how the code works today; safe to rely on
- **Reference** — background knowledge that doesn't go stale (concepts, theory, setup)
- **Historical** — describes work that has shipped or been abandoned; kept for context

Last groomed: 2026-06 (post Phase 3 DI completion).

---

## Architecture & interaction diagrams

| Document | Status | When to read |
|---|---|---|
| [architecture/wiring-diagram.md](architecture/wiring-diagram.md) | Current | First read for new contributors — shows how `App` assembles every module and where each dep comes from (post-Phase-3 DI) |
| [architecture/runtime-sequence-drag-drop.md](architecture/runtime-sequence-drag-drop.md) | Current | Companion to the wiring diagram — end-to-end "user drops a `.sw` file" trace through the wired graph |
| [architecture-track-material-provider-checkbox.md](architecture-track-material-provider-checkbox.md) | Current | Before touching the IGV per-track checkbox that drives 3D coloring |
| [refactor-igvpanel-material-provider-registry.md](refactor-igvpanel-material-provider-registry.md) | Proposal | RFC to extract the track→material-provider state machine out of `IGVPanel` into a testable registry (tech-debt item #5, candidate 1) |
| [interaction-diagram-spacewalk-igv.md](interaction-diagram-spacewalk-igv.md) | Current | Before editing `IGVPanel.js` or anything in `js/widgets/trackWidgets.js` |
| [interaction-diagram-spacewalk-juicebox.md](interaction-diagram-spacewalk-juicebox.md) | Current | Before editing `js/juicebox/` — live contact/distance maps, hic-straw integration |
| [refactor-juiceboxpanel-live-map-view.md](refactor-juiceboxpanel-live-map-view.md) | Proposal | RFC to extract the live-map render surface out of `JuiceboxPanel` into a `LiveMapView` and break the panel↔service cycle (tech-debt item #5, candidate 2) |
| [refactor-event-bus-usage.md](refactor-event-bus-usage.md) | Historical | RFC (complete) — cleaned up global event-bus usage: deleted the dead second bus + unused machinery, gave `DidLoadEnsembleFile` a single source, demoted point-to-point "events" to calls (Phases 0–2, #62–#64), and dissolved `DidEnter/LeaveGenomicNavigator` (Phase 3, via the highlighting redesign) |
| [highlighting-participant-map.md](highlighting-participant-map.md) | Current | **Read first for anything highlighting.** The map of the shipped design — two surfaces (navigator strip + 3D structure), four producers (navigator / IGV / Juicebox / 3D picker), the unified spine (one state → one reconciler → one renderer per surface), per-input walkthroughs, and the clear paths |
| [refactor-highlighting-redesign.md](refactor-highlighting-redesign.md) | Historical | RFC (complete, PRs #65/#66/#68 + final) — rebuilt highlighting as "one state, many writers, one renderer," fixing the point-cloud-from-navigator bug class and subsuming event-bus Phase 3. The plan/rationale; for current behavior see the participant map above |
| [refactor-continuous-genomic-locator.md](refactor-continuous-genomic-locator.md) | Historical | RFC (complete, PR #70) — made the ribbon bead a *continuous* locator (glides along the curve) while the highlight stays quantized to the discrete window. The conceit: navigation is continuous, the data is discrete, the index is a projection of the continuous coordinate. For current behavior see the participant map above |
| [refactor-reference-ruler.md](refactor-reference-ruler.md) | Proposal | RFC to extract the Reference Ruler out of `ScaleBarService` into its own widget, move it to bottom-right, and make it draggable with a persisted corner anchor. Read before touching `scaleBarService.js` — it explains why the two widgets in that file are unrelated, and why the Scale Bars are slated for deletion |
| [threejs/spacewalk-color-management-audit.md](threejs/spacewalk-color-management-audit.md) | Current | When working on color rendering across the Three.js pipeline |
| [threejs/threejs-transparency-notes.md](threejs/threejs-transparency-notes.md) | Reference | When debugging transparency / depth-sort issues in Three.js |

## Color & visualization

| Document | Status | When to read |
|---|---|---|
| [linear-color-space-for-data-visualization.md](linear-color-space-for-data-visualization.md) | Reference | Before any data → color mapping work (interpolation, blending, ImageData) |
| [heat-map-color-scaling-guide.md](heat-map-color-scaling-guide.md) | Reference | Designing or tuning heat-map color scaling (normalization, transforms) |
| [color-picker-notes/](color-picker-notes/) | Reference | Shared color picker design — diagrams and the apple-crayon palette |

## Build, deploy, dev workflow

| Document | Status | When to read |
|---|---|---|
| [local-hic-straw-dev.md](local-hic-straw-dev.md) | Current | When iterating on hic-straw locally and testing in Spacewalk |
| [testing-npm-dependencies.md](testing-npm-dependencies.md) | Reference | Generic guide to testing an npm dep locally inside a consuming project |
| [url-shortener-setup.md](url-shortener-setup.md) | Reference | Configuring the `t.3dg.io` TinyURL domain across environments |
| [remote-sw-hosting.md](remote-sw-hosting.md) | Current | Before adding any remote `.sw` URL (Load From List, session JSONs, demos) — why the host matters for HDF5 range reads, the jsDelivr-compression trap, and the raw.githubusercontent / S3 / R2 decisions |
| [git-foo/](git-foo/) | Reference | Git worktree cheatsheets and release-branch publishing workflow |

## Archive

Shipped or abandoned work, kept for historical context:

- [archive/postmessage-plan.md](archive/postmessage-plan.md) — plan for cross-origin .sw ingestion via postMessage. **Shipped** in spacewalk#11 + swtool#5 (merged 2026-03-15).
- [archive/test.json](archive/test.json) — sample HPRC genome+track config used during postmessage testing.
