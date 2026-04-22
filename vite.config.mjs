import { defineConfig } from "vite"
import { config } from "dotenv"

// Load environment variables from .env file
config()

export default defineConfig({
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
        esbuildOptions : {
            target: "es2020"
        }
    }

})
