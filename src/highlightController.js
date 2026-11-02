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
 *
 * In a Room, another Viewer's highlight arrives as the remote selection
 * (setRemote/clearRemote; spacewalk-mcp ADR 0006). Every producer on this page
 * is local. The local selection is drawn while it isn't empty, so a person's own
 * highlight wins on their own screen; otherwise the remote one is. Local-change
 * listeners hear of the local selection only, so a received highlight is never
 * sent back out.
 */
class HighlightController {

    constructor() {
        // Each an array of { index, interpolant }, in ramp order; [] means nothing highlighted.
        // local: this page's producers. remote: another Viewer's, relayed through the Room.
        this.local = []
        this.remote = []
        // renderHighlight(selection) callbacks, invoked on every change to what is drawn
        this.renderers = []
        // told of every change to the local selection, and of nothing else
        this.localListeners = []
    }

    // What is drawn: a person's own highlight wins on their own screen.
    get selection() {
        return this.local.length > 0 ? this.local : this.remote
    }

    addRenderer(renderHighlight) {
        this.renderers.push(renderHighlight)
    }

    onLocalChange(listener) {
        this.localListeners.push(listener)
    }

    set(entries, source = 'unknown') {
        this.changeLocal(inRampOrder(entries), source)
    }

    clear(source = 'unknown') {
        this.changeLocal([], source)
    }

    setRemote(entries) {
        this.changeRemote(inRampOrder(entries))
    }

    clearRemote() {
        this.changeRemote([])
    }

    changeLocal(next, source) {
        if (isEqual(next, this.local)) {
            return
        }
        const before = this.selection
        this.local = next
        this.reconcile(before, source)
        for (const listener of this.localListeners) {
            listener(this.local)
        }
    }

    changeRemote(next) {
        if (isEqual(next, this.remote)) {
            return
        }
        const before = this.selection
        this.remote = next
        this.reconcile(before, 'Room')
    }

    reconcile(before, source) {
        if (isEqual(this.selection, before)) {
            return
        }
        // console.log(`[highlight] selection [${ this.selection.map(({ index }) => index).join(', ') }] <- ${ source }`)
        for (const renderHighlight of this.renderers) {
            renderHighlight(this.selection)
        }
    }

}

// By interpolant, not index: index is undefined over a gap, and the two agree otherwise.
function inRampOrder(entries) {
    return [ ...entries ].sort((a, b) => a.interpolant - b.interpolant)
}

function isEqual(a, b) {
    return a.length === b.length && a.every((entry, i) =>
        entry.index === b[ i ].index && entry.interpolant === b[ i ].interpolant)
}

export default HighlightController
