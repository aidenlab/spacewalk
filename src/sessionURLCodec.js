import { BGZip } from 'igv-utils'

/**
 * The compressed spellings this app reads, and how much of each is prefix.
 *
 * All three of Spacewalk's session parameters carry `BGZip.compressString`
 * output under a `blob:` prefix — that is what `getShareURL` writes for
 * Spacewalk's own session, igv's and juicebox's alike. `data:` is here because
 * juicebox accepts it and a juicebox session may arrive spelled that way.
 *
 * Keyed by prefix and stripped by the key's own length. The previous
 * `slice(5)` happened to be right for both keys and was right by coincidence:
 * it was written for `blob:` and would silently mangle any prefix of another
 * length.
 */
const COMPRESSED_PREFIXES = [ 'blob:', 'data:' ]

/**
 * The marker of a real data URI — `data:application/gzip;base64,…` — as
 * distinct from a `data:`-prefixed BGZip payload. juicebox's decoder tests the
 * same fragment, deliberately: the two readers accept the same set or the set
 * is not a contract.
 */
const GZIP_DATA_URI_MARKER = '/gzip;base64'

/**
 * Raised for a session value this app will not read.
 *
 * There is exactly one such value today: a session **URL**. juicebox's decoder
 * has a third arm that fetches one and sniffs the document that comes back;
 * Spacewalk does not, and is not gaining one — the fetch would cost this module
 * and `launchIntent.js` the no-I/O, no-bundler, testable-by-value property
 * their headers say they exist for, to support a form no Spacewalk link has
 * ever carried.
 *
 * So the row is a **stated boundary** rather than a silent divergence. It used
 * to be silent: five characters were sliced off `https://example.org/s.json`
 * and `://example.org/s.json` handed to the decompressor, so what a user saw
 * was a parse failure about a payload when the truth was "this app cannot open
 * session URLs."
 *
 * @see juicebox.js docs/adr/0011-session-string-is-the-cross-host-contract.md
 *   decision 5
 */
class UnsupportedSessionStringError extends Error {
    constructor(sessionURL) {
        super(`Spacewalk cannot open this session: expected a compressed session string beginning ${COMPRESSED_PREFIXES.join(' or ')}, got "${sessionURL.slice(0, 32)}…"`)
        this.name = 'UnsupportedSessionStringError'
        this.sessionURL = sessionURL
    }
}

/**
 * Decode a session string into its JSON text.
 *
 * A *session string* is the payload — `blob:…`, `data:…` — as distinct from a
 * *session parameter*, which is a host application's query parameter carrying
 * one. The session string is the contract juicebox and Spacewalk share; neither
 * app owes the other its query string, which is why this reads a value rather
 * than a URL and why `getShareURL` writes the value raw.
 *
 * Three accepted spellings, matching juicebox's decoder:
 *   - `blob:<BGZip payload>`  — what every Spacewalk share link carries
 *   - `data:<BGZip payload>`  — the same payload under juicebox's other prefix
 *   - `data:application/gzip;base64,…` — a real data URI, gzipped
 *
 * Anything else raises {@link UnsupportedSessionStringError}. A bare JSON
 * document is *not* accepted here: `sessionBootstrapper` parses what this
 * returns, and every value reaching it came off a compressed parameter.
 *
 * Lives apart from launchIntent.js so the pure URL→intent parser carries no
 * igv-utils dependency and stays unit-testable without a bundler.
 *
 * @param {string} sessionURL - a session string, not a URL and not a parameter
 * @returns {string} the session JSON
 * @throws {UnsupportedSessionStringError}
 * @see juicebox.js test/data/wireFormatCorpus.js — the shared payload rows,
 *   run against this function in sessionURLCodec.test.js
 */
function uncompressSessionURL(sessionURL) {

    if (sessionURL.indexOf(GZIP_DATA_URI_MARKER) > 0) {
        const bytes = BGZip.decodeDataURI(sessionURL, undefined)
        let json = ''
        for (let b of bytes) json += String.fromCharCode(b)
        return json
    }

    const prefix = COMPRESSED_PREFIXES.find(candidate => sessionURL.startsWith(candidate))
    if (undefined === prefix) {
        throw new UnsupportedSessionStringError(sessionURL)
    }

    return BGZip.uncompressString(sessionURL.slice(prefix.length))
}

export { uncompressSessionURL, UnsupportedSessionStringError }
