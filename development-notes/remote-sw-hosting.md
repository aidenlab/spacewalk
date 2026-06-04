# Remote `.sw` Hosting — Constraints, Alternatives, Decisions

**Status: Current** (decisions as of 2026-06-04)

Where the demo / fixture `.sw` files referenced by the app are hosted, why the host
matters more than you'd expect, and what we chose. Read this before adding a new remote
`.sw` URL anywhere (the **File → Load From List** dropdown, shipped session JSONs, demos).

---

## The problem we hit

Remote `.sw` files loaded *agonizingly* slowly — one 2.5 MB file took **160 seconds**;
larger ones were worse. The instinct ("Dropbox preview URL", "the 3D model is big",
"the genome resources are slow") was wrong in every case.

**Root cause:** `.sw` is HDF5, and the `hdf5-indexed-reader` does **not** bulk-download
the file. It walks the HDF5 superblock → b-tree → heap → chunk index via **many small
HTTP Range requests**. So the host's *per-request* behavior is what dominates, not its
bulk throughput. A single `curl` of the whole file looks fast (~2 s) and **hides the
problem** — you have to measure a Range request.

Dropbox (`www.dropbox.com/...&dl=0`) is terrible at this:
- It **re-runs a 2-hop redirect on every request** (`www.dropbox.com` → signed
  `dl.dropboxusercontent.com`), ~1.6 s each.
- It serves from a **far origin with no edge cache** (`x-dropbox-response-origin:
  far_remote`, `cache-control: max-age=60`).

~100 range requests × ~1.6 s ≈ the observed 160 s. The direct `dl.dropboxusercontent.com`
host removes the redirect but is still slow/flaky (0.6–2.2 s/req, occasional 30 s stalls).
**Dropbox is not a CDN. Don't host range-read binaries on it.**

## What a host MUST satisfy for `.sw`

A candidate host has to pass **all** of these, or HDF5 loading breaks or crawls:

1. **HTTP Range requests** → returns `206 Partial Content` with the requested bytes.
2. **No on-the-fly compression of the bytes.** This one is subtle and bit us hard — see
   the jsDelivr trap below. If the host applies `Content-Encoding: gzip/br`, a `Range`
   request returns bytes from the *compressed* stream; the reader reads them as raw HDF5
   and fails with **"Incorrect file signature"**.
3. **CORS** → `Access-Control-Allow-Origin` present (the app fetches cross-origin).
4. **Low TTFB / CDN-fronted** → range requests are serialized-ish, so per-request latency
   multiplies. Want ~tens of ms, not hundreds.
5. **Durable, stable URLs** → no ephemeral signed tokens that expire.

### The jsDelivr trap (why a "real CDN" still failed)

jsDelivr (`cdn.jsdelivr.net/gh/...` **and** `/npm/...`) **Brotli-compresses
`application/octet-stream` on the fly.** Browsers always send `Accept-Encoding: br`, so:

```
range 0-7, Accept-Encoding: br     → 9bc57e447541c0c6   (brotli garbage)
range 0-7, no Accept-Encoding      → 894844460d0a1a0a   (real HDF5 magic)
```

The reader gets compressed bytes → "Incorrect file signature". **jsDelivr is unusable for
`.sw` on any path, independent of its file-size cap.** This rules out the otherwise-nice
"publish as npm package, serve via jsDelivr" idea too.

## Alternatives evaluated

