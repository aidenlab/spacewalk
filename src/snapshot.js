import { uncompressSessionURL } from './sessionURLCodec.js'

/**
 * Decode a snapshot URL — the frozen, Room-free view get_shareable_url returns —
 * from its launch intent (launchIntent.js). Two parameters:
 *
 *   spacewalkSessionURL=blob:…  the spacewalk session block, read as the full app reads it
 *   viewerSettings=blob:…       the viewer settings, kept beside the session (spacewalk-mcp ADR 0002)
 *
 * Both are session strings. The shape of each is in
 * development-notes/spacewalk-mcp/session-format.md.
 *
 * @param {object} intent - parseLaunchIntent's result, of kind 'session'
 * @returns {{ spacewalk: object, viewerSettings: object | undefined } | undefined}
 *          undefined when the intent carries no spacewalk session
 * @throws if the spacewalk session string cannot be read; the ensemble is the
 *         snapshot's spine. Viewer settings are furniture: unreadable ones are dropped.
 */
function readSnapshot(intent) {
    if (!intent.sessions.spacewalk) return undefined
    return {
        spacewalk: JSON.parse(uncompressSessionURL(intent.sessions.spacewalk)),
        viewerSettings: readViewerSettings(intent.viewerSettings),
    }
}

function readViewerSettings(sessionString) {
    if (!sessionString) return undefined
    try {
        return JSON.parse(uncompressSessionURL(sessionString))
    } catch (error) {
        console.warn('Ignoring viewer settings that cannot be read:', error.message)
        return undefined
    }
}

export { readSnapshot }
