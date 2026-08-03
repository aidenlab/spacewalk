import { defineConfig } from "vite"
import { config } from "dotenv"
import { devProxy } from 'juicebox.js/dev-proxy/plugin'

// Load environment variables from .env file
config()

export default defineConfig({
    // ENCODE fronts www.encodeproject.org with a WAF that answers any request
    // whose Origin is not on its allowlist with a bot challenge — surfacing as a
    // misleading 405. localhost is never on that allowlist, so the "ENCODE Hosted
    // Contact Map" menu cannot work in development without this. The plugin is
    // `apply: 'serve'`, so it can never enter a production build; the client half
    // that rewrites URLs onto it is registered in main.js, gated on DEV.
    //
    // Production is unaffected either way: Spacewalk is served from the
    // allowlisted aidenlab.org.
    plugins: [ devProxy() ],
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
    optimizeDeps: {
        // Skip pre-bundling hic-straw so local rebuilds of its dist propagate
        // without having to nuke node_modules/.vite. Safe because hic-straw
        // ships ESM. Only affects `vite` dev; prod builds re-bundle from source.
        exclude: ['hic-straw']
    }

})
