/**
 * Continuous locator for a bp: the region it falls in, plus a continuous
 * interpolant in [0,1] that glides linearly across the region's ramp extent
 * [start, end] as bp crosses the region's genomic span [startBP, endBP] — so
 * the ribbon bead glides with the pointer instead of snapping to the
 * window center. For contiguous regions (end_i == start_{i+1}) the mapping is
 * continuous across boundaries too.
 *
 * Over an INTERIOR genomic gap (bp between two regions' bp spans) there is no
 * region, so index is undefined and the discrete highlight clears — but the
 * bead stays alive at the junction interpolant so it dwells continuously
 * instead of blinking out as the pointer crosses the gap. (The ramp is
 * index-uniform, so a gap occupies no ramp space; "slide through" is a
 * continuous dwell at the junction.) Outside the modeled span entirely ->
 * undefined (bead hidden).
 *
 * Shared by every producer that starts from a bp (IGV cursor guide, Juicebox
 * crosshairs). See development-notes/refactor-continuous-genomic-locator.md.
 */
function locatorForBP(genomicExtentList, bp) {
    if (!genomicExtentList || 0 === genomicExtentList.length) {
        return undefined
    }

    const first = genomicExtentList[ 0 ]
    const last = genomicExtentList[ genomicExtentList.length - 1 ]
    if (bp < first.startBP || bp > last.endBP) {
        return undefined
    }

    for (let i = 0; i < genomicExtentList.length; i++) {
        const { startBP, endBP, start, end } = genomicExtentList[ i ]
        if (bp >= startBP && bp <= endBP) {
            const fraction = endBP === startBP ? 0 : (bp - startBP) / (endBP - startBP)
            return { index: i, interpolant: start + fraction * (end - start) }
        }
        // bp precedes this region but follows the previous one -> interior gap.
        if (bp < startBP) {
            return { index: undefined, interpolant: start }
        }
    }

    return undefined
}

export { locatorForBP }
