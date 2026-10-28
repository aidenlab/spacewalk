import { describe, it, expect } from 'vitest'
import { bundleLeaks } from './viewerBoundary.mjs'

// A Rollup output bundle, reduced to what the check reads: chunks keyed by
// file name, each with its facade module, its static and dynamic imports,
// and the modules it contains.
function chunk(fileName, { facadeModuleId = null, imports = [], dynamicImports = [], modules = [] }) {
    return {
        type: 'chunk',
        fileName,
        facadeModuleId,
        imports,
        dynamicImports,
        modules: Object.fromEntries(modules.map(id => [ id, {} ])),
    }
}

const forbidden = [ 'igv', 'juicebox.js' ]

describe('bundleLeaks', () => {

    it('reports a forbidden package inside the entry chunk', () => {
        const bundle = {
            'viewer.js': chunk('viewer.js', {
                facadeModuleId: '/repo/viewer.html',
                modules: [ '/repo/src/viewer.js', '/repo/node_modules/igv/dist/igv.esm.js' ],
            }),
        }

        expect(bundleLeaks(bundle, { entry: 'viewer.html', forbidden })).toEqual([
            { package: 'igv', module: '/repo/node_modules/igv/dist/igv.esm.js', chunk: 'viewer.js' },
        ])
    })

    it('follows static and dynamic imports, and ignores chunks only another entry reaches', () => {
        const bundle = {
            'viewer.js': chunk('viewer.js', {
                facadeModuleId: '/repo/viewer.html',
                imports: [ 'shared.js' ],
                modules: [ '/repo/src/viewer.js' ],
            }),
            'shared.js': chunk('shared.js', {
                dynamicImports: [ 'lazy.js' ],
                modules: [ '/repo/node_modules/three/build/three.module.js' ],
            }),
            'lazy.js': chunk('lazy.js', {
                modules: [ '/repo/node_modules/juicebox.js/dist/juicebox.esm.js' ],
            }),
            'main.js': chunk('main.js', {
                facadeModuleId: '/repo/index.html',
                imports: [ 'shared.js' ],
                modules: [ '/repo/node_modules/igv/dist/igv.esm.js' ],
            }),
        }

        expect(bundleLeaks(bundle, { entry: 'viewer.html', forbidden })).toEqual([
            { package: 'juicebox.js', module: '/repo/node_modules/juicebox.js/dist/juicebox.esm.js', chunk: 'lazy.js' },
        ])
    })

    it('does not mistake a package whose name merely starts with a forbidden one', () => {
        const bundle = {
            'viewer.js': chunk('viewer.js', {
                facadeModuleId: '/repo/viewer.html',
                modules: [ '/repo/node_modules/igv-utils/src/index.js' ],
            }),
        }

        expect(bundleLeaks(bundle, { entry: 'viewer.html', forbidden })).toEqual([])
    })

    it('refuses to pass when the entry is not in the bundle', () => {
        const bundle = {
            'main.js': chunk('main.js', { facadeModuleId: '/repo/index.html' }),
        }

        expect(() => bundleLeaks(bundle, { entry: 'viewer.html', forbidden })).toThrow(/viewer\.html/)
    })
})
