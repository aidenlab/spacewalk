import { describe, it, expect } from 'vitest'
import { buildLiveContactMapConfig } from './liveContactMapConfig.js'

// The only invisible logic in the live-map cluster: deriving the LiveContactMap
// config from the genome + locus. Everything else (canvas sizing, rendering, tab
// choreography) is verified by looking at the maps in the viewport.

const genome = (id, chromosomes) => ({ id, chromosomes: new Map(chromosomes.map((c, i) => [ c.name, c ])) })

describe('buildLiveContactMapConfig', () => {

    it('derives genomeId, locus, binSize, and maps chromosomes (size | bpLength)', () => {
        const config = buildLiveContactMapConfig({
            genome: genome('hg38', [ { name: 'chr1', size: 1000 }, { name: 'chr2', bpLength: 2000 } ]),
            locus: { chr: 'chr1', genomicStart: 0, genomicEnd: 1000 },
            traceLength: 100
        })

        expect(config.genomeId).toBe('hg38')
        expect(config.chr).toBe('chr1')
        expect(config.binSize).toBe(10) // (1000 - 0) / 100
        expect(config.contactMode).toBe('frequency')
        expect(config.chromosomes).toEqual([
            { index: 0, name: 'chr1', size: 1000 },
            { index: 1, name: 'chr2', size: 2000 } // bpLength used when size absent
        ])
    })

    it("moves the 'all' pseudo-chromosome to index 0 and renumbers", () => {
        const config = buildLiveContactMapConfig({
            genome: genome('hg38', [ { name: 'chr1', size: 1000 }, { name: 'all', size: 9 }, { name: 'chr2', size: 2000 } ]),
            locus: { chr: 'chr1', genomicStart: 0, genomicEnd: 500 },
            traceLength: 50
        })

        expect(config.chromosomes).toEqual([
            { index: 0, name: 'all', size: 9 },
            { index: 1, name: 'chr1', size: 1000 },
            { index: 2, name: 'chr2', size: 2000 }
        ])
    })

    it("leaves order untouched when 'all' is absent or already first", () => {
        const noAll = buildLiveContactMapConfig({
            genome: genome('hg38', [ { name: 'chr1', size: 1000 }, { name: 'chr2', size: 2000 } ]),
            locus: { chr: 'chr1', genomicStart: 0, genomicEnd: 1000 },
            traceLength: 100
        })
        expect(noAll.chromosomes.map(c => c.name)).toEqual([ 'chr1', 'chr2' ])

        const allFirst = buildLiveContactMapConfig({
            genome: genome('hg38', [ { name: 'all', size: 9 }, { name: 'chr1', size: 1000 } ]),
            locus: { chr: 'chr1', genomicStart: 0, genomicEnd: 1000 },
            traceLength: 100
        })
        expect(allFirst.chromosomes.map(c => c.name)).toEqual([ 'all', 'chr1' ])
    })
})
