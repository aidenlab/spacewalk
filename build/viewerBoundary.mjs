// The carve-out boundary, proven by the build: the viewer-only page's bundle
// contains no igv and no juicebox.js. src/viewer.test.js catches a leak at the
// import that introduces it; this catches anything that slips past a static
// walk of our own source (a dependency of a dependency, a dynamic import).
// See development-notes/spacewalk-mcp-viewer-carve-out.md.

/**
 * Walk the chunks an entry reaches (static and dynamic imports) and report
 * every bundled module that belongs to a forbidden package.
 *
 * @param {object} bundle - Rollup output bundle, keyed by file name
 * @param {{ entry: string, forbidden: string[] }} options - entry is the HTML
 *        page (e.g. 'viewer.html'); forbidden are package names
 * @returns {{ package: string, module: string, chunk: string }[]}
 */
function bundleLeaks(bundle, { entry, forbidden }) {

    const chunks = Object.values(bundle).filter(output => 'chunk' === output.type)
    const entryChunk = chunks.find(({ facadeModuleId }) => facadeModuleId?.endsWith(`/${ entry }`))
    if (!entryChunk) {
        throw new Error(`No chunk for entry '${ entry }' in the bundle`)
    }

    const leaks = []
    const seen = new Set()
    const pending = [ entryChunk.fileName ]

    while (pending.length > 0) {
        const fileName = pending.shift()
        if (seen.has(fileName)) continue
        seen.add(fileName)

        const { modules, imports, dynamicImports } = bundle[ fileName ]
        for (const module of Object.keys(modules)) {
            const name = packageOf(module)
            if (forbidden.includes(name)) {
                leaks.push({ package: name, module, chunk: fileName })
            }
        }
        pending.push(...imports, ...dynamicImports)
    }

    return leaks
}

// The package a module id belongs to: the path segment(s) after the last
// node_modules/, so nested installs resolve to the innermost package.
function packageOf(moduleId) {
    const marker = '/node_modules/'
    const index = moduleId.lastIndexOf(marker)
    if (index < 0) return undefined
    const [ first, second ] = moduleId.slice(index + marker.length).split('/')
    return first.startsWith('@') ? `${ first }/${ second }` : first
}

/**
 * Vite plugin: fail `vite build` if the entry's bundle contains a forbidden package.
 */
function viewerBoundary({ entry, forbidden }) {
    return {
        name: 'spacewalk:viewer-boundary',
        apply: 'build',
        generateBundle(options, bundle) {
            const leaks = bundleLeaks(bundle, { entry, forbidden })
            if (leaks.length > 0) {
                const lines = leaks.map(leak => `  ${ leak.package }: ${ leak.module } (in ${ leak.chunk })`)
                this.error(`${ entry } bundle crosses the viewer boundary:\n${ lines.join('\n') }`)
            }
        }
    }
}

export { bundleLeaks, viewerBoundary }
