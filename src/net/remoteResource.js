// The remote-resource boundary: one place that owns fetching an external URL,
// normalizing it, and classifying the outcome into a typed error. Spacewalk
// reaches out to ~nine classes of external resource (ensemble .sw, IGV genome,
// .hic maps, track/genome registries, session JSON, color maps); historically
// each call site handled failure ad-hoc. This module funnels the diagnosable
// part of that through a small interface.
//
// The core — normalizeURL / classifyResponse / classifyError — is pure and
// ZERO-IMPORT on purpose, so it loads cleanly under `vitest run` and is tested
// by value. fetchJSON / probe are the thin side-effecting shell over `fetch`.
// Keep igv-utils (and anything that drags in a bundler-only dependency) OUT of
// this file so the pure core stays test-loadable.
//
// presentResourceError owns turning a RemoteError into user-facing copy; the
// messages here are terse and developer-facing. The error carries the structured
// fields (status / kind / url) that presentResourceError formats from.

const KIND = {
    NOT_FOUND: 'not-found',
    FORBIDDEN: 'forbidden',
    UNAUTHORIZED: 'unauthorized',
    NETWORK: 'network',
    NOT_EXPECTED_FORMAT: 'not-expected-format',
}

class RemoteError extends Error {
    constructor(message, { url, status, kind } = {}) {
        super(message)
        this.name = 'RemoteError'
        this.url = url
        this.status = status
        this.kind = kind
    }
}

// Pure. Apply the one well-known Spacewalk URL mapping: a Dropbox share host
// (www.dropbox.com) only serves the file bytes from its direct-download host
// (dl.dropboxusercontent.com) — the share host returns the HTML preview page.
// This mirrors igv-utils' mapUrl so our preflight probes the same URL the reader
// will actually open. Idempotent (an already-direct URL doesn't match) and a
// passthrough for non-Dropbox strings. Non-string inputs (a drag-dropped File)
// pass through untouched.
function normalizeURL(url) {

    if (typeof url !== 'string') {
        return url
    }

    if (url.startsWith('https://www.dropbox.com')) {
        return url.replace('//www.dropbox.com', '//dl.dropboxusercontent.com')
    }

    return url
}

// Pure. Map a fetch Response to a RemoteError, or null when it's good. `expect`
// ('json' | 'hdf5' | undefined) lets us catch a 200 that returns an HTML page
// where binary/JSON was expected — the Dropbox dl=0 masquerade (200 + text/html
// instead of the file), which otherwise surfaces as a baffling parse error deep
// in the reader.
function classifyResponse(res, { expect } = {}) {

    const url = res.url

    if (!res.ok) {
        if (404 === res.status) {
            return new RemoteError('Not found', { url, status: 404, kind: KIND.NOT_FOUND })
        }
        if (403 === res.status) {
            return new RemoteError('Forbidden', { url, status: 403, kind: KIND.FORBIDDEN })
        }
        if (401 === res.status) {
            return new RemoteError('Unauthorized', { url, status: 401, kind: KIND.UNAUTHORIZED })
        }
        return new RemoteError(`Request failed (${ res.status })`, { url, status: res.status, kind: KIND.NETWORK })
    }

    // 2xx: a resource that returns an HTML page where we expected a file/JSON is
    // a preview/landing page masquerading as the resource (classic Dropbox dl=0).
    if (expect && 'html' !== expect) {
        const contentType = res.headers && res.headers.get ? (res.headers.get('content-type') || '') : ''
        if (contentType.includes('text/html')) {
            return new RemoteError('Expected a file but received an HTML page', { url, status: res.status, kind: KIND.NOT_EXPECTED_FORMAT })
        }
    }

    return null
}

// Pure. Wrap a thrown fetch error (network failure → TypeError) into a
// RemoteError. A RemoteError passes through unchanged.
function classifyError(err, url) {

    if (err instanceof RemoteError) {
        return err
    }

    return new RemoteError(err && err.message ? err.message : 'Network error', { url, kind: KIND.NETWORK })
}

// Side-effecting shell. Fetch + classify + parse JSON. Throws a RemoteError on
// any failure (network, bad status, HTML-where-JSON-expected, unparseable body).
async function fetchJSON(url) {

    const target = normalizeURL(url)

    let res
    try {
        res = await fetch(target)
    } catch (e) {
        throw classifyError(e, target)
    }

    const err = classifyResponse(res, { expect: 'json' })
    if (err) {
        throw err
    }

    try {
        return await res.json()
    } catch (e) {
        throw new RemoteError('Response was not valid JSON', { url: target, status: res.status, kind: KIND.NOT_EXPECTED_FORMAT })
    }
}

// Side-effecting shell. Cheap preflight before a heavyweight open (e.g.
// openH5File). A one-byte range GET surfaces 404/403 and the HTML-masquerade as
// a clean RemoteError instead of a deep reader stack. Returns the RemoteError or
// null — it does not throw, so callers decide whether a failed preflight aborts.
async function probe(url, { expect } = {}) {

    const target = normalizeURL(url)

    let res
    try {
        res = await fetch(target, { headers: { Range: 'bytes=0-0' } })
    } catch (e) {
        return classifyError(e, target)
    }

    return classifyResponse(res, { expect })
}

export { RemoteError, KIND, normalizeURL, classifyResponse, classifyError, fetchJSON, probe }
