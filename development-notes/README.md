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
| [refactor-event-bus-usage.md](refactor-event-bus-usage.md) | Proposal | RFC to clean up global event-bus usage — delete the dead second bus + unused machinery, give `DidLoadEnsembleFile` a single source, demote point-to-point "events" back to calls (Phases 0–2 shipped #62–#64; Phase 3 rolled into the highlighting RFC below) |
| [highlighting-participant-map.md](highlighting-participant-map.md) | Current | The map of highlighting — the two surfaces (navigator strip + 3D structure), the four producers (navigator / IGV / Juicebox / 3D picker), the spine, per-input walkthroughs, and the clear-path matrix. Read first to understand the moving parts before the RFC below |
| [refactor-highlighting-redesign.md](refactor-highlighting-redesign.md) | Proposal | RFC to rebuild highlighting as "one state, many writers, one renderer" — fixes the point-cloud-from-navigator bug class and subsumes event-bus Phase 3. Read before touching `picker.js`, the `*Highlighter` classes, or any `delegate*`/`handleGenomicInterpolant` path |
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
