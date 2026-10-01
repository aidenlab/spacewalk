import { describe, it, expect } from 'vitest'
import { crosshairsHighlightEntries } from './crosshairsHighlight.js'

// Which beads a crosshair position lights is arithmetic nobody can audit by eye:
// a highlight computed against the viewport rather than the ensemble locus still
// lights *some* bead, and looks right until the map is zoomed. See crosshairsHighlight.js.

// Four contiguous 1 Mb regions on chr2, 10 Mb - 14 Mb, laid out by index on the ramp.
const genomicExtentList = [ 0, 1, 2, 3 ].map(i => ({
    startBP: 10_000_000 + i * 1_000_000,
    endBP: 11_000_000 + i * 1_000_000,
    start: i / 4,
    end: (i + 1) / 4
}))

const ensembleLocus = { chr: 'chr2', genomicExtentList }

describe('crosshairsHighlightEntries', () => {

    it('yields one entry per axis, each located by its own bp', () => {
        const entries = crosshairsHighlightEntries({ chr1: 'chr2', xBP: 10_500_000, chr2: 'chr2', yBP: 13_250_000 }, ensembleLocus)

        expect(entries).toEqual([
            { index: 0, interpolant: 0.125 },
            { index: 3, interpolant: 0.8125 }
        ])
    })

    it('locates against the ensemble locus, not the map viewport the position came from', () => {
        // Map zoomed to 11.9 - 12.1 Mb. x is a quarter of the way across that viewport (a
        // viewport fraction of 0.25) but at 11.95 Mb it is just under halfway along the locus.
        const extents = { startXBP: 11_900_000, endXBP: 12_100_000, startYBP: 11_900_000, endYBP: 12_100_000 }

        const entries = crosshairsHighlightEntries({ chr1: 'chr2', xBP: 11_950_000, chr2: 'chr2', yBP: 12_000_000, extents }, ensembleLocus)

        expect(entries[0]).toEqual({ index: 1, interpolant: 0.4875 })
        expect(entries[1].interpolant).toBeCloseTo(0.5)
    })

    it('drops an axis whose bp is outside the ensemble locus, keeping the other', () => {
        const entries = crosshairsHighlightEntries({ chr1: 'chr2', xBP: 9_000_000, chr2: 'chr2', yBP: 11_500_000 }, ensembleLocus)

        expect(entries).toEqual([ { index: 1, interpolant: 0.375 } ])
    })

    it('drops an axis on another chromosome, though its bp would fall in the locus', () => {
        const entries = crosshairsHighlightEntries({ chr1: 'chr2', xBP: 11_500_000, chr2: 'chr7', yBP: 11_500_000 }, ensembleLocus)

        expect(entries).toEqual([ { index: 1, interpolant: 0.375 } ])
    })

    it('matches a chromosome the map spells without the chr prefix', () => {
        const entries = crosshairsHighlightEntries({ chr1: '2', xBP: 10_500_000, chr2: '2', yBP: 10_500_000 }, ensembleLocus)

        expect(entries).toHaveLength(2)
    })

    it('yields nothing when neither axis is on the ensemble locus', () => {
        expect(crosshairsHighlightEntries({ chr1: 'chr7', xBP: 10_500_000, chr2: 'chr7', yBP: 10_500_000 }, ensembleLocus)).toEqual([])
        expect(crosshairsHighlightEntries({ chr1: 'chr2', xBP: 1, chr2: 'chr2', yBP: 99_000_000 }, ensembleLocus)).toEqual([])
    })

    it('yields nothing before an ensemble is loaded', () => {
        const position = { chr1: 'chr2', xBP: 10_500_000, chr2: 'chr2', yBP: 10_500_000 }

        expect(crosshairsHighlightEntries(position, { chr: undefined, genomicExtentList: undefined })).toEqual([])
    })

    it('keeps the bead alive, with no index, over a gap in the genomic extent', () => {
        const gapped = { chr: 'chr2', genomicExtentList: [ genomicExtentList[0], genomicExtentList[2], genomicExtentList[3] ] }

        const entries = crosshairsHighlightEntries({ chr1: 'chr2', xBP: 11_500_000, chr2: 'chr2', yBP: 10_500_000 }, gapped)

        expect(entries).toEqual([
            { index: undefined, interpolant: 0.5 },
            { index: 0, interpolant: 0.125 }
        ])
    })
})
