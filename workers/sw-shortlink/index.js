// The Share modal's shortener.
//
//   POST https://spacewalk.aidenlab.org/shorten {url}
//                                          -> {data: {tiny_url}}: the Share URL on t.3dg.io
//
// TinyURL's API answers every browser preflight with
// access-control-allow-origin: https://tinyurl.com (since September 2026), so the page cannot
// call it; it posts here instead and this worker calls TinyURL with the account's key, which
// is a `wrangler secret` (TINYURL_API_KEY) rather than a string in the client bundle.
//
// Only the app's own hostnames (ALLOWED_ORIGINS in wrangler.jsonc, plus Netlify deploy
// previews) may call it, and a page may only shorten links to its own origin, so this is not
// a public shortener for the account behind t.3dg.io. The answer keeps TinyURL's shape, which
// is what src/share/urlShortener.js reads.
//
// Copied from juicebox-web's workers/jb-shortlink (its /shorten route). A fix in one is worth
// a look in the other.

const SHORTEN_PATH = '/shorten'
const TINYURL_CREATE = 'https://api.tinyurl.com/create'

// Netlify deploy previews and branch deploys: deploy-preview-42--spacewalk-site.netlify.app,
// some-branch--spacewalk-site.netlify.app.
const NETLIFY_PREVIEW = /^https:\/\/[a-z0-9-]+--spacewalk-site\.netlify\.app$/

function originAllowed(origin, env) {
    return Boolean(origin) && ((env.ALLOWED_ORIGINS ?? []).includes(origin) || NETLIFY_PREVIEW.test(origin))
}

function problem(status, message) {
    return new Response(`${message}\n`, {
        status,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
    })
}

async function shorten(request, env) {
    const origin = request.headers.get('origin')
    if (!originAllowed(origin, env)) {
        return problem(403, 'Origin not allowed.')
    }
    const headers = {
        'access-control-allow-origin': origin,
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': 'content-type',
        vary: 'origin',
    }
    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers })
    }
    if (request.method !== 'POST') {
        return new Response('Method not allowed.\n', { status: 405, headers: { ...headers, allow: 'POST, OPTIONS' } })
    }

    let target
    try {
        target = new URL((await request.json()).url)
    } catch {
        return Response.json({ error: 'Body must be JSON {url} with an absolute url.' }, { status: 400, headers })
    }
    if (target.origin !== origin) {
        return Response.json({ error: 'Only links to the requesting origin are shortened.' }, { status: 400, headers })
    }

    // No key: hand the long link back rather than fail. A long Share URL still works.
    if (!env.TINYURL_API_KEY) {
        console.warn('TINYURL_API_KEY is not set; returning the link unshortened.')
        return Response.json({ data: { tiny_url: target.href } }, { headers })
    }

    const response = await fetch(TINYURL_CREATE, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${env.TINYURL_API_KEY}` },
        body: JSON.stringify({ url: target.href, domain: env.TINYURL_DOMAIN ?? 't.3dg.io', tags: [ 'spacewalk' ] }),
    })
    if (!response.ok) {
        console.error(`TinyURL answered ${response.status} ${response.statusText}`)
        return Response.json({ error: 'Shortening failed.' }, { status: 502, headers })
    }
    const { data } = await response.json()
    return Response.json({ data: { tiny_url: data.tiny_url } }, { headers })
}

export default {
    async fetch(request, env) {
        if (new URL(request.url).pathname === SHORTEN_PATH) {
            return shorten(request, env)
        }
        return problem(404, 'Not found.')
    },
}
