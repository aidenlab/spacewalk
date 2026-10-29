import { describe, it, expect } from 'vitest'
import { BGZip } from 'igv-utils'
import { readSnapshot } from './snapshot.js'

// Invisible bookkeeping: what a snapshot URL's parameters decode to. Restoring
// the decoded values into the scene is checked by eye.

const blob = object => `blob:${BGZip.compressString(JSON.stringify(object))}`

const spacewalk = {
    url: 'https://example.org/ensemble.sw',
    traceKey: '12',
    ensembleGroupKey: 'groupB',
    renderStyle: 'render-style-ribbon',
    structureAppearance: { ballRadiusIndex: 7, isCircular: true },
}

const viewerSettings = {
    background: { r: 0, g: 0, b: 0 },
    gnomon: { visible: true, r: 1, g: 1, b: 1 },
    groundPlane: { visible: false, r: 0.5, g: 0.5, b: 0.5 },
    referenceRuler: { visible: true, r: 1, g: 0, b: 0 },
}

describe('readSnapshot', () => {

    it('decodes the spacewalk session block', () => {
        const snapshot = readSnapshot({ kind: 'session', sessions: { spacewalk: blob(spacewalk) } })
        expect(snapshot.spacewalk).toEqual(spacewalk)
    })

    it('decodes the viewer settings from their own parameter', () => {
        const snapshot = readSnapshot({
            kind: 'session',
            sessions: { spacewalk: blob(spacewalk) },
            viewerSettings: blob(viewerSettings),
        })
        expect(snapshot.viewerSettings).toEqual(viewerSettings)
    })

    it('has no viewer settings when the parameter is absent', () => {
        const snapshot = readSnapshot({ kind: 'session', sessions: { spacewalk: blob(spacewalk) } })
        expect(snapshot.viewerSettings).toBeUndefined()
    })

    it('drops viewer settings it cannot decode, keeping the session', () => {
        const snapshot = readSnapshot({
            kind: 'session',
            sessions: { spacewalk: blob(spacewalk) },
            viewerSettings: 'not-a-session-string',
        })
        expect(snapshot.spacewalk).toEqual(spacewalk)
        expect(snapshot.viewerSettings).toBeUndefined()
    })

    it('is no snapshot without a spacewalk session (igv or juicebox only)', () => {
        expect(readSnapshot({ kind: 'session', sessions: { igv: 'blob:CCC' }, viewerSettings: blob(viewerSettings) })).toBeUndefined()
    })
})
