import { describe, it, expect, vi } from 'vitest'
import HighlightController from './highlightController.js'

// What is drawn, and who is told: a person's own highlight against another Viewer's.

const LOCAL = [ { index: 3, interpolant: 0.3 } ]
const REMOTE = [ { index: 7, interpolant: 0.7 } ]

function controller() {
    const highlight = new HighlightController()
    const drawn = []
    highlight.addRenderer(selection => drawn.push(selection))
    return { highlight, drawn, lastDrawn: () => drawn[ drawn.length - 1 ] }
}

describe('HighlightController', () => {

    it('draws a remote highlight while there is no local one', () => {
        const { highlight, lastDrawn } = controller()
        highlight.setRemote(REMOTE)
        expect(lastDrawn()).toEqual(REMOTE)
    })

    it('draws the local highlight over a remote one', () => {
        const { highlight, lastDrawn } = controller()
        highlight.setRemote(REMOTE)
        highlight.set(LOCAL, 'navigator')
        expect(lastDrawn()).toEqual(LOCAL)
    })

    it('keeps the local highlight drawn when a remote one arrives', () => {
        const { highlight, drawn, lastDrawn } = controller()
        highlight.set(LOCAL, 'navigator')
        const count = drawn.length
        highlight.setRemote(REMOTE)
        expect(drawn.length).toBe(count)
        expect(lastDrawn()).toEqual(LOCAL)
    })

    it('draws the remote highlight again once the local one clears', () => {
        const { highlight, lastDrawn } = controller()
        highlight.setRemote(REMOTE)
        highlight.set(LOCAL, 'picker')
        highlight.clear('pickerLeftCanvas')
        expect(lastDrawn()).toEqual(REMOTE)
    })

    it('draws nothing once the remote highlight clears with no local one', () => {
        const { highlight, lastDrawn } = controller()
        highlight.setRemote(REMOTE)
        highlight.clearRemote()
        expect(lastDrawn()).toEqual([])
    })

    it('tells the local listener of local changes, the clear included', () => {
        const { highlight } = controller()
        const listener = vi.fn()
        highlight.onLocalChange(listener)
        highlight.set(LOCAL, 'navigator')
        highlight.clear('navigator')
        expect(listener.mock.calls).toEqual([ [ LOCAL ], [ [] ] ])
    })

    it('does not tell the local listener of a remote change', () => {
        const { highlight } = controller()
        const listener = vi.fn()
        highlight.onLocalChange(listener)
        highlight.setRemote(REMOTE)
        highlight.clearRemote()
        expect(listener).not.toHaveBeenCalled()
    })

})
