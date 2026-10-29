import { describe, it, expect, vi, afterEach } from 'vitest'

import worker from './index.js'

const ORIGIN = 'https://aidenlab.org'
const LONG_URL = `${ ORIGIN }/spacewalk/?spacewalkSessionURL=blob:abcdef`

const env = {
    ALLOWED_ORIGINS: [ ORIGIN, 'https://spacewalk.aidenlab.org' ],
    TINYURL_DOMAIN: 't.3dg.io',
    TINYURL_API_KEY: 'test-api-key',
}

function post(url, { origin = ORIGIN, vars = {} } = {}) {
    const headers = { 'content-type': 'application/json' }
    if (origin) {
        headers.origin = origin
    }
    const request = new Request('https://spacewalk.aidenlab.org/shorten', {
        method: 'POST',
        headers,
        body: JSON.stringify({ url }),
    })
    return worker.fetch(request, { ...env, ...vars })
}

/** Stands in for TinyURL's create endpoint. */
function tinyurlAnswers(body, status = 200) {
    const fetch = vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetch)
    return fetch
}

afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

describe('POST /shorten', () => {

    it('shortens a page\'s own link on t.3dg.io, tagged spacewalk, and answers in TinyURL\'s shape', async () => {
        const tinyurl = tinyurlAnswers({ data: { tiny_url: 'https://t.3dg.io/xyz' } })

        const response = await post(LONG_URL)

        expect(response.status).toBe(200)
        expect(response.headers.get('access-control-allow-origin')).toBe(ORIGIN)
        expect(await response.json()).toEqual({ data: { tiny_url: 'https://t.3dg.io/xyz' } })

        const [ endpoint, init ] = tinyurl.mock.calls[0]
        expect(endpoint).toBe('https://api.tinyurl.com/create')
        expect(init.headers.authorization).toBe('Bearer test-api-key')
        expect(JSON.parse(init.body)).toEqual({ url: LONG_URL, domain: 't.3dg.io', tags: [ 'spacewalk' ] })
    })

    it('refuses an origin that is not the app\'s, and a request with none', async () => {
        const fetch = tinyurlAnswers({})

        expect((await post(LONG_URL, { origin: 'https://evil.example' })).status).toBe(403)
        expect((await post(LONG_URL, { origin: null })).status).toBe(403)
        expect(fetch).not.toHaveBeenCalled()
    })

    it('allows a Netlify deploy preview by pattern, and not a look-alike', async () => {
        tinyurlAnswers({ data: { tiny_url: 'https://t.3dg.io/xyz' } })
        const preview = 'https://deploy-preview-42--spacewalk-site.netlify.app'

        const response = await post(`${ preview }/?spacewalkSessionURL=blob:abcdef`, { origin: preview })

        expect(response.status).toBe(200)
        expect(response.headers.get('access-control-allow-origin')).toBe(preview)

        const lookalike = 'https://deploy-preview-42--spacewalk-site.netlify.app.evil.example'
        expect((await post(`${ lookalike }/`, { origin: lookalike })).status).toBe(403)
    })

    it('refuses a link to another origin: not a public shortener', async () => {
        const fetch = tinyurlAnswers({})

        const response = await post('https://example.com/anything')

        expect(response.status).toBe(400)
        expect(fetch).not.toHaveBeenCalled()
    })

    it('refuses a body without an absolute url', async () => {
        expect((await post('?spacewalkSessionURL=blob:abcdef')).status).toBe(400)
    })

    it('answers the preflight for an allowed origin only', async () => {
        const preflight = (origin) => worker.fetch(new Request('https://spacewalk.aidenlab.org/shorten', {
            method: 'OPTIONS',
            headers: { origin, 'access-control-request-method': 'POST' },
        }), env)

        const ok = await preflight(ORIGIN)
        expect(ok.status).toBe(204)
        expect(ok.headers.get('access-control-allow-origin')).toBe(ORIGIN)
        expect(ok.headers.get('access-control-allow-methods')).toContain('POST')
        expect((await preflight('https://evil.example')).status).toBe(403)
    })

    it('without the key hands the long link back rather than failing', async () => {
        const fetch = tinyurlAnswers({})
        vi.spyOn(console, 'warn').mockImplementation(() => {})

        const response = await post(LONG_URL, { vars: { TINYURL_API_KEY: undefined } })

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ data: { tiny_url: LONG_URL } })
        expect(fetch).not.toHaveBeenCalled()
    })

    it('reports a TinyURL failure as 502', async () => {
        tinyurlAnswers({ errors: [ 'Unauthenticated.' ] }, 401)
        vi.spyOn(console, 'error').mockImplementation(() => {})

        expect((await post(LONG_URL)).status).toBe(502)
    })

    it('answers 404 off the /shorten path', async () => {
        const response = await worker.fetch(new Request('https://spacewalk.aidenlab.org/other'), env)

        expect(response.status).toBe(404)
    })
})
