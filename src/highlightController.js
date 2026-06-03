/**
 * Single source of truth for "what is highlighted right now".
 *
 * Producers — navigator ramp, IGV cursor, Juicebox crosshairs, 3D raycast
 * picker — report their selection here via set()/clear(); the controller
 * reconciles by handing the selection to every registered renderer. The
 * render-style switch lives inside each renderer, not in the producers.
 * See development-notes/refactor-highlighting-redesign.md.
 *
 * The selection is render-style-agnostic: a set of region indices into the
 * current genomic-extent list. Each renderer maps an index to its own handle
 * (a genomic extent for the navigator strip; a mesh / instanceId for a 3D viz)
 * inside renderHighlight(selection), tolerating indices it has no handle for
 * (gaps in the genomic extent — see the RFC's gap constraint).
 *
 * Phase 2: the genomic-navigator strip is the first registered renderer.
 */
class HighlightController {

    constructor() {
        // sorted array of region indices; [] means nothing highlighted
        this.selection = []
        // renderHighlight(selection) callbacks, invoked on every change
        this.renderers = []
    }

    addRenderer(renderHighlight) {
        this.renderers.push(renderHighlight)
    }

    set(indices, source = 'unknown') {
        const next = [ ...new Set(indices) ].sort((a, b) => a - b)
        if (this.isEqual(next)) {
            return
        }
        this.selection = next
        this.reconcile(source)
    }

    clear(source = 'unknown') {
        if (0 === this.selection.length) {
            return
        }
        this.selection = []
        this.reconcile(source)
    }

    isEqual(next) {
        return next.length === this.selection.length && next.every((value, i) => value === this.selection[ i ])
    }

    reconcile(source) {
        // console.log(`[highlight] selection [${ this.selection.join(', ') }] <- ${ source }`)
        for (const renderHighlight of this.renderers) {
            renderHighlight(this.selection)
        }
    }

}

export default HighlightController
