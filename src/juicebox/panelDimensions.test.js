import { describe, it, expect } from 'vitest'
import { applyPanelDimensions } from './panelDimensions.js'

// There is nothing to see in these numbers from the viewport — a panel 160px too
// wide looks like a panel — and the omission they cover for is one juicebox made
// invisible for two major versions. See panelDimensions.js.
describe('applyPanelDimensions', () => {

    const dimensions = { width: 480, height: 480 }

    it('sizes a restored session that names no dimensions', () => {
        const session = { browsers: [ { url: 'https://example.org/a.hic', state: '1 1 0 0 0 1 1 1' } ] }

        applyPanelDimensions(session, dimensions)

        expect(session.browsers[0]).toMatchObject(dimensions)
    })

    it('leaves dimensions the session asked for alone', () => {
        const session = { browsers: [ { url: 'https://example.org/a.hic', width: 900, height: 700 } ] }

        applyPanelDimensions(session, dimensions)

        expect(session.browsers[0]).toMatchObject({ width: 900, height: 700 })
    })

    it('sizes every browser of a multi-browser session', () => {
        const session = { browsers: [ { url: 'a.hic' }, { url: 'b.hic', width: 900 } ] }

        applyPanelDimensions(session, dimensions)

        expect(session.browsers[0]).toMatchObject({ width: 480, height: 480 })
        expect(session.browsers[1]).toMatchObject({ width: 900, height: 480 })
    })

    // A single browser config is a session with its one browser inlined — the
    // reading juicebox itself makes (`session.browsers || [session]`).
    it('sizes a session with its one browser inlined', () => {
        const session = { url: 'https://example.org/a.hic' }

        applyPanelDimensions(session, dimensions)

        expect(session).toMatchObject(dimensions)
    })

    it('supplies a default browser when the session describes none', () => {
        const session = { browsers: [] }

        applyPanelDimensions(session, dimensions)

        expect(session.browsers).toHaveLength(1)
        expect(session.browsers[0]).toMatchObject({ ...dimensions, queryParametersSupported: false })
    })
})
