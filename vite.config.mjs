import { defineConfig } from "vite"
import { config } from "dotenv"
import { fileURLToPath } from "node:url"

// Load environment variables from .env file
config()

// Server half of the juicebox.js dev proxy — what lets the "ENCODE Hosted
// Contact Map" menu work from localhost. The client half is in src/main.js.
// Rationale: development-notes/encode-waf-dev-proxy.md.
//
// Loaded only when serving, and deliberately not as a top-level import. The
// plugin is `apply: 'serve'`, so a production build has no use for it — but a
// static import would still have to *resolve* it, which makes `vite build`
// hard-fail wherever the module isn't present. That is not hypothetical: CI
// restored a node_modules cache predating the juicebox bump, `npm install`
// reported "up to date" without fetching (see the tag-pin trap in
// development-notes/testing-npm-dependencies.md), and the build died on
// `Missing "./dev-proxy/plugin" specifier` before the config even loaded.
// Nothing dev-only should be able to break a production build.
async function devOnlyPlugins(command) {

    if ('serve' !== command) {
        return []
    }

    // The specifier is assembled from parts rather than written as a literal,
    // and that is load-bearing rather than stylistic. Vite *bundles* this config
    // before running it, and that pass resolves static `import()` specifiers too
    // — so a literal is resolved before `command` is ever consulted, and fails
    // the production build exactly as a top-level import would. Assembled, it is
    // invisible to that pass and resolves through Node at call time, which only
    // happens when serving.
    const specifier = [ 'juicebox.js', 'dev-proxy', 'plugin' ].join('/')

    try {
        const { devProxy } = await import(specifier)
        return [ devProxy() ]
    } catch (e) {
        // Dev-only convenience: never take the dev server down over it. The cost
        // of it being absent is that ENCODE-hosted maps won't load from
        // localhost — worth a warning, not a crash.
        console.warn(`Dev proxy unavailable (${e.message}). ENCODE-hosted contact maps will not load from localhost.`)
        return []
    }
}

export default defineConfig(async ({ command }) => ({
    plugins: await devOnlyPlugins(command),
    define: {
        'process.env.TINYURL_API_KEY': JSON.stringify(process.env.TINYURL_API_KEY)
    },
    resolve: {
        alias: {
            // hic-straw's swParser uses a runtime-conditional dynamic import of
            // the Node vs browser build of hdf5-indexed-reader. Rollup keeps
            // both branches in the bundle and the Node variant pulls in
            // node-fetch / node:fs. Redirect the Node variant to the browser
            // ESM so the browser bundle resolves cleanly.
            'hdf5-indexed-reader/dist/hdf5-indexed-reader.node.mjs':
                'hdf5-indexed-reader/dist/hdf5-indexed-reader.esm.js'
        }
    },
    build: {
        target: 'es2020',
        sourcemap: true
    },
    server: {
        sourcemapIgnoreList: false  // Don't ignore source maps from node_modules
    },
    css: {
        preprocessorOptions: {
            scss: {
                api: 'modern-compiler', // or "modern", "legacy"
                importers: [
                    // ...
                ],
            },
        },
    },
    // Read by Vitest, ignored by Vite. `igv-utils` declares only `module` --
    // no `main`, no `exports` -- which Vite's dev/build resolver honours and
    // Vitest's node-side resolver does not, so an unmocked import of it fails
    // with "Failed to resolve entry for package". Every test before
    // sessionURLCodec.test.js mocked igv-utils away and never met this; that
    // one exercises the real BGZip against juicebox's shared fixture corpus,
    // which is the point of it. Aliased to the file the `module` field names,
    // matching what juicebox.js's own vitest config does.
    test: {
        alias: {
            'igv-utils': fileURLToPath(new URL('./node_modules/igv-utils/src/index.js', import.meta.url))
        }
    },
    optimizeDeps: {
        // Skip pre-bundling hic-straw so local rebuilds of its dist propagate
        // without having to nuke node_modules/.vite. Safe because hic-straw
        // ships ESM. Only affects `vite` dev; prod builds re-bundle from source.
        exclude: ['hic-straw']
    }

}))
