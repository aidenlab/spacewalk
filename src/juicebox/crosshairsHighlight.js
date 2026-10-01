import { locatorForBP } from '../genomicLocator.js'

/**
 * The highlight entries for a Juicebox crosshairs position: one per axis that
 * lands on the ensemble locus, each located from its own bp — so the two
 * crosshairs drive two gliding beads.
 *
 * Juicebox reports the locus under the pointer (`onCrosshairsMove`: a chromosome
 * name and bp per axis). The interpolant is computed here, against the ensemble's
 * genomic extent, and never against the contact map's viewport: the two agree
 * only while the map shows exactly the ensemble locus.
 *
 * An axis on another chromosome, or outside the modeled span, contributes
 * nothing; an empty list means there is nothing to highlight.
 *
 * @param {{chr1: string, xBP: number, chr2: string, yBP: number}} position
 * @param {{chr: string, genomicExtentList: Array}} ensembleLocus - the locus's chromosome and its genomic extents
 * @returns {Array<{index: number|undefined, interpolant: number}>}
 */
function crosshairsHighlightEntries({ chr1, xBP, chr2, yBP }, { chr, genomicExtentList }) {

    const entries = []

    for (const [ name, bp ] of [ [ chr1, xBP ], [ chr2, yBP ] ]) {
        if (!isSameChromosome(name, chr)) continue

        const locator = locatorForBP(genomicExtentList, bp)
        if (locator) entries.push(locator)
    }

    return entries
}

// A .hic file may spell a chromosome `2` where the ensemble spells it `chr2`.
function isSameChromosome(a, b) {
    if (undefined === a || undefined === b) return false
    const bare = name => String(name).toLowerCase().replace(/^chr/, '')
    return bare(a) === bare(b)
}

export { crosshairsHighlightEntries }
