# Cloudflare Storage - How To

A general tutorial for storing Spacewalk `.sw` files in our Cloudflare R2 bucket
and serving them over HTTP. Use it any time you need to publish `.sw` files for
remote loading — the steps are the same whether you're seeding the bucket for the
first time or adding a few more files later. The bucket is already created, made
public, and CORS-configured, so this is the repeatable upload + verify procedure.

> ### The one thing that decides which path you take: the 300MB line
>
> There are **two upload paths**, and the deciding factor is file size:
>
> - **Files ≤ 300MB** → upload with `wrangler` (the simple path, [Steps 1–3](#step-1--upload-files--300mb-with-wrangler)).
> - **Files > 300MB** → `wrangler` and the R2 dashboard uploader **cannot** handle
>   them; you must use the S3-compatible endpoint with multipart upload
>   ([Large files section](#large-files-300mb--multipart-upload-via-the-s3-api)).
>
> The 300MB cap is a *tool* limit, not an R2 limit — R2 itself happily stores
> multi-GB (and multi-TB) objects. Pick your path by size and the rest of the
> procedure (verify, URLs, CORS) is identical for both.

---

## Why R2 (and not Dropbox / jsDelivr)

- **Dropbox** charged a per-range-request redirect tax → slow remote `.sw` loads.
- **jsDelivr** Brotli-compresses `application/octet-stream`, which corrupts HDF5
  range reads. Do **not** use it for `.sw`.
- **R2** serves `application/octet-stream` raw and answers byte-range requests
  cleanly — exactly what the HDF5 reader needs.

---

## Fixed facts (already configured, no action needed)

| Thing | Value |
|---|---|
| Bucket name | `spacewalk-fixtures` |
| Cloudflare account | Aidenlab (`Theaidenlab@gmail.com's Account`) |
| Account ID | `1eadb18bb8557fd1bd06b1d0310a902e` |
| Public URL base | `https://pub-398373e8d1204c57beab2ae62ef6cc91.r2.dev` |
| CORS | `GET`/`HEAD`, any origin, `Range` allowed; exposes `Content-Range`, `Content-Length`, `Accept-Ranges`, `ETag` |

> You have **two** Cloudflare accounts (personal + Aidenlab). Every command below
> exports `CLOUDFLARE_ACCOUNT_ID` so `wrangler` targets **Aidenlab**, not personal.

### One-time prerequisites

```bash
# Installed already, but to confirm:
wrangler --version          # expect 4.x
wrangler whoami             # expect douglass.turner@gmail.com, both accounts listed
```

If `whoami` shows you're logged out: `wrangler login`.

---

## What gets uploaded

The examples below use our standard local layout, but the pattern generalizes:
decide a bucket key (root or a prefix) for each group of files, then point the
upload command at the matching local folder.

- **Ball & stick:** every `*.sw` in the **top level** of
  `/Users/turner/SpacewalkDevelopment/data/` → bucket **root**.
- **Pointcloud:** every `*.sw` that is a **direct child** of
  `/Users/turner/SpacewalkDevelopment/data/pointcloud/` → bucket prefix
  `pointcloud/`.
- **Excluded:** the legacy `.swt` files (dead format), and **all subfolders** of
  `pointcloud/` (e.g. `marc-marti-renom/`, `olga-dudchenko/`, and pointcloud's own
  child folders). The `-maxdepth 1` flag enforces this.

> **Mind the 300MB line here.** The `wrangler` steps below only work for files
> ≤ 300MB. Anything larger (in our data set, the Woolly Mammoth and guy-nir
> pointcloud assets) goes through the [Large files](#large-files-300mb--multipart-upload-via-the-s3-api)
> path instead.

---

## Step 1 — Upload files ≤ 300MB with `wrangler` (ball & stick, top level of `data/`)

Lands at bucket root → URL is `<base>/<filename>.sw`.

```bash
cd /Users/turner/SpacewalkDevelopment/data
export CLOUDFLARE_ACCOUNT_ID=1eadb18bb8557fd1bd06b1d0310a902e

for f in *.sw; do
  echo "↑ $f"
  wrangler r2 object put "spacewalk-fixtures/$f" \
    --file "$f" \
    --content-type application/octet-stream \
    --remote
done
```

## Step 2 — Upload pointcloud files (direct children only)

Keyed under `pointcloud/` to mirror local layout and avoid name collisions.
`-maxdepth 1` guarantees no subfolders are swept in.

```bash
cd /Users/turner/SpacewalkDevelopment/data/pointcloud
export CLOUDFLARE_ACCOUNT_ID=1eadb18bb8557fd1bd06b1d0310a902e

find . -maxdepth 1 -type f -name '*.sw' -print0 | while IFS= read -r -d '' f; do
  name="${f#./}"
  echo "↑ pointcloud/$name"
  wrangler r2 object put "spacewalk-fixtures/pointcloud/$name" \
    --file "$f" \
    --content-type application/octet-stream \
    --remote
done
```

> If the pointcloud files use a different extension, change `-name '*.sw'`.

---

## Step 3 — Verify (range request + CORS)

```bash
curl -sI -H "Range: bytes=0-15" -H "Origin: http://localhost:5173" \
  "https://pub-398373e8d1204c57beab2ae62ef6cc91.r2.dev/IMR90_chr21-18-20Mb.sw"
```

Expect to see:

- `HTTP/2 206`  ← partial content (range honored)
- `accept-ranges: bytes`
- `content-range: bytes 0-15/<total>`
- `access-control-allow-origin: *`

If you get `200` instead of `206`, the range wasn't honored — recheck the URL.
If `access-control-allow-origin` is missing, re-apply the CORS policy (below).

---

## Resulting URLs

- Ball & stick:
  `https://pub-398373e8d1204c57beab2ae62ef6cc91.r2.dev/H1-hESC_chr21-0-48Mb.sw`
- Pointcloud:
  `https://pub-398373e8d1204c57beab2ae62ef6cc91.r2.dev/pointcloud/<name>.sw`

---

## Handy ops

**List what's in the bucket:**

```bash
export CLOUDFLARE_ACCOUNT_ID=1eadb18bb8557fd1bd06b1d0310a902e
wrangler r2 object get spacewalk-fixtures --remote   # (per-object)
# or browse in the dashboard: R2 → spacewalk-fixtures
```

**Delete one object:**

```bash
wrangler r2 object delete "spacewalk-fixtures/<key>" --remote
```

**Re-apply CORS** (if verification shows it's missing). Save as `r2-cors.json`:

```json
{
  "rules": [
    {
      "allowed": {
        "origins": ["*"],
        "methods": ["GET", "HEAD"],
        "headers": ["Range"]
      },
      "exposeHeaders": ["Content-Range", "Content-Length", "Accept-Ranges", "ETag"],
      "maxAgeSeconds": 86400
    }
  ]
}
```

```bash
wrangler r2 bucket cors set spacewalk-fixtures --file r2-cors.json
```

---

## Faster bulk option (optional) — rclone

`wrangler ... put` is one sequential request per file (~33 files = a couple
minutes). For concurrent, resumable uploads use `rclone` against R2's
S3-compatible endpoint. You'll need an R2 **API token** (Access Key ID + Secret)
from the Cloudflare dashboard: R2 → Manage R2 API Tokens.

> **Two settings that cost us a string of 403s — get them right up front:**
> 1. The token must be **Object Read & Write** (or Admin R/W). A read-only token
>    lists fine but every `PutObject` / `CreateMultipartUpload` returns
>    `403 AccessDenied`. (`wrangler`'s login creds do *not* carry over to the S3
>    endpoint — this token is separate.)
> 2. The `endpoint=` line is **mandatory**. Without it rclone defaults to AWS S3,
>    and you get `InvalidAccessKeyId: ...does not exist in our records`.
> 3. Set **`no_check_bucket=true`** — a bucket-scoped token can't do the
>    account-level bucket check rclone runs first, which would otherwise 403.

```bash
brew install rclone

rclone config create r2 s3 \
  provider=Cloudflare \
  access_key_id=<R2_ACCESS_KEY_ID> \
  secret_access_key=<R2_SECRET_ACCESS_KEY> \
  endpoint=https://1eadb18bb8557fd1bd06b1d0310a902e.r2.cloudflarestorage.com \
  acl=private \
  no_check_bucket=true

# Sanity-check creds before uploading. NOTE: `rclone lsd r2:` (list all buckets)
# is an account-level call a bucket-scoped token CANNOT make — a 403 there is
# expected and fine. Test the bucket directly instead:
rclone ls r2:spacewalk-fixtures | head     # should list existing objects

# Ball & stick (top level only — no recursion into subfolders)
rclone copy /Users/turner/SpacewalkDevelopment/data r2:spacewalk-fixtures \
  --include '/*.sw' --progress --transfers 8

# Pointcloud (direct children only)
rclone copy /Users/turner/SpacewalkDevelopment/data/pointcloud r2:spacewalk-fixtures/pointcloud \
  --include '/*.sw' --progress --transfers 8
```

The leading `/` in `--include '/*.sw'` anchors to the source root, so subfolders
are skipped.

---

## Large files (>300MB) — multipart upload via the S3 API

`wrangler r2 object put` (and the R2 dashboard uploader) cap a single object at
**~300MB**. That is a *tool* limit, not an R2 limit. R2's real S3 API limits are:

| Path | Limit |
|---|---|
| Single `PUT` | up to ~5 GiB |
| **Multipart upload** | up to **10,000 parts**, each part 5 MiB–5 GiB → ~5 TiB/object |

So for any file over the 300MB line, skip `wrangler` and upload through R2's
**S3-compatible endpoint**, which does multipart automatically. In our data set
the files that need this are:

| Local file | Size | Needs multipart |
|---|---|---|
| `olga-dudchenko/Woolly_Mammoth_MiChroM.sw` | **89 GB** | yes (+ chunk bump, see below) |
| `olga-dudchenko/Woolly_Mammoth_Direct_Inv.sw` | 2.2 GB | yes |
| `olga-dudchenko/GSE268050_Woolly_Mammoth_Direct_Inv.sw` | 1.1 GB | yes |
| `pointcloud/guy-nir/guy-nir-salmonella-humungous.sw` | 846 MB | yes |
| `pointcloud/guy-nir/guy-nir-salmonella-pointcloud-21-apr-2026.sw` | 846 MB | yes |

> The `1.3G guy-nir-salmonella-humungous.swt` is the legacy `.swt` format —
> **excluded**, same as everywhere else in this doc.

### Use the rclone `r2` remote (same one configured above)

Both `rclone` and the AWS CLI chunk large files into a multipart upload, run the
parts concurrently, and retry/abort correctly on failure. That last part matters:
the R2 docs warn that **re-uploading the same part number replaces the previous
part, and a failed retry loses the original** — these clients handle that for you,
which is exactly why you don't hand-roll `UploadPart` calls.

```bash
# guy-nir pointcloud big files → pointcloud/guy-nir/<name>
rclone copy /Users/turner/SpacewalkDevelopment/data/pointcloud/guy-nir \
  r2:spacewalk-fixtures/pointcloud/guy-nir \
  --include '/*.sw' --progress --transfers 4 --s3-chunk-size 64M

# olga-dudchenko big files → olga-dudchenko/<name>
rclone copy /Users/turner/SpacewalkDevelopment/data/olga-dudchenko \
  r2:spacewalk-fixtures/olga-dudchenko \
  --include '/*.sw' --progress --transfers 4 --s3-chunk-size 64M
```

The leading `/` in `--include '/*.sw'` keeps it to direct children (no recursion
into `tracks/`, `chr9/`, etc.). Adjust the bucket prefixes if you want a different
key layout.

### The 89GB gotcha — chunk size

R2 allows at most **10,000 parts**. At rclone's default 5 MiB chunk,
89 GB ÷ 5 MiB ≈ **18,000 parts → upload rejected**. `--s3-chunk-size 64M` gives
~1,400 parts and clears the limit comfortably (rclone also auto-raises chunk size
for known-size local sources, but set it explicitly so it's not a surprise).
Minimum chunk to stay under 10,000 parts for 89 GB is ~9.3 MiB; 64M is a safe,
fast choice.

### AWS CLI alternative

If you'd rather use the AWS CLI, it auto-switches to multipart too:

```bash
aws s3 cp /Users/turner/SpacewalkDevelopment/data/olga-dudchenko/Woolly_Mammoth_MiChroM.sw \
  s3://spacewalk-fixtures/olga-dudchenko/Woolly_Mammoth_MiChroM.sw \
  --endpoint-url https://1eadb18bb8557fd1bd06b1d0310a902e.r2.cloudflarestorage.com \
  --profile r2

# Raise the per-part size so the 89GB file stays under 10,000 parts:
aws configure set s3.multipart_chunksize 64MB --profile r2
```

(`--profile r2` uses the same R2 API token Access Key ID + Secret as the rclone
remote.)

### Resulting URLs

- `https://pub-398373e8d1204c57beab2ae62ef6cc91.r2.dev/pointcloud/guy-nir/<name>.sw`
- `https://pub-398373e8d1204c57beab2ae62ef6cc91.r2.dev/olga-dudchenko/<name>.sw`

Verify each with the same range-request `curl` from Step 3 — a `206` with a
`content-range` header confirms the multipart object reassembled correctly and
serves byte ranges.

### Troubleshooting 403s (the exact sequence we hit)

The errors *change* as you fix each layer — read which one you're getting:

| Error | Cause | Fix |
|---|---|---|
| `InvalidAccessKeyId: ...does not exist in our records` | No `endpoint` → rclone hit AWS, not R2 | `rclone config update r2 endpoint=https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `ListBuckets ... AccessDenied` | Account-level call a bucket-scoped token can't make | **Expected** — ignore. Test `rclone ls r2:spacewalk-fixtures` instead |
| `PutObject` / `CreateMultipartUpload ... AccessDenied` | Token is **read-only** | Recreate token as **Object Read & Write**, then `rclone config update r2 access_key_id=… secret_access_key=…` |
| `HeadBucket`-style 403 on upload | rclone's pre-flight bucket check | `rclone config update r2 no_check_bucket=true` |

Quick write test before a big run (single-part, no multipart):

```bash
echo test > /tmp/r2-write-test.txt
rclone copy /tmp/r2-write-test.txt r2:spacewalk-fixtures/ -v   # clean transfer = writes work
rclone delete r2:spacewalk-fixtures/r2-write-test.txt          # clean up
```

---

## Next step (separate task)

Once the files are up, the **in-app file list** needs its URLs rewritten to point
at the R2 base. That's an edit inside the spacewalk repo (locate the manifest →
swap the URLs) — not part of this upload procedure.
