# Development Notes

In-repo context for Spacewalk development. These notes are the durable
cross-session context channel for this project — read them before starting
work on the relevant subsystem.

Status tags:

- **Current** — describes how the code works today; safe to rely on
- **Reference** — background knowledge that doesn't go stale (concepts, theory, setup)
- **Historical** — describes work that has shipped or been abandoned; kept for context

Last groomed: 2026-05-27.

---

## Architecture & interaction diagrams

| Document | Status | When to read |
|---|---|---|
| [architecture-track-material-provider-checkbox.md](architecture-track-material-provider-checkbox.md) | Current | Before touching the IGV per-track checkbox that drives 3D coloring |
| [interaction-diagram-spacewalk-igv.md](interaction-diagram-spacewalk-igv.md) | Current | Before editing `IGVPanel.js` or anything in `js/widgets/trackWidgets.js` |
| [interaction-diagram-spacewalk-juicebox.md](interaction-diagram-spacewalk-juicebox.md) | Current | Before editing `js/juicebox/` — live contact/distance maps, hic-straw integration |
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
| [git-foo/](git-foo/) | Reference | Git worktree cheatsheets and release-branch publishing workflow |

## Archive

Shipped or abandoned work, kept for historical context:

- [archive/postmessage-plan.md](archive/postmessage-plan.md) — plan for cross-origin .sw ingestion via postMessage. **Shipped** in spacewalk#11 + swtool#5 (merged 2026-03-15).
- [archive/test.json](archive/test.json) — sample HPRC genome+track config used during postmessage testing.
