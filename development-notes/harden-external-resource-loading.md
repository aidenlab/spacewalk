# Hardening: external-resource loading & failure modes

> **STATUS: COMPLETE (2026-06-01).** Phases 0–3 shipped to `main` across three PRs:
> **#59** (Phases 0 + 1 — stop-the-bleeding + one error surface, plus the failed-load
> freeze fix), **#60** (Phase 2 — the `src/net/remoteResource.js` boundary), **#61**
> (Phase 3 — the consolidated session-load report). Phase 4 (retry/backoff, inline
> relink affordance, parse-time URL validation) is explicitly deferred. See the
> per-phase annotations in the commit plan below.

Date: 2026-05-30 (completed 2026-06-01)
Branch: `harden/external-resource-loading` (Phases 0+1), `harden/remote-resource-boundary`
(Phase 2), `harden/session-load-transaction` (Phase 3) — all merged.
Companion to: `~/Desktop/spacewalk-module-deepening-candidates.md` (this is a *separate* item — a
cross-cutting reliability pass, not one of the three deepening candidates, all of which shipped).
Shape: **stop-the-bleeding fixes → one error surface → a narrow remote-resource boundary**.

## Trigger

`guy-nir-salmonella-pointcloud-session.json` failed to load. Two independent external resources
were gone, and the app handled both badly:

1. **`Salmonella.sw` → 404.** Dropbox share link's direct-download host (`dl.dropboxusercontent.com`)
   returns 404; the `www.dropbox.com` landing page still returns 200 *HTML* (157 KB,
   `<!DOCTYPE html>`) masquerading as the file. The `.sw` open failed deep inside
   `hdf5-indexed-reader`; the error was **swallowed** at `sessionServices.js:102`
   ("Failed to load session").
2. **`NC_016856.1` genome fasta/fai → 403.** S3 bucket `igv-genepattern-org` is now forbidden.
   IGV's `loadGenome` rejection became an **unhandled promise rejection** at `uiBootstrapper.js:189`.

Net user experience: spinner spins forever, two errors in the console, **nothing on screen.**
Neither failure is a Spacewalk bug — both are dead remote URLs — but the app's response to them is.

## Problem

Spacewalk reaches out to nine classes of external resource and handles failure ad-hoc per call
site. The retrieval surface:

| Resource | Entry path | Failure behavior today |
|---|---|---|
| `.sw` ensemble (HDF5) | `SWBDatasource.load` → `openH5File` (`SWBDatasource.js:32`) | deep reader error, often swallowed |
| IGV genome (fasta/fai/gff) | `igvPanel.browser.loadGenome/loadSession` | **unhandled rejection** |
| `.hic` contact maps | `juiceboxPanel.loadHicFile/loadSession` | native `alert()` (`juiceboxPanel.js:304`) |
| IGV tracks + registry JSON | `trackWidgets.js` fetch (`:273,:293,:316`) | `AlertSingleton` |
| Genome registry JSON | `genomeWidgets.js` fetch (`:95`) | `AlertSingleton` |
| Session JSON | `igvxhr.loadJson` (`uiBootstrapper.js:187`) | **unhandled rejection** |
| Color maps | `colorMapManager.js` fetch (`:114`) | varies |
| URL shortener / release check | `urlShortener.js:35`, `release.js:5` | varies (outbound, low blast radius) |
| Textures | `pointCloud.js:85,107` | none (local asset) |

### The defects (each pinned to a location)

1. **No single error surface.** Four behaviors coexist:
   - native `alert()` — `ensembleManager.js:25`, `juiceboxPanel.js:304`
   - `AlertSingleton` (the draggable dialog) — `fileLoad.js:16,36`, `trackWidgets.js`, `genomeWidgets.js`
   - `console.error` + swallow — `sessionServices.js:101-103`, `spacewalkFileLoadWidgetServices.js:140`
   - unhandled rejection — `uiBootstrapper.js:187-189` (no try/catch around `loadJson`+`loadSession`)

   The Salmonella case hit the worst two (swallow + unhandled). There is **no global
   `unhandledrejection`/`error` listener** (confirmed: only a web-worker and an image `error`
   listener exist) — so anything that escapes is silent.

2. **Spinner leaks on failure.** `ensembleManager.loadDatasource` (`:52-54`) does
   `showGlobalSpinner()` → `await load()` → `hideGlobalSpinner()` with **no `try/finally`**.
   Same shape in `SWBDatasource.initialize` (`:41/:53`), `createTrace` (`:109/:147`),
   `updateWithEnsembleGroupKey`, and `loadEnsembleGroup` (`ensembleManager.js:35/:47`).
   A throw between show and hide leaves the spinner spinning → **app looks hung.** This is the
   visible half of "quietly spills into the console."

