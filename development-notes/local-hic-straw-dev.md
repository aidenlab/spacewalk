# Local hic-straw development with Spacewalk

When iterating on hic-straw locally and testing the changes in Spacewalk, the naive loop is:

1. Edit source in `~/SpacewalkDevelopment/hic-straw/src/`
2. `npm run build` in hic-straw
3. `cp dist/hic-straw.{esm,cjs}.js ~/SpacewalkDevelopment/spacewalk/node_modules/hic-straw/dist/`
4. Reload the browser

Spacewalk's `package.json` pins hic-straw to a GitHub tag (e.g. `github:aidenlab/hic-straw#v2.2.0`), so a plain `npm install` will clobber these drop-ins. `npm link` is the alternative if you prefer a persistent symlink.

## The Vite dep-cache gotcha

On first `npm run dev`, Vite pre-bundles all dependencies into `node_modules/.vite/deps/` (hic-straw becomes `hic-straw.js` there). The pre-bundled artifact is cached aggressively — hot-swapping files inside `node_modules/hic-straw/dist/` does **not** invalidate it. The dev server will keep serving the stale pre-bundled copy, which makes your changes silently disappear in the browser.

Symptom: you rebuild hic-straw, copy the dist, reload, and the code behaves exactly as it did before your change.

This is **not** a hic-straw problem — it's how Vite's dep optimizer works with any dependency. It happens the same way whether hic-straw is built with Vite, Rollup, esbuild, or anything else. The cache keys on the output bundle, not the toolchain.

### Fix already applied to this repo

`vite.config.mjs` excludes hic-straw from dep pre-bundling:

```js
optimizeDeps: {
    exclude: ['hic-straw'],
    // ...
}
```

With this in place, the loop works as expected: rebuild hic-straw, copy the dist, reload. No cache flush needed. Prod builds (`npm run build`) re-bundle from source every time and are unaffected by this setting.

### If the symptom returns

1. Confirm the fresh dist is actually in `node_modules/hic-straw/dist/hic-straw.esm.js`:
   ```
   grep <some-string-from-your-change> node_modules/hic-straw/dist/hic-straw.esm.js
   ```
2. If the string is present there but not reflected in the browser, clear the Vite cache and restart:
   ```
   rm -rf node_modules/.vite
   npm run dev
   ```
   Or run `npm run dev -- --force` once.
3. Confirm `optimizeDeps.exclude` still includes `'hic-straw'` in `vite.config.mjs`.

## Why hic-straw also uses Vite

hic-straw's own `vite.config.lib.js` wraps Rollup to produce the library dist, and a separate `index.html` demo page uses Vite's dev server. Neither of these affects Spacewalk — Spacewalk only consumes the built `dist/*.esm.js`. There's no coupling between hic-straw's dev setup and Spacewalk's.
