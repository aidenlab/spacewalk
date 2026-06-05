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

        // Highlight resolves to the discrete region under the pointer.
        const bp = referenceFrame.start + x * referenceFrame.bpPerPixel
        const index = this.indexForBP(bp)
        if (undefined === index) {
            this.highlightController.clear(this.source)
        } else {
            this.highlightController.set([ index ], this.source)
        }
    }

    clear() {
        if (this.line) {
            this.line.style.display = 'none'
        }
        this.highlightController.clear(this.source)
    }

    /** First region whose [startBP, endBP] contains bp, or undefined (gap / out of locus). */
    indexForBP(bp) {
        const genomicExtentList = this.ensembleManager.getCurrentGenomicExtentList()
        if (!genomicExtentList) {
            return undefined
        }
        for (let i = 0; i < genomicExtentList.length; i++) {
            const { startBP, endBP } = genomicExtentList[ i ]
            if (bp >= startBP && bp <= endBP) {
                return i
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
