/**
 * Single source of truth for "what is highlighted right now".
 *
 * Producers — navigator ramp, IGV cursor, Juicebox crosshairs, 3D raycast
 * picker — report their selection here via set()/clear(); the controller
 * reconciles by handing the selection to every registered renderer. The
 * render-style switch lives inside each renderer, not in the producers.
 * See development-notes/refactor-highlighting-redesign.md.
 *
 * The selection is render-style-agnostic. Each entry is { index, interpolant }:
 *   - index: the discrete region into the current genomic-extent list. Drives
 *     the quantized surfaces (navigator strip, ball, point cloud). May be
 *     undefined over a genomic-extent gap (see the RFC's gap constraint).
 *   - interpolant: the CONTINUOUS curve coordinate in [0,1]. Drives the ribbon
 *     bead, which glides rather than hopping window-to-window.
 *
 * Navigation through genomic space is continuous; the discrete index is a
 * projection of the continuous interpolant, not the source of truth. Producers
 * that move continuously (navigator, IGV, juicebox) report their real
 * interpolant; the 3D picker, which is discrete, reports the picked window's
 * center. See development-notes/refactor-continuous-genomic-locator.md.
 */
class HighlightController {

    constructor() {
        // array of { index, interpolant }, sorted by index; [] means nothing highlighted
        this.selection = []
        // renderHighlight(selection) callbacks, invoked on every change
        this.renderers = []
    }

    addRenderer(renderHighlight) {
        this.renderers.push(renderHighlight)
    }

    set(entries, source = 'unknown') {
        const next = [ ...entries ].sort((a, b) => a.index - b.index)
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
        return next.length === this.selection.length && next.every((entry, i) =>
            entry.index === this.selection[ i ].index && entry.interpolant === this.selection[ i ].interpolant)
    }

    reconcile(source) {
        // console.log(`[highlight] selection [${ this.selection.map(({ index }) => index).join(', ') }] <- ${ source }`)
        for (const renderHighlight of this.renderers) {
            renderHighlight(this.selection)
        }
    }

}

export default HighlightController
