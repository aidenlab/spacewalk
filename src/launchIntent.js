/**
 * Pure interpretation of the launch URL into a bootstrap "intent". No imports, no
 * DOM, no I/O — given an href string, decide what Spacewalk should do on startup:
 *
 *   { kind: 'file',    fileURL, traceKey, ensembleGroupKey }       // ?file=…
 *   { kind: 'session', sessions: { spacewalk?, juicebox?, igv? } }  // raw compressed values
 *   { kind: 'none' }
 *
 * Precedence: a ?file= launch wins outright; otherwise compose whatever compressed
 * sessions are present; otherwise nothing.
 *
 * Decoding the session blobs (BGZip) and JSON-parsing them is deliberately the
 * executor's job (SessionBootstrapper), kept out of here so this module stays a
 * dependency-free, by-value-testable decision. It consolidates what used to be
 * three parsers (app.js consumeURLParams + extractFileParam, sessionServices.js
 * getUrlParams) into one place, so the file URL's own '&' characters (Dropbox
 * rlkey/st/dl) and the source-precedence rule are defined — and tested — once.
 *
 * @param {string} href - The full launch URL (e.g. window.location.href).
 */
function parseLaunchIntent(href) {

    const queryIndex = href.indexOf('?')
    if (queryIndex < 0) return { kind: 'none' }

    // Decode once, matching the historical single decodeURIComponent pass.
    const query = decodeURIComponent(href.slice(queryIndex + 1))
    if (0 === query.length) return { kind: 'none' }

    // File mode wins. Extract the file value by scanning to the next known
    // Spacewalk param, so an embedded '&' in the URL is preserved.
    const fileURL = extractFileParam(query)
    if (fileURL) {
        const params = parseQuery(query)
        return {
            kind: 'file',
            fileURL,
            traceKey: params.traceKey || '0',
            ensembleGroupKey: params.ensembleGroupKey || undefined,
        }
    }

    // Session mode: note whichever compressed sessions are present (raw values).
    const params = parseQuery(query)
    const sessions = {}
    if (params.spacewalkSessionURL) sessions.spacewalk = params.spacewalkSessionURL
    if (params.session)             sessions.juicebox  = params.session
    if (params.sessionURL)          sessions.igv       = params.sessionURL

    if (0 === Object.keys(sessions).length) return { kind: 'none' }
    return { kind: 'session', sessions }
}

// Spacewalk's own scalar params alongside a ?file= launch. Used to find where the
// file value ends, since the file URL itself may contain '&'.
const SPACEWALK_FILE_PARAMS = [ 'traceKey', 'ensembleGroupKey' ]

// Naive `a=b&c=d` → object over an already-decoded query string. The file value
// (which may contain '&') is handled separately by extractFileParam; here we only
// read well-formed scalar params. split('=', 2) intentionally truncates values
// containing '=' — safe because BGZip.compressString emits URL-safe output.
function parseQuery(query) {
    return query.split('&').reduce((acc, pair) => {
        const [ key, value ] = pair.split('=', 2)
        if (key) acc[key] = value
        return acc
    }, {})
}

// Extract the ?file= value from an already-decoded query string, preserving its
// own '&' characters by scanning forward to the next known Spacewalk param.
function extractFileParam(query) {
    const fileIndex = query.indexOf('file=')
    if (-1 === fileIndex) return undefined

    const rest = query.slice(fileIndex + 'file='.length)

    let endIndex = rest.length
    for (const param of SPACEWALK_FILE_PARAMS) {
        const marker = `&${param}=`
        const idx = rest.indexOf(marker)
        if (-1 !== idx && idx < endIndex) endIndex = idx
    }

    const value = rest.slice(0, endIndex)
    return 0 === value.length ? undefined : value
}

export { parseLaunchIntent }
