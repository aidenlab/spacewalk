/**
 * Derive the base LiveContactMap (hic-straw) config from the IGV genome, the
 * current locus, and the trace length. Pure: no hic-straw, no datasource I/O —
 * the caller attaches `traces` or the `hdf5` handle afterward depending on the
 * pointcloud-bake decision.
 *
 * The 'all' pseudo-chromosome, if present and not already first, is moved to
 * index 0 and the indices are renumbered (LiveContactMap expects 'all' at 0).
 *
 * @param {Object} args
 * @param {{ id: string, chromosomes: Map }} args.genome - IGV genome (chromosomes have name + size|bpLength)
 * @param {{ chr: string, genomicStart: number, genomicEnd: number }} args.locus
 * @param {number} args.traceLength
 * @returns {Object} base LiveContactMap config
 */
function buildLiveContactMapConfig({ genome, locus, traceLength }) {

    const { chr, genomicStart, genomicEnd } = locus
    const binSize = (genomicEnd - genomicStart) / traceLength

    const chromosomes = Array.from(genome.chromosomes.values()).map((c, idx) => ({
        index: idx,
        name: c.name,
        size: c.size || c.bpLength
    }))

    const allIndex = chromosomes.findIndex(c => c.name.toLowerCase() === 'all')
    if (allIndex > 0) {
        const [ allChr ] = chromosomes.splice(allIndex, 1)
        chromosomes.unshift(allChr)
        chromosomes.forEach((c, idx) => { c.index = idx })
    }

    return {
        genomeId: genome.id,
        chr,
        genomicStart,
        genomicEnd,
        binSize,
        traceLength,
        chromosomes,
        contactMode: 'frequency',
        name: 'Live Contact Map'
    }
}

export { buildLiveContactMapConfig }