3. **A dead `try/catch`.** `sessionFileLoad.js:15` calls `this.loadHandler({url: path})`
   **without `await`**; the surrounding `try/catch` (`:14-19`) catches nothing and the rejection escapes.

4. **Torn partial state on session restore.** `loadSession` runs spacewalk → juicebox → igv
   sequentially (`sessionServices.js:23-32`). When `.sw` fails, `loadSpacewalkSession` swallows it
   (`:101`) and **keeps going**, loading IGV/juicebox against a half-purged scene
   (`ingestEnsemblePath` already called `purgeScene()` at `ensembleIngestionController.js:56`).
   No "abort the whole restore" notion; the two errors surface independently.

5. **Lossy diagnostics.** The reader throws a raw `Error` with an HDF5 stack — no HTTP status,
   no URL, no "not-found vs forbidden vs not-actually-HDF5." The Dropbox `dl=0` HTML-masquerade
   (200 returning HTML, not the file) is detected **nowhere**; it would surface as a baffling
   parse error deep in the reader rather than "this isn't a `.sw` file."

6. **Half-built helpers.** `alertDialog.js:4-9` already has `httpMessages` for 401/403/404 but
   only maps when the *entire* string `===` `"404"` (`:81`) — so "Access forbidden: <url>" bypasses
   it. The `userNotified` flag (`ensembleManager.js:27`, read at `ensembleIngestionController.js:52`)
   is a hack to thread "already-alerted" state through re-throws.

## Design

Two moves. First, a **narrow remote-resource boundary** (Ousterhout-style: small interface, large
hidden implementation) that every tendril funnels through — it owns fetching, status mapping,
Dropbox normalization, and error *classification*. Second, **one error surface** plus lifecycle
fixes (spinner, await, abort) so a classified failure always lands somewhere the user can see.

The classifier and normalizer are **pure functions** → unit-testable per the repo's posture
(test invisible bookkeeping only; visuals are eye-audited). That's the testable boundary this
creates.

### `src/net/remoteResource.js` — the boundary (partly tested)

```
class RemoteError extends Error {
  url; status; kind   // 'not-found' | 'forbidden' | 'unauthorized' | 'network' | 'not-expected-format'
}

normalizeURL(url)                  // Dropbox dl=0 → direct-download; idempotent; pure
classifyResponse(res, { expect }) -> RemoteError | null   // status + content-type, pure
classifyError(err, url)           -> RemoteError          // wrap network/parse errors, pure

async fetchJSON(url)               // fetch + classifyResponse(expect:'json') + parse
async probe(url, { expect })       // cheap HEAD/range GET → RemoteError | null (preflight)
```

- `normalizeURL` / `classifyResponse` / `classifyError` are **zero-import pure** → by-value tests.
- `fetchJSON`/`probe` are the side-effecting shell. Keep `igv-utils` *out* of this module so the
  pure core loads cleanly under `vitest run` (same gotcha that bit Candidate 3).

### `presentResourceError(err, { what, url })` — one surface

