import AlertSingleton from './alertSingleton.js'

const httpStatusMessages =
    {
        401: 'Access unauthorized',
        403: 'Access forbidden',
        404: 'Not found'
    }

// One error surface for failed loads. Accepts a plain Error or (Phase 2) a
// RemoteError carrying .status / .kind / .url. Formats: what failed, a friendly
// HTTP-status line, the URL, and a hint, then routes to the draggable
// AlertSingleton dialog. presentResourceError owns this formatting so the dialog
// is handed a finished string (it does not re-map status codes). Falls back to
// console if the dialog isn't up yet (e.g. a failure during bootstrap).
//
// Called with { what, url } from a known call site, or with no context from the
// global unhandledrejection/error nets in main.js.
function presentResourceError(err, { what, url } = {}) {

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

    console.error('[resource]', what || '', resolvedURL || '', err)

    try {
        AlertSingleton.present(lines.join('<br>'))
    } catch (e) {
        // Dialog not initialized yet — the failure is already on the console above.
    }
}

export { presentResourceError }
