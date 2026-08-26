/**
 * How big the Hi-C map in the Juicebox panel is, decided before the session
 * reaches juicebox.
 *
 * `HICBrowser.toJSON()` has never serialized `width`/`height`, so a restored
 * session names neither — only the panel's own `initialize()` passes them.
 * Through juicebox v3.4.2 that omission was invisible: `setViewportSize` wrote
 * `--hic-viewport-width` onto `document.documentElement`, page-wide and never
 * cleared, so the 480 written at boot was inherited by every browser built
 * afterwards. v4 scopes the property to each browser's own `.hic-root` (juicebox
 * issue #477, deferred by its ADR-0004), so an unsized browser now falls back to
 * the 640 in juicebox's stylesheet and the panel came back roughly 160px larger
 * in each dimension after any session load.
 *
 * A module of its own because it is the one piece of the panel that can be
 * answered without a DOM: importing `juiceboxPanel.js` pulls in juicebox, which
 * pulls in igv, which reaches for `document` at import time.
 */

/**
 * Give every browser in `session` the panel's dimensions, unless it names its own.
 *
 * Mutates and returns the session, which is what juicebox's own normalize stage
 * does with the object a host hands it.
 *
 * @param {Object} session - a session naming `browsers`, or a single browser
 *                           config, which is the same thing with its one browser
 *                           inlined — the reading juicebox makes of both shapes
 * @param {{width: number, height: number}} dimensions - the panel's defaults
 * @returns {Object} the same session
 */
export function applyPanelDimensions(session, { width, height }) {

    const configs = session.browsers || [ session ]

    // The v4 spelling of what the old `'{}' === browser` guard caught: a browser
    // with no dataset serialized itself as the string `"{}"` in v3.4.2 and
    // serializes as `null` now, which the registry drops on the way out. Either
    // way the session describes no browser, and the panel still needs one.
    if (0 === configs.length) {
        session.browsers = [ { width, height, queryParametersSupported: false } ]
        return session
    }

    for (const config of configs) {
        config.width = config.width ?? width
        config.height = config.height ?? height
    }

    return session
}
