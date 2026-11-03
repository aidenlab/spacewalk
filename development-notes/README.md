# Development Notes

In-repo context for Spacewalk development. These notes are the durable
cross-session context channel for this project — read them before starting
work on the relevant subsystem.

Status tags:

- **Current** — describes how the code works today; safe to rely on
- **Reference** — background knowledge that doesn't go stale (concepts, theory, setup)
- **Proposal** — an RFC that has not shipped yet
- **Historical** — shipped or abandoned work; doesn't describe current behavior

Once an RFC's work ships and a Current note or the code describes the result, the RFC
is deleted. Git history keeps it.

Last groomed: 2026-11-03. All shipped RFCs, finished milestone ticket lists and punch
lists, the archive, and generic git guides were removed.

---

## Architecture & interaction diagrams

| Document | Status | When to read |
|---|---|---|
| [architecture/wiring-diagram.md](architecture/wiring-diagram.md) | Current | First read for new contributors. Shows how `assembleViewer()` and `App` assemble every module and where each dependency comes from. |
| [architecture/runtime-sequence-drag-drop.md](architecture/runtime-sequence-drag-drop.md) | Current | Companion to the wiring diagram: the end-to-end trace of a user dropping a `.sw` file, through the wired graph. |
| [architecture-track-material-provider-checkbox.md](architecture-track-material-provider-checkbox.md) | Current | Before touching the IGV per-track checkbox that drives 3D coloring. Covers the shim, `MaterialProviderController` and the signal port. |
| [interaction-diagram-spacewalk-igv.md](interaction-diagram-spacewalk-igv.md) | Current | Before editing `src/IGVPanel.js` or the IGV side of anything. |
| [interaction-diagram-spacewalk-juicebox.md](interaction-diagram-spacewalk-juicebox.md) | Current | Before editing `src/juicebox/`: live contact and distance maps, hic-straw integration. |
| [highlighting-participant-map.md](highlighting-participant-map.md) | Current | **Read first for anything highlighting.** Two surfaces, four producers, one state → one reconciler → one renderer per surface, and the continuous genomic locator. |
| [instanced-stick-geometry.md](instanced-stick-geometry.md) | Current | Before touching stick geometry or either radius control in `ballAndStick.js`. |
| [threejs/spacewalk-color-management-audit.md](threejs/spacewalk-color-management-audit.md) | Current | Before adding any path by which a color enters the Three.js scene. Covers sRGB vs linear and the one conversion helper. |
| [threejs/threejs-transparency-notes.md](threejs/threejs-transparency-notes.md) | Reference | When debugging transparency or depth-sort issues in Three.js. |

## Spacewalk MCP (geenee)

| Document | Status | When to read |
|---|---|---|
| [spacewalk-mcp/milestones.md](spacewalk-mcp/milestones.md) | Current | **Start here for Spacewalk MCP work.** Milestones M0–M3 (done, with umbrella issues), the viewer's bundle boundary, and M4: the three ports and their open questions. Design decisions live in `spacewalk-mcp`'s `GLOSSARY.md` and `docs/adr/`. |
| [spacewalk-mcp/local-testing-cheat-sheet.md](spacewalk-mcp/local-testing-cheat-sheet.md) | Current | Before testing the viewer page against a Room on your own machine. |
| [spacewalk-mcp/session-format.md](spacewalk-mcp/session-format.md) | Current | Before writing or reading a Spacewalk session string anywhere. The `spacewalk-mcp` Worker reads and writes the same block. |

## Color & visualization

| Document | Status | When to read |
|---|---|---|
| [linear-color-space-for-data-visualization.md](linear-color-space-for-data-visualization.md) | Reference | Before any data → color mapping work (interpolation, blending, ImageData). |
| [heat-map-color-scaling-guide.md](heat-map-color-scaling-guide.md) | Reference | When designing or tuning heat-map color scaling (normalization, transforms). |
| [color-picker-notes/](color-picker-notes/) | Reference | Shared color picker design: diagrams and the Apple Crayon palette. |
| [color-ramps/](color-ramps/) | Reference | Static HTML swatches of sequential color ramps, for eyeballing candidate ramps. |

## Loading data, hosting, deploy, dev workflow

| Document | Status | When to read |
|---|---|---|
| [external-file-loading.md](external-file-loading.md) | Current | The `?file=` URL parameter and the `postMessage` protocol external tools (e.g. swtool) use to hand Spacewalk a file. The root README links here. |
| [remote-sw-hosting.md](remote-sw-hosting.md) | Current | Before adding any remote `.sw` URL (Load From List, session JSONs, demos). Why the host matters for HDF5 range reads, and the jsDelivr compression trap. |
| [cloudflare-storage/](cloudflare-storage/) | Current | The how-to for uploading `.sw` files to the R2 bucket, plus the Load From List JSON. |
| [encode-waf-dev-proxy.md](encode-waf-dev-proxy.md) | Current | When an ENCODE-hosted map fails in local development, or before touching the dev proxy in `vite.config.mjs` / `src/main.js`. |
| [url-shortener-setup.md](url-shortener-setup.md) | Reference | The Share modal's shortener: the `sw-shortlink` worker, its allow-list, deploy and cutover. |
| [local-hic-straw-dev.md](local-hic-straw-dev.md) | Current | When iterating on hic-straw locally and testing it in Spacewalk. |
| [testing-npm-dependencies.md](testing-npm-dependencies.md) | Reference | When testing an npm dependency locally inside a consuming project. Read it before **any** `github:#vX.Y.Z` pin bump: `npm install` can report success and leave the old version on disk. |
| [release-branch-publishing.md](release-branch-publishing.md) | Reference | When cutting a release: tag on `main`, merge to `release`, push to publish. |
