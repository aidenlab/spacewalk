import { describe, it, expect, vi, afterEach } from 'vitest'

import { tinyURLShortener } from './urlShortener.js'
import { spacewalkConfig } from '../spacewalk-config.js'

const ENDPOINT = 'https://spacewalk.aidenlab.org/shorten'
const LONG_URL = 'https://aidenlab.org/spacewalk/?spacewalkSessionURL=blob:abcdef'

/** Stands in for the shortening endpoint. Only the fields the shortener reads are provided. */
function respondWith(body, { ok = true, status = 200, statusText = 'OK' } = {}) {
    const fetch = vi.fn(async () => ({ ok, status, statusText, json: async () => body }))
    vi.stubGlobal('fetch', fetch)
    return fetch
}

afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

describe('tinyURL shortener', () => {

    /** The key stays on the worker (workers/sw-shortlink); the page posts the bare url. */
    it('posts the url to the endpoint, without a key, and reads the short link back', async () => {
        const fetch = respondWith({ data: { tiny_url: 'https://t.3dg.io/xyz' } })

        const shorten = tinyURLShortener({ endpoint: ENDPOINT })

        await expect(shorten(LONG_URL)).resolves.toBe('https://t.3dg.io/xyz')

        const [ endpoint, init ] = fetch.mock.calls[0]
        expect(endpoint).toBe(ENDPOINT)
        expect(init.headers.Authorization).toBeUndefined()
        expect(JSON.parse(init.body)).toEqual({ url: LONG_URL })
    })

    it('returns the url unshortened, without a request, when no endpoint is configured', async () => {
        const fetch = respondWith({})
        vi.spyOn(console, 'warn').mockImplementation(() => {})

        await expect(tinyURLShortener({})(LONG_URL)).resolves.toBe(LONG_URL)
        expect(fetch).not.toHaveBeenCalled()
    })

    /** The Share modal must still fill in: a long Share URL works, it is just not short. */
    it('hands the long url back when the endpoint answers with an error', async () => {
        respondWith({ error: 'Shortening failed.' }, { ok: false, status: 502, statusText: 'Bad Gateway' })
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

        await expect(tinyURLShortener({ endpoint: ENDPOINT })(LONG_URL)).resolves.toBe(LONG_URL)
        expect(warn).toHaveBeenCalled()
    })

    /** What a CORS refusal looks like to the page. */
    it('hands the long url back when the request itself fails', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
        vi.spyOn(console, 'warn').mockImplementation(() => {})

        await expect(tinyURLShortener({ endpoint: ENDPOINT })(LONG_URL)).resolves.toBe(LONG_URL)
    })
})

describe('url shortener configuration', () => {

    it('points at the sw-shortlink worker and carries no key', () => {
        expect(spacewalkConfig.urlShortener.endpoint).toBe(ENDPOINT)
        expect(spacewalkConfig.urlShortener.apiKey).toBeUndefined()
    })
})
