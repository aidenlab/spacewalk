import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// The carve-out boundary: the 3D viewer assembles with no IGV and no Juicebox.
// Walk the static import graph from viewer.js and collect every bare (package)
// specifier it reaches. The build is the final proof; this catches the leak
// at the import that introduces it. See development-notes/spacewalk-mcp-viewer-carve-out.md.

const here = dirname(fileURLToPath(import.meta.url))

const importPattern = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g

function packagesReachableFrom(entry) {
    const packages = new Map()   // package specifier -> first importing file
    const seen = new Set()
    const pending = [ entry ]

    while (pending.length > 0) {
        const file = pending.pop()
        if (seen.has(file)) continue
        seen.add(file)

        const source = readFileSync(file, 'utf8')
        for (const match of source.matchAll(importPattern)) {
            const specifier = match[1] ?? match[2] ?? match[3]
            if (specifier.startsWith('.')) {
                const target = resolve(dirname(file), specifier)
                if (!/\.m?js$/.test(target) && /\.\w+$/.test(target)) continue   // .json, .css, .scss assets
                const candidates = /\.m?js$/.test(target) ? [ target ] : [ `${ target }.js`, resolve(target, 'index.js') ]
                const found = candidates.find(candidate => existsSync(candidate))
                if (!found) throw new Error(`Unresolved import '${ specifier }' in ${ file }`)
                pending.push(found)
            } else if (!packages.has(specifier)) {
                packages.set(specifier, file)
            }
        }
    }

    return packages
}

const isIGV = specifier => specifier === 'igv' || specifier.startsWith('igv/')
const isJuicebox = specifier => specifier === 'juicebox.js' || specifier.startsWith('juicebox.js/')

describe('viewer assembly boundary', () => {

    const packages = packagesReachableFrom(resolve(here, 'viewer.js'))

    it('reaches three, so the walk is following imports', () => {
        expect(packages.has('three')).toBe(true)
    })

    it('imports nothing from igv', () => {
        const leaks = [ ...packages ].filter(([ specifier ]) => isIGV(specifier))
        expect(leaks).toEqual([])
    })

    it('imports nothing from juicebox.js', () => {
        const leaks = [ ...packages ].filter(([ specifier ]) => isJuicebox(specifier))
        expect(leaks).toEqual([])
    })
})