| Host | Range 206? | Compresses octet-stream? | CORS | Per-file cap | Verdict |
|---|---|---|---|---|---|
| **Dropbox** (`dl=0`) | ✅ | no | ✅ | none | ❌ per-request redirect tax + far origin → ~160 s |
| **jsDelivr `/gh/`** | ✅ | **yes (Brotli)** | ✅ | 20 MB | ❌ corrupts HDF5; also 20 MB cap |
| **jsDelivr `/npm/`** | ✅ | **yes (Brotli)** | ✅ | 150 MB pkg | ❌ corrupts HDF5; also needs an npm account (aidenlab has none) |
| **raw.githubusercontent.com** | ✅ | **no** | ✅ `*` | 100 MB (git) | ✅ Fastly-fronted ~0.035 s TTFB, `max-age=300`. **CHOSEN for small fixtures** |
| **S3 + CloudFront** | ✅ | no (octet-stream not compressed by default) | configurable | none | ✅ best general answer; infra you run |
| **Cloudflare R2** | ✅ | no | configurable | none | ✅ best general answer; no egress fees; infra you run |

Measured range TTFB for reference: Dropbox ~1.6 s · raw.githubusercontent ~0.035 s ·
igv.org CDN ~0.13 s. The CDN hosts are ~40× faster *per request*, which is what matters.

## Decisions

### Small fixtures (now) → `raw.githubusercontent.com`

The **Load From List** dropdown's four small ensembles (4–17 MB) are committed to the
public repo [`aidenlab/spacewalk-fixtures`](https://github.com/aidenlab/spacewalk-fixtures)
and served via:

```
https://raw.githubusercontent.com/aidenlab/spacewalk-fixtures/<tag>/<file>.sw
```

Pinned to tag `v1.0.0`. Why raw (not jsDelivr): it doesn't compress, so HDF5 range reads
are byte-exact. URLs live in `src/spacewalkFileLoadWidgetServices.js`
(`createAndConfigureTraceSelectModal`).

**Why a dedicated repo, not `data/` in `aidenlab/spacewalk`:** avoids permanently bloating
the active code repo's git history with binary blobs.

**Do NOT use Git LFS for these:** raw / CDNs serve the LFS *pointer text*, not the bytes —
silent corruption. Fixtures must be normal committed files.

### Larger files (deferred) → S3 / CloudFront or Cloudflare R2

These ball-and-stick fixtures are small. **Point-cloud `.sw` and multi-trace ball-and-stick
models are much larger and will blow past every "free" tier's practical limits**
(raw/git's 100 MB hard cap, jsDelivr's 20 MB, and jsDelivr is out anyway). Two files were
already dropped from the dropdown for exceeding the 20 MB jsDelivr cap when jsDelivr was
still in the running (K562 46.8 MB, HCT116 6h-auxin 24.7 MB).

When we need to host large `.sw` (or the shipped session JSONs' `.sw`/`.hic`), the robust
home is **object storage behind a CDN we control**:

- **AWS S3 + CloudFront** — canonical; native range support, octet-stream uncompressed by
  default, configurable cache/CORS.
- **Cloudflare R2** — same properties, **no egress fees** (attractive for large files
  served to many users).

Both satisfy the five constraints above and have no per-file cap. **npm-via-jsDelivr is
permanently off the table for `.sw`** (compression). raw.githubusercontent is fine for
small files but isn't ideal at scale (5-min cache, GitHub's softer rate limits, 100 MB
git cap).

### Secondary win, unrelated to hosting: the `igv` reference block in session JSONs

Older session files pin `hgdownload.soe.ucsc.edu` (a throttled academic server) for the
835 MB hg38 2bit and an `"indexed": false` 7.3 MB Refseq track (whole-genome
download + parse). Faster, and unrelated to the `.sw` host:

- `twoBitURL` → `https://igv.org/genomes/data/hg38/hg38.2bit` (igv CDN)
- Refseq track → indexed `https://s3.amazonaws.com/igv.org.genomes/hg38/ncbiRefSeq.sorted.txt.gz`
  + `.tbi`, `"indexed": true`
- drop `chromSizesURL` (the 2bit header carries chromosome sizes)
- cytoband / alias were already on fast S3 — leave them

Note: igv's *own* default `hg38` manifest also points at UCSC, so `"genome": "hg38"`
alone does **not** fix this — you must specify the fast URLs explicitly.
