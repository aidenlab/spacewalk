import { describe, it, expect, beforeEach, vi } from 'vitest'
import HighlightController from './highlightController.js'

// Hovering a ball in ball-and-stick highlights it; moving off clears it.

const GENOMIC_EXTENTS = [ { interpolant: 0.05 }, { interpolant: 0.15 }, { interpolant: 0.25 } ]

const ball = instanceId => ({ instanceId, object: { name: 'ball', visible: true } })

async function freshPicker() {
    // The picker remembers the current ball at module scope: start each test fresh.
    vi.resetModules()
    const { default: Picker } = await import('./picker.js')

    let hits = []
    const raycaster = { setFromCamera() {}, intersectObjects: () => hits }

    const highlightController = new HighlightController()
    const drawn = []
    highlightController.addRenderer(selection => drawn.push(selection))

    const picker = new Picker(raycaster)
    picker.wireDependencies({
        sceneManager: { highlightController, ensembleManager: { getCurrentGenomicExtentList: () => GENOMIC_EXTENTS } },
        genomicNavigator: { repaint() {} }
    })

    const frame = hitList => {
        hits = hitList
        picker.intersect({ x: 0, y: 0, camera: {}, scene: { children: [] } })
    }

    return { frame, picker, lastDrawn: () => drawn[ drawn.length - 1 ] }
}

describe('Picker', () => {

    let frame, picker, lastDrawn
    beforeEach(async () => ({ frame, picker, lastDrawn } = await freshPicker()))

    it('highlights ball 0 when hovered', () => {
        frame([ ball(0) ])
        expect(lastDrawn()).toEqual([ { index: 0, interpolant: 0.05 } ])
    })

    it('clears ball 0 when the pointer moves off it', () => {
        frame([ ball(0) ])
        frame([])
        expect(lastDrawn()).toEqual([])
    })

    it('clears ball 0 when the pointer leaves the canvas', () => {
        frame([ ball(0) ])
        picker.onPointerLeftCanvas()
        expect(lastDrawn()).toEqual([])
    })

    it('moves the highlight from ball 0 to another ball', () => {
        frame([ ball(0) ])
        frame([ ball(2) ])
        expect(lastDrawn()).toEqual([ { index: 2, interpolant: 0.25 } ])
    })
})
