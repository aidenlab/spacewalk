import { defineConfig } from "vite"
import { config } from "dotenv"

// Load environment variables from .env file
config()

export default defineConfig({
    define: {
        'process.env.TINYURL_API_KEY': JSON.stringify(process.env.TINYURL_API_KEY)
    },
    build: {
        target: 'es2020'
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
