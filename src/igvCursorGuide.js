/**
 * Spacewalk-owned IGV cursor guide + highlight producer.
 *
 * Replaces spacewalk's former reliance on igv's internal
 * cursorGuide.customMouseHandler, which is unreliable under our config in
 * upstream igv v3.8.0 (rulerViewport.mouseMove returns undefined and the guide
 * elements stay display:none). This owns both responsibilities:
 *
 *   - Guide line: a vertical line that follows the pointer CONTINUOUSLY across
 *     the IGV track lane, positioned from the raw pointer bp. It is a locator for
 *     the IGV panel, driven directly by this producer's own mousemove — NOT a
 *     renderer of the shared selection, so it does not inherit the selection's
 *     region-index quantization (a coarse genomic strip would otherwise make the
 *     line snap in big steps).
 *
 *   - Highlight: the pointer is resolved to the discrete region it falls in and
 *     reported via highlightController.set/clear, exactly like every other input
 *     after the highlighting redesign. A pointer outside the lane or over a
 *     genomic-extent gap maps to no index -> clear().
 *
 * The line (continuous) and the highlight (quantized) intentionally diverge: the
 * line shows the exact pointer position, the highlight shows which region that
 * position lands in.
 *
 * See development-notes/refactor-highlighting-redesign.md and
 * development-notes/highlighting-participant-map.md.
 */
class IGVCursorGuide {

    constructor({ getBrowser, ensembleManager, highlightController, source = 'igvCursor' }) {
        this.getBrowser = getBrowser
        this.ensembleManager = ensembleManager
        this.highlightController = highlightController
        this.source = source

        this.columnContainer = undefined
        this.line = undefined           // the guide line element, created lazily
        this.abortController = undefined
    }

    /**
     * Attach producer listeners to the IGV column container. Safe to call again
     * after igv rebuilds its DOM (loadSession, genome change): old listeners are
     * aborted and the stale line (a child of the old container) dropped.
     */
    attach(columnContainer) {
        if (this.abortController) {
            this.abortController.abort()
        }
        this.abortController = new AbortController()
        const { signal } = this.abortController

        this.columnContainer = columnContainer
        this.line = undefined

        columnContainer.addEventListener('mousemove', event => this.onMouseMove(event), { signal })
        columnContainer.addEventListener('mouseleave', () => this.clear(), { signal })
    }

    onMouseMove(event) {

        const viewport = this.trackViewportElement()
        const referenceFrame = this.getBrowser()?.referenceFrameList?.[ 0 ]
        if (!viewport || !referenceFrame) {
            return
        }

        const viewportRect = viewport.getBoundingClientRect()
        const x = event.clientX - viewportRect.left

        // Pointer outside the track lane -> hide line, nothing highlighted.
        if (x < 0 || x > viewportRect.width) {
            this.clear()
            return
        }

        // Guide line follows the pointer continuously.
        const offset = viewportRect.left - this.columnContainer.getBoundingClientRect().left
        const line = this.ensureLine()
        line.style.left = `${ offset + x }px`
        line.style.display = 'block'

        // Resolve the pointer to a continuous locator: the discrete region under it
        // plus a continuous interpolant that glides across the region as bp does.
        const bp = referenceFrame.start + x * referenceFrame.bpPerPixel
        const locator = this.locatorForBP(bp)
        if (undefined === locator) {
            this.highlightController.clear(this.source)
        } else {
            this.highlightController.set([ locator ], this.source)
        }
    }

    clear() {
        if (this.line) {
            this.line.style.display = 'none'
        }
        this.highlightController.clear(this.source)
    }

    /**
     * Continuous locator for a bp: the region it falls in, plus a continuous
     * interpolant in [0,1] that glides linearly across the region's ramp extent
     * [start, end] as bp crosses the region's genomic span [startBP, endBP] — so
     * the ribbon bead glides with the guide line instead of snapping to the
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
     */
    locatorForBP(bp) {
        const genomicExtentList = this.ensembleManager.getCurrentGenomicExtentList()
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

    ensureLine() {
        if (!this.line) {
            const el = document.createElement('div')
            el.className = 'spacewalk-igv-cursor-guide'
            Object.assign(el.style, {
                position: 'absolute',
                top: '0',
                bottom: '0',
                width: '1px',
                backgroundImage: 'repeating-linear-gradient(to bottom, rgba(127, 127, 127, 0.76) 0, rgba(127, 127, 127, 0.76) 2px, transparent 2px, transparent 4px)',
                pointerEvents: 'none',
                zIndex: '64',
                display: 'none'
            })
            this.columnContainer.appendChild(el)
            this.line = el
        }
        return this.line
    }

    trackViewportElement() {
        return this.columnContainer?.querySelector('.igv-column .igv-viewport')
    }
}

export default IGVCursorGuide
