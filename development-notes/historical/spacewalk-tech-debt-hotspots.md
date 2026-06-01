# Spacewalk Tech Debt Hotspot Map

Date: 2026-05-27 (updated 2026-05-29)
Branch: `main`

## Methodology
Score = (Impact + Risk) × (6 − Effort). Impact/Risk on 1–5, Effort 1 (easy) to 5 (hard). All evidence pulled live from the repo.

## Top hotspots (ranked)

### 1. Zero automated tests — score 50 (I5 R5 E1→5)
**Category:** Test debt
**Evidence:** `find` for `*.test.js` / `*.spec.js` / `test/` dirs returned nothing; `package.json` has no `test` script. No CI workflows (`.github/workflows/` doesn't exist).
**Why it hurts:** Every refactor — including the jQuery removal you're tracking — is verified by hand. Regressions ship invisibly. AI-assisted changes have no safety net.
**Where to start:** Pick one pure-ish module (`src/utils/colorUtils.js`, `src/utils/mathUtils.js`, `src/utils/statisticsUtils.js`) and add Vitest. Then snapshot tests on `sessionServices` (round-trip session JSON).

### ~~2. Module-level singleton coupling via `app.js`~~ — **resolved (2026-05–06)**
Originally: `src/app.js` declared 17 module-level `let` bindings mirrored to `App.*` fields, and 18+ files imported those bindings instead of receiving dependencies. Resolved in four PRs (one consumer per commit, one batch per PR):
- **PR #42** (batch 1, 8 consumers): `utils/utils.js`, `sessionServices.js`, `gnomon.js`, `pointCloudHighlighter.js`, `ballHighlighter.js`, `ballAndStick.js`, `pointCloud.js`, `ribbon.js`
- **PR #43** (batch 2, 5 consumers): `settingsManager.js`, `guiManager.js`, `picker.js`, `genomicNavigator.js`, `cameraLightingRig.js` (+ extracted `getThreeJSContainerRect` to `utils/threeJSContainer.js`)
- **PR #44** (batch 3, Juicebox cluster): `liveDistanceMapService.js`, `liveContactMapService.js`, `juiceboxPanel.js` (+ folded module-level `tabAssessment` and `juiceboxMouseHandler` into the class, deleting the `juiceboxPanelInstance` singleton)
- **PR #45** (batch 4, final): `SWBDatasource.js` (via `EnsembleManager.wireDependencies`), `spacewalkFileLoadWidgetServices.js` (lazy-getter thunks), `sceneManager.js` — and **deleted all 17 module-level bindings and the `export { … }` block from `app.js`**

State today: `app.js` exports only the `App` class. Shared application state lives on the `App` instance and flows to consumers via constructor injection or explicit `wireDependencies({…})` setters. `main.js` is the sole `App` importer.

Lessons captured for future singleton-deletion work: build doesn't catch lingering reads of deleted module bindings — they throw `ReferenceError` only at the call site at runtime. After removing the `let` block, grep `\b<name>\b` and walk every survivor by hand.

### 3. Frontend served partly by CDN `<script>` tags — score 32 (I4 R4 E2→4) — **mostly resolved (PR #47, 2026-05-28)**
**Category:** Dependency + infrastructure debt
**Original evidence:** `index.html` loaded jQuery 3.7, jQuery UI 1.13, Bootstrap 5.3, FontAwesome, Dropbox dropins, Spectrum colorpicker CSS, and DataTables straight from CDNs.
**Progress (PR #47, branch `phase-4-cleanup`):**
- **Bootstrap 5.3.3** moved to npm (+`@popperjs/core`), bundled by Vite; `main.js` exposes `window.bootstrap` because app code AND `data-modal` use it as a global.
- **jQuery UI** (JS+CSS) and **Spectrum colorpicker** (CSS) deleted — both were dead (no usages in source).
**Remaining:**
- **jQuery + DataTables** — ✅ removed in PR #51 (item #4); CDN tags gone from `index.html`.
- **FontAwesome kit** + **Dropbox dropins** stay on CDN: account-/app-key-bound dynamic loaders, can't be npm-bundled or SRI-pinned. This is the intended steady state, not debt.

### ~~4. jQuery removal partially complete~~ — **resolved (PR #51, 2026-05-29)**
**Category:** Code + dependency debt
**Originally:** jQuery survived for exactly two reasons: (1) `data-modal`'s `ModalTable` called global `$(...).DataTable(...)` — used by `contactMapLoad.js`, `trackWidgets.js`, `genomeWidgets.js`; (2) one direct `$()` at `sessionWidgets.js:24` (a DOM-positioning hack).
**How it was resolved:** DataTables was the gate. The replacement — **igvteam/infinite-table** — turned out to have *absorbed* `data-modal`'s responsibilities: it ships a jQuery-free `createModalTable` factory that is an explicit drop-in for `ModalTable`, plus `GenericDataSource`. So rather than a forked `data-modal`, the clean path was to drop `data-modal` entirely. infinite-table is pinned to the same commit the igv-webapp `replace-datatables` reference branch uses.
- The three `ModalTable` consumers now `import … from 'infinite-table/src/index.js'` and call `createModalTable(cfg)` (config shape unchanged: `selectionStyle`, `pageLength`, `okHandler`, `parent`).
- infinite-table's stylesheet imported in `main.js`.
- The lone `$()` became `firstElementChild.insertAdjacentHTML('afterend', …)`.
- jQuery + DataTables CDN `<script>`/`<link>` tags removed from `index.html`.

State today: jQuery is gone. The only `jquery` token left in the bundle is Bootstrap's own optional jQuery feature-detection (`window.jQuery && …`) — not a dependency. One tangential leftover remains and is **out of scope**: the `.ui-widget-content` / `.ui-resizable-handle` "jQuery UI hack" CSS in `src/styles/app.scss:251` (jQuery *UI*, unrelated to DataTables). Viewport smoke-test of the four modals (ENCODE map/track, GenArk genome, session-dropdown Dropbox placement) was still pending at merge.

### 5. Large multi-responsibility modules — partially addressed; downgrade pending re-measure
**Category:** Code debt
**Original evidence (2026-05-27):** `src/juicebox/juiceboxPanel.js` (576), `src/sceneManager.js` (425), `src/IGVPanel.js` (388), `src/app.js` (373), `src/ballAndStick.js` (343). `SceneManager` owned ball-and-stick, point-cloud, ribbon, ground plane, gnomon, scale bars, ball highlighter, point-cloud highlighter, settings load.
**Progress:**
- Phase 3a (May 2026) — `SceneManager` 425 → 271 lines via `ScaleBarService` hoist, `SceneFixtures` extraction, `EnsembleIngestionController` extraction
- Phase 3 DI (PR #42–45) — every large module's dependencies are now explicit; `juiceboxPanel` folded in two module-level helpers; `sceneManager` lost its `genomicNavigator`/`scene`/`sceneFixtures` imports
**Remaining:** Re-measure line counts post-DI before scoping further extraction. SceneManager-side color-picker bindings and other small extractions are still candidates if the file is still too big after re-measure.

### ~~6. Vendored 6.5k lines of third-party code in `src/`~~ — **resolved (PR #47, 2026-05-28)**
**Category:** Dependency debt
Both files turned out to be **dead code**, not live dependencies: `src/widgets/qrcode.js` (999 lines) had no importers, and `src/vendor/zlib_and_gzip.js` (5568 lines) had zero references (session compression uses `BGZip` from `igv-utils`). So this was a deletion, not a rewrite — **−6,568 lines.**

### ~~7. No logger~~ — withdrawn
Originally proposed wrapping the 113 `console.*` calls in a namespaced logger.
Tried it in Phase 1 (`f5a9853`, `eb188ef`) and reverted (`302dce0`, `b25ba5d`):
the toggle/config layer added complexity without proportional benefit for a
single-developer browser app. Keep `console.*` direct. If specific call sites
become noisy, delete them rather than gate them.

### ~~8. Risky GitHub-pinned deps~~ — **resolved**
**Category:** Dependency debt
`igv` is now pinned to `github:igvteam/igv.js#v3.8.0` (was `#master`). All GitHub deps are now tagged.

### 9. `development-notes/` needs grooming — score 9 (I2 R1 E1→5)
**Category:** Documentation debt
**Evidence:** `development-notes/` already serves as the durable cross-session context store (interaction diagrams, design notes for IGV/Juicebox, postmessage plan, etc.). But it holds 14+ files mixed with `test.json` and subfolders, with no index distinguishing current from stale. README is 90 lines.
**Where to start:** Add a short `development-notes/README.md` index that lists each note with a one-line "still current as of YYYY-MM" tag. Archive obviously stale notes into a `development-notes/archive/` subfolder. Do **not** add a top-level `CLAUDE.md` — `development-notes/` is the preferred context channel for this project.

### 10. Stale `notes/` and `discussions/` directories — score 4 (I1 R1 E1→5)
**Category:** Documentation debt — low. Worth a pass when convenient.

## Phased remediation plan

| Phase | Theme | Items | Status |
|---|---|---|---|
| **Phase 1 (1–2 days, alongside features)** | Stop the bleeding | #8 pin `igv`, #9 groom `development-notes/` | ✅ **Done** (branch `phase-1-refactors`; #7 logger tried + withdrawn) |
| **Phase 2 (1–2 weeks)** | Get a safety net | #1 Vitest + 3 seed test files on utils, basic CI workflow on push | ⏸ **Deferred** — see `feedback_skip_tests_for_visual_app` memory; visual app, viewport is the feedback loop |
| **Phase 3 (gradual)** | Untangle coupling | #2 constructor injection, one consumer per PR; #5 split `SceneManager` | ✅ **Done** — SceneManager split (Phase 3a, May 2026, PRs #34/36/37); constructor injection (PRs #42–#45, May–Jun 2026); `app.js` no longer exports shared state |
| **Phase 4 (focused sprint)** | Modernize delivery | #3 bundle CDN libs, #4 finish jQuery removal, #6 replace vendored libs | ✅ **Done** — cleanup (PR #47) + jQuery removal (PR #51). FontAwesome + Dropbox stay on CDN by design. |

## Recommended next action

Phases 1, 3, **4 complete**; Phase 2 deferred. Phase 4 landed in two halves per the jQuery-last directive:
- **Cleanup half — done (PR #47, branch `phase-4-cleanup`):** deleted dead vendored libs (#6), removed dead CDN links (jQuery UI + Spectrum), bundled Bootstrap via npm/Vite (#3).
- **jQuery-removal half — done (PR #51, branch `finish-jquery-removal`):** swapped DataTables/`data-modal` for **igvteam/infinite-table**, killed the lone `$()` in `sessionWidgets.js`, dropped the jQuery + DataTables CDN tags. FontAwesome + Dropbox dropins stay on CDN by design.

With Phases 1/3/4 done, the remaining open items are all lower-priority and previously deferred:
- **#1 / Phase 2 — automated tests.** Still the single biggest latent risk: every change (including PR #51) is verified by hand. Deferred per `feedback_skip_tests_for_visual_app`, but worth revisiting now that the structural churn (DI, jQuery removal) has settled — a test seed is more valuable once the surface stops moving.
- **#5 — re-measure large modules** post-DI and decide whether any further extraction is worth it.
- **#9 / #10 — documentation grooming** (`development-notes/` index, stale `notes/`·`discussions/`), low priority.

Also note: source moved `js/` → `src/` (commit dd3e551, PR #50). Path references throughout this doc use the current `src/` layout, including entries describing work done before that migration.
