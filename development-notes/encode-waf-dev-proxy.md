# The ENCODE WAF and the juicebox.js dev proxy

Why Spacewalk registers a dev-only URL mapper, and why it can't live in juicebox.js.

Adopted August 2026 (issue #77) alongside the bump to `hic-straw#v4.0.0` /
`juicebox.js#v3.6.0` — the exports it needs ship in those versions.

## The problem

ENCODE fronts `www.encodeproject.org` with AWS WAF. The WAF serves a bot
challenge to any request that pairs a **browser** `User-Agent` with an `Origin`
that is not on its allowlist. `localhost` is never on that allowlist, so
Spacewalk's "ENCODE Hosted Contact Map" menu could not work in development at
all.

The failure is badly disguised. It arrives as a bare `405 Method Not Allowed`
from `awselb/2.0` — a status that invites you to go looking for a CORS
preflight or a wrong verb. The only honest signal is a response header:

```
HTTP/2 405
server: awselb/2.0
x-amzn-waf-action: captcha
access-control-expose-headers: x-amzn-waf-action
```

Two details make the diagnosis slippery:

- **`curl` doesn't reproduce it.** curl's own User-Agent isn't a browser one, so
  the WAF lets it through with a `307` even from a localhost `Origin`. You have
  to pass a browser UA *and* a non-allowlisted Origin to see the failure.
- **A spoofed browser UA makes it worse, not better.** Measured against ENCODE:
  with an allowlisted Origin, an honest UA, a Firefox UA and no UA at all all
  return `307`, but `Chrome/126.0.0.0` draws a **502**.

Full upstream diagnosis: aidenlab/juicebox.js#443.

## The fix, in two halves

**Server half** — `vite.config.mjs` registers `devProxy()` from
`juicebox.js/dev-proxy/plugin`. It mounts middleware on `/__hic-proxy/<target>`
that refetches the target from Node, where the `Origin` and `User-Agent` headers
are ours to set. It's `apply: 'serve'`, so it cannot enter a production build.

**Client half** — `src/main.js` registers `devMapUrl` from
`juicebox.js/dev-proxy/map-url` via `hic.setUrlMapper`, behind
`import.meta.env.DEV`. The mapper rewrites only hosts known to gate
(`www.encodeproject.org`, `hicfiles.s3.amazonaws.com`,
`dnazoo.s3.amazonaws.com`); everything else keeps fetching directly, so a
genuine CORS or permissions bug still surfaces in development exactly as it
would in production.

**The DEV check has to live in Spacewalk.** juicebox.js ships a
production-baked `dist` whose own `import.meta.env.DEV` is already `false`, so
it cannot detect *this* app's dev mode. Vite folds our constant away in a
production build and drops the dynamic imports with the branch — the production
bundle contains no proxy code at all (`grep __hic-proxy dist/assets/*.js`
returns nothing).

For ENCODE the proxy is not a data path. The gated request answers with a
redirect to signed S3 storage, which the middleware hands straight back; the
browser follows it and reads the map bytes directly. The map never crosses
Node, so nothing there can corrupt a `206 Partial Content` or its
`Content-Range` — which would break `.hic` reading outright. This is *not* true
of the UA-gated buckets (hicfiles, dnazoo): those serve objects directly, so for
them the dev server really is the data path.

## Sessions stay clean

A session saved while the mapper is registered must not bake `localhost` proxy
paths into the file. It doesn't, in two independent places:

- **The map URL.** Mapping happens inside hic-straw's file reader
  (`this.url = this.config.mapUrl ? this.config.mapUrl(t) : t`), not on the
  config. `Dataset.loadDataset` assigns the original config URL afterward, so
  `browser.toJSON()` serializes the real host.
- **Track URLs.** juicebox v3.6.0 rewrites a *copy* of each track config and
  stashes the originals in `unmappedUrls`, which `toJSON` serializes instead.

Spacewalk's `src/sessionServices.js` only wraps `hic.toJSON()` /
`hic.compressedSession()` and adds no URL of its own, so both save paths inherit
this. A session saved in development reloads at the real host, in dev and from a
production build alike.

## Production is unaffected

Spacewalk is served from `aidenlab.org`, which is allowlisted. With no mapper
registered, juicebox's mapping path hands back the caller's own object.

**Latent risk:** that safety rests entirely on the domain. If Spacewalk ever
moved to its own domain it would start failing against ENCODE maps the day it
moved — no code change to blame, and the dev proxy is dev-only, so there'd be no
fallback. If a domain move is ever planned, aidenlab/juicebox.js#443 becomes
urgent.

## Scope

The mapper is juicebox-scoped. Spacewalk's separate igv.js browser — the ENCODE
*track* menu, `src/widgets/encodeTrackDatasourceConfigurator.js` — is not
proxied, and would hit the same WAF for a gated track. Not a problem today; the
obvious next gap if it becomes one.

## Reproducing

With the dev server up:

```bash
U=https://www.encodeproject.org/files/ENCFF706SFK/@@download/ENCFF706SFK.hic

# The failure: browser UA + localhost Origin -> 405 / x-amzn-waf-action: captcha
curl -s -o /dev/null -D - -H "Origin: http://localhost:5173" \
  -H 'User-Agent: Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/126.0.0.0' \
  -H 'Range: bytes=0-99' "$U"

# Through the proxy: 307 to signed S3, and the bytes read back as a .hic
curl -sL -H 'Range: bytes=0-15' "http://localhost:5173/__hic-proxy/$U" | xxd
# 00000000: 4849 4300 0800 0000 ...   ->  "HIC", version 8
```
