import { BGZip } from 'igv-utils'

/**
 * Decode a compressed session blob into its JSON string. Two historical forms:
 *   - data URI: '…/gzip;base64,…'
 *   - blob:     'blob:<compressed>'  (the 'blob:' prefix is sliced off)
 *
 * Lives apart from launchIntent.js so the pure URL→intent parser carries no
 * igv-utils dependency and stays unit-testable without a bundler.
 */
function uncompressSessionURL(sessionURL) {
    if (sessionURL.indexOf('/gzip;base64') > 0) {
        const bytes = BGZip.decodeDataURI(sessionURL, undefined)
        let json = ''
        for (let b of bytes) json += String.fromCharCode(b)
        return json
    } else {
        const enc = sessionURL.slice(5)
        return BGZip.uncompressString(enc)
    }
}

export { uncompressSessionURL }