Standardize on `AlertSingleton` (the draggable dialog). Formats: **what** failed, **which URL**,
**HTTP status → friendly message**, and a **hint** (e.g. "the file may have moved or the Dropbox
link expired"). Fix the broken status mapping (`alertDialog.js:81`) so a `RemoteError.status`
maps regardless of surrounding text. Delete native `alert()` calls and the `userNotified` flag.

### `withSpinner(fn)` — lifecycle safety

```
async function withSpinner(fn) { showGlobalSpinner(); try { return await fn() } finally { hideGlobalSpinner() } }
```

Replace every hand-paired show/hide so the spinner can never strand.

### Session restore as a transaction

`loadSession` treats the ensemble (`.sw`) as the spine: if it can't be reached, **abort** and
report once — don't proceed to IGV/juicebox. Best-effort sub-loads (a missing optional track)
accumulate into a single consolidated report rather than N separate dialogs.

### `.sw` preflight

Before the heavyweight `openH5File`, an optional `probe(url, { expect: 'hdf5' })`:
- 404/403 → `RemoteError` with a clear message instead of a deep reader stack.
- `content-type: text/html` where HDF5 bytes are expected → `kind: 'not-expected-format'`
  ("This URL returned a web page, not a `.sw` file — the Dropbox link may be a preview link").

## Behavior preservation / risk

Phase 0 is pure bug-fix (spinner, await, global net) — only changes behavior on the *failure*
path, which is currently broken. Phases 1–2 reroute existing calls through the boundary without
changing the success path. The one intentional behavioral change: failures that are currently
silent become visible. Build check after each phase (`npm run build`, ~6s); the success paths are
eye-audited in the viewport.

## Phased commit plan (tiny commits)

### Phase 0 — Stop the bleeding (independent, ship first) — ✅ SHIPPED (#59)
0a. Add `withSpinner` to `utils.js`; route `ensembleManager`/`SWBDatasource` show/hide through it.
0b. Add the missing `await` in `sessionFileLoad.js:15`.
0c. Global `unhandledrejection` + `error` listener in `main.js` → `presentResourceError`.
0d. `loadSpacewalkSession` (`sessionServices.js:90`): surface + **abort** the restore on ensemble failure.

### Phase 1 — One error surface — ✅ SHIPPED (#59)
1a. `presentResourceError(err, { what, url })`; fix `alertDialog.js:81` status mapping.
1b. Replace native `alert()` (`ensembleManager.js:25`, `juiceboxPanel.js:304`) and delete the
    `userNotified` flag (`ensembleManager.js:27`, `ensembleIngestionController.js:52`).

> **Follow-up fix (also in #59):** a failed load froze the 3D viewport. `App.render()`
> gates the whole render loop on `sceneManager.isGood2Go()`, which needs the gnomon/
> groundplane fixtures; the failure path's `purgeScene()` disposed them, stranding the
> loop. Fix: drop `purgeScene()` from the ingestion catch blocks — the load throws
> before any scene mutation, so the prior scene stays intact and interactive (a clean
> rollback, previewing Phase 3's transaction thinking).

### Phase 2 — The boundary (the deepening) — ✅ SHIPPED (#60)
2a. Add `src/net/remoteResource.js` + `remoteResource.test.js` (pure core: normalize/classify) — green.
    *(13 by-value tests; the pure core is zero-import so it loads under `vitest run`.)*
2b. Route session JSON (`uiBootstrapper.js`), track/genome registries through `fetchJSON`.
    > **Deviation:** color maps were **not** routed through `fetchJSON`. `colorMapManager`
    > fetches a PNG **blob** (not JSON) and already degrades gracefully to built-in maps —
    > a dialog for an optional missing colormap would be worse, not better.
2c. `.sw` preflight in `SWBDatasource.load` via `probe`; detect 404/403 + HTML-masquerade.
    > Only **definitive** kinds (not-found/forbidden/unauthorized/not-expected-format) abort;
    > a `network`-kind probe failure falls through to `openH5File` so a transient/CORS hiccup
    > the reader wouldn't hit never false-aborts a working load. Local files skip the probe.

### Phase 3 — Session-load transaction — ✅ SHIPPED (#61)
3a. The spine-abort landed early in 0d. Phase 3 added the **consolidated report**: extract
    `formatResourceError` + add `presentResourceErrors(problems)`; `loadSession` wraps the
    best-effort sub-loads (Juicebox map, IGV session), continues the restore on failure, and
    reports them together in one dialog. Locus re-applies stay as `console.warn` (lockstep
    sync of an already-loaded browser, not resource fetches).

### Phase 4 — Optional resilience — ⏸️ DEFERRED (not started)
- Retry/backoff for transient (non-4xx) errors only.
- Inline "resource unavailable — relink" affordance so a dead URL isn't a dead end.
- Validate session URLs at parse time (`launchIntent`).

## Test plan (`src/net/remoteResource.test.js`, vitest, pure)

- `normalizeURL`: Dropbox `dl=0` → direct host; already-direct URL unchanged; non-Dropbox passthrough; idempotent.
- `classifyResponse`: 404→not-found, 403→forbidden, 401→unauthorized, 200+`text/html` when
  `expect:'hdf5'`→not-expected-format, 200+ok→null.
- `classifyError`: `TypeError` (fetch network failure) → `kind:'network'`.

Invisible bookkeeping only — exactly the classifier/normalizer. The dialogs and the spinner are
eye-audited.

## What this would have done for the Salmonella session

"Spinner hangs, two console errors, blank screen" → a single dialog:
*"Couldn't load Salmonella.sw — Not found (404). The file may have moved or the Dropbox link
expired."* and the IGV genome 403 folded into the same consolidated report instead of an
unhandled rejection.
