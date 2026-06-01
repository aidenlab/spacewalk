import { describe, it, expect } from 'vitest'
import { RemoteError, KIND, normalizeURL, classifyResponse, classifyError } from './remoteResource.js'

// Invisible bookkeeping: the pure core of the remote-resource boundary —
// normalize a URL, classify a Response, wrap a thrown error. These are by-value
// string/object assertions with no bundler dependency. The side-effecting shell
// (fetchJSON / probe) and the resulting dialog are eye-audited in the app.

// A minimal Response stand-in: only the fields classifyResponse reads.
function makeResponse({ ok, status, url = 'https://host/x', contentType }) {
    return {
        ok,
        status,
        url,
        headers: { get: name => (name.toLowerCase() === 'content-type' ? (contentType ?? null) : null) },
    }
}

describe('normalizeURL', () => {

    it('rewrites a Dropbox share host to the direct-download host', () => {
        expect(normalizeURL('https://www.dropbox.com/scl/fi/abc/data.sw?rlkey=k1&st=s1&dl=0'))
            .toBe('https://dl.dropboxusercontent.com/scl/fi/abc/data.sw?rlkey=k1&st=s1&dl=0')
    })

    it('is idempotent — an already-direct URL is unchanged', () => {
        const direct = 'https://dl.dropboxusercontent.com/scl/fi/abc/data.sw?dl=0'
        expect(normalizeURL(direct)).toBe(direct)
    })

    it('passes a non-Dropbox URL through unchanged', () => {
        const url = 'https://s3.amazonaws.com/bucket/genome.fa'
        expect(normalizeURL(url)).toBe(url)
    })

    it('passes a non-string (drag-dropped File) through untouched', () => {
        const file = { name: 'local.sw' }
        expect(normalizeURL(file)).toBe(file)
    })
})

describe('classifyResponse', () => {

    it('maps 404 to not-found', () => {
        const err = classifyResponse(makeResponse({ ok: false, status: 404 }))
        expect(err).toBeInstanceOf(RemoteError)
        expect(err.status).toBe(404)
        expect(err.kind).toBe(KIND.NOT_FOUND)
    })

    it('maps 403 to forbidden', () => {
        expect(classifyResponse(makeResponse({ ok: false, status: 403 })).kind).toBe(KIND.FORBIDDEN)
    })

    it('maps 401 to unauthorized', () => {
        expect(classifyResponse(makeResponse({ ok: false, status: 401 })).kind).toBe(KIND.UNAUTHORIZED)
    })

    it('maps an unlisted error status to network, preserving the status', () => {
        const err = classifyResponse(makeResponse({ ok: false, status: 500 }))
        expect(err.kind).toBe(KIND.NETWORK)
        expect(err.status).toBe(500)
    })

    it('flags a 200 text/html body when an hdf5 file is expected (Dropbox masquerade)', () => {
        const err = classifyResponse(makeResponse({ ok: true, status: 200, contentType: 'text/html; charset=utf-8' }), { expect: 'hdf5' })
        expect(err).toBeInstanceOf(RemoteError)
        expect(err.kind).toBe(KIND.NOT_EXPECTED_FORMAT)
    })

    it('returns null for a healthy 200', () => {
        expect(classifyResponse(makeResponse({ ok: true, status: 200, contentType: 'application/octet-stream' }), { expect: 'hdf5' })).toBeNull()
    })

    it('does not inspect content-type when no expectation is given', () => {
        expect(classifyResponse(makeResponse({ ok: true, status: 200, contentType: 'text/html' }))).toBeNull()
    })
})

describe('classifyError', () => {

    it('wraps a fetch TypeError as a network RemoteError', () => {
        const err = classifyError(new TypeError('Failed to fetch'), 'https://host/x')
        expect(err).toBeInstanceOf(RemoteError)
        expect(err.kind).toBe(KIND.NETWORK)
        expect(err.url).toBe('https://host/x')
    })

    it('passes an existing RemoteError through unchanged', () => {
        const original = new RemoteError('Not found', { url: 'https://host/x', status: 404, kind: KIND.NOT_FOUND })
        expect(classifyError(original, 'https://host/x')).toBe(original)
    })
})
