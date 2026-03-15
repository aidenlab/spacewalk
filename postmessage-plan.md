# Plan: Add `postMessage` Listener for Cross-Origin File Ingestion

## Problem

External web tools (e.g., [swtool](https://swtool-app.netlify.app/)) generate .sw files in memory and currently can only offer a download button. Scientists must download the file, then manually load it into Spacewalk — a two-step process. We want a single "Open in Spacewalk" button that pipes the in-memory file directly into Spacewalk.

## Why `postMessage`

| Option | Pros | Cons |
|--------|------|------|
| `?file=<url>` (already built) | Simple | Requires the file to be hosted somewhere with a public URL; doesn't work for in-memory files |
| `postMessage` | No server needed; works cross-origin; seamless one-click UX; file never touches disk | Requires both apps to agree on a message protocol |
| Temporary upload to S3/etc. | Spacewalk side is trivial (`?file=`) | Requires server infrastructure, adds latency, costs money |
| Local file round-trip | Works today | Two manual steps — not seamless |

`postMessage` is the best fit: no infrastructure, cross-origin capable, and both apps are browser-based.

## Key Insight: Existing Pipeline Already Supports File Objects

Spacewalk's loading chain — `ingestEnsemblePath()` → `ensembleManager.loadURL()` → datasources — uses `FileUtils.isFilePath()` to distinguish `File` objects from URL strings and handles both transparently. No new loading path is needed. We just need to construct a `File` from the received bytes and hand it to the existing pipeline.

## Protocol

### Sequence Diagram

```
swtool                                    Spacewalk
  │                                          │
  │  window.open('/spacewalk/')              │
  │ ──────────────────────────────────────►  │
  │                                          │
  │                          (init completes)│
  │                                          │
  │  postMessage({ type: 'spacewalk-ready' })│
  │ ◄──────────────────────────────────────  │
  │                                          │
  │  postMessage({                           │
  │    type: 'spacewalk-load',               │
  │    bytes: Uint8Array,                    │
  │    filename: 'output.sw'                 │
  │  })                                      │
  │ ──────────────────────────────────────►  │
  │                                          │
  │                        (file loads, 3D   │
  │                         structure renders)│
```

### Message Types

**`spacewalk-ready`** (Spacewalk → opener)
- Sent once after initialization completes
- Tells the opener that Spacewalk is ready to receive a file
- Contains no sensitive data

**`spacewalk-load`** (opener → Spacewalk)
- Carries the file payload
- Fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `string` | Yes | Must be `'spacewalk-load'` |
| `bytes` | `Uint8Array` | Yes | Raw file bytes |
| `filename` | `string` | Yes | Filename with extension (e.g., `'output.sw'`). Extension determines which datasource/parser is used. |

## Changes

### Spacewalk side (this repo)

**One file modified: `js/app.js`**

In `initialize()`, after `hideGlobalSpinner()` and before the render loop:

1. If `window.opener` exists, post `{ type: 'spacewalk-ready' }` back to it
2. Register a `message` event listener that:
   - Ignores messages without `type: 'spacewalk-load'`
   - Validates `bytes` is a `Uint8Array` and `filename` is a string
   - Constructs a `File` object: `new File([bytes], filename)`
   - Calls `ingestEnsemblePath(file, '0', undefined)` — the same path used by the local file picker
   - Posts `DidLoadEnsembleFile` on the event bus

No new files. No changes to datasources, parsers, scene management, or the `?file=` URL parameter.

### swtool side (separate repo, later)

In `src/ui.js` `showSuccess()`, add an "Open in Spacewalk" button alongside the existing download link. On click:

1. `window.open('https://aidenlab.org/spacewalk/')`
2. Listen for the `spacewalk-ready` message
3. Send `{ type: 'spacewalk-load', bytes, filename }` to the opened window

## Security Considerations

- The `spacewalk-ready` message uses `'*'` as `targetOrigin` since the opener could be any domain. This is safe because the message contains no sensitive data — it's just a readiness signal.
- On receive, Spacewalk validates `data.type`, `data.bytes instanceof Uint8Array`, and `typeof data.filename === 'string'` before acting.
- No origin allowlist is needed at this stage. The worst an attacker could do is load a file into your own local Spacewalk session — there's no write-back or data exfiltration vector.

## What This Does NOT Change

- Share URL feature (`?spacewalkSessionURL=...`)
- Direct file URL feature (`?file=<url>`)
- Local file picker / drag-and-drop
- Datasource, parser, or scene management code

## Verification

1. `npm run build` — no build errors
2. `npm run dev` — open swtool in one tab, click "Open in Spacewalk", confirm the file loads and renders in the new tab
3. Confirm existing features (local file load, URL param, share URLs) still work
