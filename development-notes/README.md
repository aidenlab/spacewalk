# Development Notes

Notes, architecture docs, and planning documents for Spacewalk development.

---

## Where Planning Documents Are Kept

Planning and architecture documents live in two places:

### 1. This folder (`development-notes/`)

In-repo docs: architecture diagrams, interaction flows, setup guides.

| Document | Description |
|----------|-------------|
| `architecture-track-material-provider-checkbox.md` | Track material provider checkbox (Mermaid + ASCII diagrams) |
| `interaction-diagram-spacewalk-igv.md` | Spacewalk ↔ IGV.js: track material provider + cursor guide |
| `spacewalk-juicebox-interactions.md` | Spacewalk ↔ Juicebox interactions |
| `testing-npm-dependencies.md` | npm dependency testing |
| `url-shortener-setup.md` | URL shortener configuration |
| `heat-map-color-scaling-guide.md` | Heat map color scaling |
| `threejs-transparency-notes.md` | Three.js transparency notes |

### 2. Cursor plans (`~/.cursor/plans/`)

Cursor-generated implementation plans (e.g. from Agent mode). Examples:

- `track_material_provider_master_migration_94ceb237.plan.md`
- `embedding_checkbox_shim_d7698d73.plan.md`
- `spacewalk_igv_master_shim_3eede943.plan.md`

These are task-specific plans with checklists and implementation details.
