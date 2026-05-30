import { describe, it, expect } from 'vitest'
import { parseLaunchIntent } from './launchIntent.js'

// Invisible bootstrap logic: interpret the launch URL into a decision. Pure
// string → intent — the actual decoding/loading/restoring is eye-audited in the
// app. Session values are returned raw (the BGZip decode lives in the bootstrapper),
// so these assertions stay by-value with no bundler dependency.

const base = 'https://spacewalk.app/index.html'

describe('parseLaunchIntent', () => {

    it('returns none when there is no query string', () => {
        expect(parseLaunchIntent(base)).toEqual({ kind: 'none' })
    })

    it('returns none for an empty query string', () => {
        expect(parseLaunchIntent(`${base}?`)).toEqual({ kind: 'none' })
    })

    it('parses a simple ?file= with default traceKey', () => {
        expect(parseLaunchIntent(`${base}?file=https://host/data.sw`)).toEqual({
            kind: 'file',
            fileURL: 'https://host/data.sw',
            traceKey: '0',
            ensembleGroupKey: undefined,
        })
    })

    it('reads traceKey and ensembleGroupKey alongside ?file=', () => {
        expect(parseLaunchIntent(`${base}?file=https://host/data.sw&traceKey=3&ensembleGroupKey=groupB`)).toEqual({
            kind: 'file',
            fileURL: 'https://host/data.sw',
            traceKey: '3',
            ensembleGroupKey: 'groupB',
        })
    })

    it("preserves '&' inside the file URL (Dropbox), stopping at a known Spacewalk param", () => {
        const dropbox = 'https://www.dropbox.com/scl/fi/abc/data.sw?rlkey=k1&st=s1&dl=0'
        const intent = parseLaunchIntent(`${base}?file=${dropbox}&traceKey=2`)
        expect(intent).toEqual({
            kind: 'file',
            fileURL: dropbox,
            traceKey: '2',
            ensembleGroupKey: undefined,
        })
    })

    it('notes a single compressed session (spacewalk only), raw', () => {
        const intent = parseLaunchIntent(`${base}?spacewalkSessionURL=blob:AAA`)
        expect(intent).toEqual({ kind: 'session', sessions: { spacewalk: 'blob:AAA' } })
    })

    it('composes all three session sources, raw', () => {
        const intent = parseLaunchIntent(`${base}?spacewalkSessionURL=blob:AAA&session=blob:BBB&sessionURL=blob:CCC`)
        expect(intent).toEqual({
            kind: 'session',
            sessions: { spacewalk: 'blob:AAA', juicebox: 'blob:BBB', igv: 'blob:CCC' },
        })
    })

    it('gives ?file= precedence (file kind) over a trailing session param', () => {
        const intent = parseLaunchIntent(`${base}?file=https://host/data.sw&traceKey=1&sessionURL=blob:CCC`)
        expect(intent.kind).toBe('file')
        expect(intent.fileURL).toBe('https://host/data.sw')
    })
})
