# URL Shortener

How the Share modal turns a Share URL into a `t.3dg.io` link.

## Why a worker

Until October 2026 the page called TinyURL's API (`api.tinyurl.com/create`) directly, with the
account's key baked into the bundle at build time (`TINYURL_API_KEY` through Vite's `define`).
Since September 2026 TinyURL answers every browser preflight with
`access-control-allow-origin: https://tinyurl.com`, whatever the requesting origin, so the
browser blocks the call on every hostname. Nothing on the page can get around it: every TinyURL
endpoint answers the same way, and only a server can call it. Juicebox hit the same change and
moved to a worker first (juicebox-web `1aa2659`); Spacewalk copies that pattern.

Moving the call to a worker also takes the key out of the bundle, where any visitor could read it.

## How it works

```
Share modal ──POST {url}──▶ spacewalk.aidenlab.org/shorten ──▶ api.tinyurl.com/create
   (no key)                 sw-shortlink worker                (Bearer TINYURL_API_KEY)
            ◀─{data:{tiny_url}}─                                tags: spacewalk, domain: t.3dg.io
```

- **Client**: `src/share/urlShortener.js` posts the bare `{url}` to the endpoint in
  `src/spacewalk-config.js` and reads `data.tiny_url` back. Any failure (network, CORS, non-2xx)
  hands the long URL back with a console warning: a long Share URL still restores the session.
- **Worker**: `workers/sw-shortlink/` (`index.js`, `wrangler.jsonc`), copied from juicebox-web's
  `workers/jb-shortlink` `/shorten` route. It:
  - allows only origins on `ALLOWED_ORIGINS` in `wrangler.jsonc`, plus Netlify deploy previews
    by pattern (`<name>--spacewalk-site.netlify.app`); anything else gets 403;
  - shortens only links to the requesting origin, so it is not a public shortener;
  - with no key set, answers with the long link; on a TinyURL error, answers 502.
- **Tests**: `workers/sw-shortlink/index.test.js` and `src/share/urlShortener.test.js`, run by
  `npm test`.

## Deploying

Netlify does not deploy workers; the worker is deployed by hand:

```sh
npm run deploy:shortlink                                     # wrangler deploy
cd workers/sw-shortlink && npx wrangler secret put TINYURL_API_KEY   # once, or on rotation
```

The first cutover (deploy, new key, curl checks, removing the old Netlify variable, revoking the
old key) is walked through by `workers/sw-shortlink/cutover-wizard.sh`. Run it from the repo
root.

## Adding a hostname

A new hostname that serves Spacewalk gets long Share URLs until it is added to `ALLOWED_ORIGINS`
in `workers/sw-shortlink/wrangler.jsonc` and the worker is redeployed. This includes a
self-hosted copy on someone else's server: it shares long URLs, which is the intended
degradation. Juicebox's `jb-shortlink` keeps its own list; the two do not share one.

## Checking it

```sh
# Preflight from an allowed origin → 204, with that origin echoed back
curl -s -o /dev/null -D - -X OPTIONS https://spacewalk.aidenlab.org/shorten \
  -H "Origin: https://aidenlab.org" -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type" | grep -i -E "^HTTP|allow-origin"

# A real shorten
curl -s -X POST https://spacewalk.aidenlab.org/shorten -H "Origin: https://aidenlab.org" \
  -H "Content-Type: application/json" --data '{"url":"https://aidenlab.org/spacewalk/?check=1"}'
```

`npx wrangler tail` (from `workers/sw-shortlink`) shows the worker's logs.
