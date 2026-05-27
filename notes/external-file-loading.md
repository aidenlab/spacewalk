# External File Loading

Spacewalk supports two mechanisms for external tools to load data files directly, without the user manually downloading and re-uploading files.

## 1. URL Parameter (`?file=`)

The simplest integration path. An external tool constructs a URL pointing to a hosted Spacewalk file and opens it in the browser:

```
https://aidenlab.org/spacewalk/?file=https://example.com/data.sw
```

### Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `file` | Yes | — | URL to a .sw/.swb/.swt file |
| `traceKey` | No | `'0'` | Trace index to display initially |
| `ensembleGroupKey` | No | — | Ensemble group to load |

### URL Parsing

File URLs often contain their own query parameters (e.g., Dropbox links with `rlkey`, `st`, `dl`). Standard query string parsing would split these on `&` and break the file URL.

Spacewalk handles this with `extractFileParam()` in `js/app.js`: it reads the raw query string and captures everything after `file=` up to the next known Spacewalk parameter (`traceKey` or `ensembleGroupKey`). All other `&key=value` pairs are preserved as part of the file URL.

Example — this URL works correctly despite the embedded Dropbox parameters:
```
https://aidenlab.org/spacewalk/?file=https://www.dropbox.com/scl/fi/.../file.sw?rlkey=abc&st=xyz&dl=0&traceKey=2
```

### Implementation

In `js/app.js`, `consumeURLParams()` checks for the `file` parameter before the existing share-session logic. If present, it calls `sceneManager.ingestEnsemblePath()` — the same loading path used by the UI file picker.

## 2. postMessage API

For web applications that generate Spacewalk files in memory (e.g., conversion tools, simulation pipelines), the `postMessage` API enables direct file transfer between browser tabs without any server round-trip.

### Why postMessage

When a tool generates a file client-side, the data exists only in JavaScript memory — there's no URL to point to. The browser's `postMessage` API allows two windows to exchange structured data directly, even across different origins. This enables a seamless one-click workflow: the user clicks a button in the generating tool, Spacewalk opens, and the 3D structure renders — no file download, no manual upload.

### Protocol

#### Message Flow

```
External Tool                                Spacewalk
  │                                             │
  │  1. window.open(spacewalkURL)               │
  │ ─────────────────────────────────────────►  │
  │                                             │
  │              (Spacewalk initializes...)      │
  │                                             │
  │  2. { type: 'spacewalk-ready' }             │
  │ ◄─────────────────────────────────────────  │
  │                                             │
  │  3. { type: 'spacewalk-load',               │
  │       bytes: Uint8Array,                    │
  │       filename: 'output.sw' }               │
  │ ─────────────────────────────────────────►  │
  │                                             │
  │              (3D structure renders)          │
```

#### Step 1: Open Spacewalk

The external tool opens Spacewalk in a new tab:

```javascript
const spacewalkWindow = window.open('https://aidenlab.org/spacewalk/')
```

#### Step 2: Wait for Readiness

After Spacewalk finishes its multi-stage initialization (Three.js scene, UI, panels, etc.), it posts a readiness signal back to its opener:

```javascript
// Spacewalk side (js/app.js)
if (window.opener) {
    window.opener.postMessage({ type: 'spacewalk-ready' }, '*')
}
```

The external tool listens for this message:

```javascript
window.addEventListener('message', function handler(event) {
    if (event.data?.type !== 'spacewalk-ready') return
    window.removeEventListener('message', handler)
    // Ready to send the file
})
```

#### Step 3: Send the File

The tool sends the file bytes and filename:

```javascript
spacewalkWindow.postMessage(
    { type: 'spacewalk-load', bytes, filename },
    '*'
)
```

| Field | Type | Description |
|-------|------|-------------|
| `type` | `string` | Must be `'spacewalk-load'` |
| `bytes` | `Uint8Array` | Raw file bytes |
| `filename` | `string` | Filename with extension (`.sw`, `.swb`, `.swt`). The extension determines which parser/datasource Spacewalk uses. |

### Spacewalk Receiving Side

In `js/app.js`, `initializePostMessageListener()` is called after initialization completes. It:

1. Posts `spacewalk-ready` to `window.opener` (if present)
2. Registers a `message` event listener that validates incoming payloads, constructs a `File` object from the bytes, and feeds it into `sceneManager.ingestEnsemblePath()` — the same loading path used by the local file picker and the URL parameter

The key insight is that Spacewalk's entire file loading pipeline already accepts `File` objects. The `FileUtils.isFilePath()` check in each datasource distinguishes `File` objects from URL strings and handles both transparently. No special loading path was needed.

### Security

- The `spacewalk-ready` message uses `'*'` as `targetOrigin`. This is safe because the message contains no sensitive data — it's a readiness signal only.
- Incoming `spacewalk-load` messages are validated: `bytes` must be a `Uint8Array` and `filename` must be a string. Invalid payloads are rejected with a console warning.
- No origin allowlist is enforced. The worst case is that an untrusted page loads a file into the user's own Spacewalk session — there is no write-back or data exfiltration vector.

### COOP/COEP Compatibility

If the sending application sets `Cross-Origin-Opener-Policy: same-origin`, the browser will sever the `window.opener` / `window.open()` relationship for cross-origin windows, breaking the postMessage handoff. Sending applications must either:

- Omit the COOP header entirely, or
- Use `Cross-Origin-Opener-Policy: same-origin-allow-popups`

### Adopting This Pattern

Any web application that produces Spacewalk-compatible files can implement the sending side in roughly 15 lines of JavaScript:

```javascript
function openInSpacewalk(bytes, filename) {
    const spacewalkWindow = window.open('https://aidenlab.org/spacewalk/')

    window.addEventListener('message', function handler(event) {
        if (event.data?.type !== 'spacewalk-ready') return
        window.removeEventListener('message', handler)
        spacewalkWindow.postMessage(
            { type: 'spacewalk-load', bytes, filename },
            '*'
        )
    })
}
```

[swtool](https://github.com/aidenlab/swtool) is the first application to use this integration.
