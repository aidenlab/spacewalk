import AlertSingleton from './alertSingleton.js'

const httpStatusMessages =
    {
        401: 'Access unauthorized',
        403: 'Access forbidden',
        404: 'Not found'
    }

// Build the user-facing lines for one failed resource: what failed, a friendly
// HTTP-status line, the URL, and a hint. Shared by the single- and multi-error
// surfaces below so they format identically. Accepts a plain Error or a
// RemoteError carrying .status / .kind / .url; this owns the formatting, so the
// dialog is handed a finished string and does not re-map status codes.
function formatResourceError(err, { what, url } = {}) {

    const resolvedURL = url || (err && err.url)
    const hasResourceContext = Boolean(what || resolvedURL)

    const lines = []

    if (what) {
        lines.push(`Couldn’t load ${ what }.`)
    }

    const status = err && err.status
    if (status && httpStatusMessages[ status ]) {
        lines.push(`${ httpStatusMessages[ status ] } (${ status }).`)
    } else if (err && err.kind === 'not-expected-format') {
        lines.push('This URL returned a web page, not the expected file — the link may be a preview link.')
    } else if (err && err.message) {
        lines.push(err.message)
    } else if (typeof err === 'string') {
        lines.push(err)
    }

    if (0 === lines.length) {
        lines.push('An unexpected error occurred.')
    }

    if (resolvedURL) {
        lines.push(`URL: ${ resolvedURL }`)
    }

    if (hasResourceContext) {
        lines.push('The file may have moved, or the link may have expired.')
    }

    return lines
}

// One error surface for a single failed load. Routes to the draggable
// AlertSingleton dialog; falls back to the console if the dialog isn't up yet
// (e.g. a failure during bootstrap). Called with { what, url } from a known call
// site, or with no context from the global unhandledrejection/error nets.
function presentResourceError(err, { what, url } = {}) {

    const lines = formatResourceError(err, { what, url })

    console.error('[resource]', what || '', url || (err && err.url) || '', err)

    try {
        AlertSingleton.present(lines.join('<br>'))
    } catch (e) {
        // Dialog not initialized yet — the failure is already on the console above.
    }
}

// Consolidated surface for a session restore where the spine (.sw ensemble)
// succeeded but one or more best-effort sub-loads (Juicebox map, IGV session)
// failed. Reports all of them in a single dialog rather than N stacked ones.
// `problems` is an array of { err, what, url }. A single problem degrades to the
// plain single-error dialog.
function presentResourceErrors(problems) {

    const items = (problems || []).filter(p => p && p.err)

    if (0 === items.length) {
        return
    }

    if (1 === items.length) {
        const { err, what, url } = items[ 0 ]
        presentResourceError(err, { what, url })
        return
    }

    for (const { err, what, url } of items) {
        console.error('[resource]', what || '', url || (err && err.url) || '', err)
    }

    const blocks = items.map(({ err, what, url }) => formatResourceError(err, { what, url }).join('<br>'))
    const message = [ 'Some parts of the session couldn’t be loaded:', ...blocks ].join('<br><br>')

    try {
        AlertSingleton.present(message)
    } catch (e) {
        // Dialog not initialized yet — the failures are already on the console above.
    }
}

export { presentResourceError, presentResourceErrors }
