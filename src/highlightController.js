/**
 * Single source of truth for "what is highlighted right now".
 *
 * Phase 1 (shadow mode): every highlight producer — navigator ramp, IGV cursor,
 * Juicebox crosshairs, 3D raycast picker — additionally reports its selection
 * here alongside its existing imperative highlight calls. Nothing reads the
 * selection yet; it only logs, so we can watch one timeline of every set/clear
 * and confirm it tracks (and catch whoever clobbers the point-cloud-from-
 * navigator highlight). See development-notes/refactor-highlighting-redesign.md.
 *
 * The selection is render-style-agnostic: a set of region indices into the
 * current genomic-extent list. Each producer maps its native input (interpolant
 * windows, instanceId) to indices; in Phase 2 each visualization will map an
 * index back to its own geometry handle inside renderHighlight(selection).
 */
class HighlightController {

    constructor() {
        // sorted array of region indices; [] means nothing highlighted
        this.selection = []
    }

    set(indices, source = 'unknown') {
        const next = [ ...new Set(indices) ].sort((a, b) => a - b)
        if (this.isEqual(next)) {
            return
        }
        this.selection = next
        this.announce(source)
    }

    clear(source = 'unknown') {
        if (0 === this.selection.length) {
            return
        }
        this.selection = []
        this.announce(source)
    }

    isEqual(next) {
        return next.length === this.selection.length && next.every((value, i) => value === this.selection[ i ])
    }

    announce(source) {
        // Shadow mode: log only. Phase 2 hands this.selection to the active
        // visualization's renderHighlight(selection).
        console.log(`[highlight] selection [${ this.selection.join(', ') }] <- ${ source }`)
    }

}

export default HighlightController
