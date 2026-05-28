/**
 * Entry point for Spacewalk application.
 */
import App from "./app.js"
import * as bootstrap from 'bootstrap'
import 'bootstrap/dist/css/bootstrap.min.css'
import 'juicebox.js/dist/css/juicebox.css'
import '../styles/app.scss'
import {isWebGL2Supported} from "./utils/utils"

// Expose Bootstrap as a global. App code and the data-modal dependency
// reference `bootstrap.Modal`/`bootstrap.Tab` as a global (previously the
// CDN <script>); keep that contract while Vite bundles the library.
window.bootstrap = bootstrap

document.addEventListener("DOMContentLoaded", async (event) => {

    if (isWebGL2Supported()) {
        console.log("WebGL 2.0 is supported. Compute Like a Boss! 🎉");
    } else {
        console.log("WebGL 2.0 is NOT supported. 😢");
    }

    const main = new App();
    await main.initialize();
});
