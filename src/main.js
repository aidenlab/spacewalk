/**
 * Entry point for Spacewalk application.
 */
import App from "./app.js"
import hic from 'juicebox.js'
import * as bootstrap from 'bootstrap'
import 'bootstrap/dist/css/bootstrap.min.css'
import 'juicebox.js/dist/css/juicebox.css'
import 'infinite-table/css/infinite-table.css'
import './styles/app.scss'
import {isWebGL2Supported} from "./utils/utils"
import AlertSingleton from "./widgets/alertSingleton.js"
import { presentResourceError } from "./widgets/presentResourceError.js"

// Expose Bootstrap as a global. App code and the infinite-table dependency
// reference `bootstrap.Modal`/`bootstrap.Tab` as a global (previously the
// CDN <script>); keep that contract while Vite bundles the library.
window.bootstrap = bootstrap

// Global safety net: anything that escapes a call site — an unhandled promise
// rejection or an uncaught exception — lands here instead of dying silently on
// the console with the spinner left spinning. Resource (img/script) load errors
// arrive on the 'error' event with no .error; leave those to their own handlers.
window.addEventListener('unhandledrejection', event => {
    presentResourceError(event.reason, {})
})

window.addEventListener('error', event => {
    if (event.error instanceof Error) {
        presentResourceError(event.error, {})
    }
})

// Client half of the juicebox.js dev proxy (server half is the Vite plugin in
// vite.config.mjs). It rewrites reads of WAF-gated hosts — ENCODE among them —
// onto the dev server, which can send the Origin and User-Agent a browser
// cannot. Hosts it doesn't claim keep fetching directly, so a genuine CORS
// problem still surfaces in development exactly as it would in production.
//
// The DEV check has to live here, not inside juicebox.js: juicebox ships a
// production-baked dist whose own `import.meta.env.DEV` is already false. Vite
// folds this constant away in a production build, taking the dynamic import
// with it, so production registers no mapper at all — and with none registered
// juicebox's mapping path hands back the caller's own object.
//
// Sessions are unaffected: juicebox serializes the original URLs
// (`unmappedUrls`), so a session saved in development carries no proxy path.
async function registerDevURLMapper() {
    if (import.meta.env.DEV) {
        const { devMapUrl } = await import('juicebox.js/dev-proxy/map-url')
        hic.setUrlMapper(devMapUrl)
    }
}

document.addEventListener("DOMContentLoaded", async (event) => {

    // Ahead of App, so the mapper is in place before any map or track read.
    await registerDevURLMapper()

    // Build the draggable alert dialog up front. Without this init the
    // AlertSingleton used by presentResourceError (and the file/track/genome
    // widgets) has no backing dialog and every present() throws — failures then
    // fall back to console only. Must run before anything that can fail.
    AlertSingleton.init(document.body)

    if (isWebGL2Supported()) {
        console.log("WebGL 2.0 is supported. Compute Like a Boss! 🎉");
    } else {
        console.log("WebGL 2.0 is NOT supported. 😢");
    }

    const main = new App();
    await main.initialize();
});
