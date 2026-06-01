import { describe, it, expect } from 'vitest'
import MaterialProviderController from './materialProviderController.js'

// These tests cover the *invisible* bookkeeping a viewport can never show you:
// session persistence and the name|index reconciliation after a reorder. The
// visible behavior (toggling changes the picture, ineligible tracks rejected) is
// verified by clicking the app, not here.
//
// Everything runs against an in-memory TrackEnvironment + provider stubs — no IGV
// browser, no DOM.
function makeHarness() {
    let order = []                 // ordered track list, mirroring IGV trackViews order
    const uiChecked = new Set()    // tracks whose checkbox is currently ticked
    const eligible = new Set()     // tracks that pass the zoom gate
    const loading = new Set()      // tracks still loading

    const env = {
        tracks: () => order.slice(),
        idFor: track => `${track.name}|${order.indexOf(track)}`,
        isColorEligible: track => eligible.has(track),
        isLoading: track => loading.has(track),
        reflectCheckbox: (track, checked) => { checked ? uiChecked.add(track) : uiChecked.delete(track) },
        isCheckedInUI: track => uiChecked.has(track)
    }

    // Provider stubs: only the methods the controller calls. Color math is not tested here;
    // we record removeTrack(name) calls so the removal path can be asserted.
    const removedNames = []
    const trackProvider = {
        configure: async () => {},
        removeTrackInstance: () => {},
        removeTrack: name => { removedNames.push(name) }
    }
    const colorRampProvider = { name: 'colorRamp' }

    const controller = new MaterialProviderController({ trackProvider, colorRampProvider, env })

    return {
        controller, trackProvider, colorRampProvider, removedNames,
        track: name => ({ name }),
        setOrder: tracks => { order = tracks },
        markEligible: track => eligible.add(track),
        // Simulate IGV removing a track: it's gone from trackViews before trackremoved fires.
        removeFromBrowser: track => { order = order.filter(t => t !== track) }
    }
}

describe('MaterialProviderController session bookkeeping', () => {

    it('round-trips checked tracks through serialize → restore', async () => {
        const h = makeHarness()
        const a = h.track('a'), b = h.track('b'), c = h.track('c')
        h.setOrder([ a, b, c ])
        ;[ a, b, c ].forEach(h.markEligible)

        await h.controller.setTrackChecked(a, true)
        await h.controller.setTrackChecked(c, true)

        const state = h.controller.serialize()
        expect(state).toEqual([ 'a|0', 'c|2' ])

        // A fresh controller over the same track order restores the saved state exactly.
        const h2 = makeHarness()
        const a2 = h2.track('a'), b2 = h2.track('b'), c2 = h2.track('c')
        h2.setOrder([ a2, b2, c2 ])
        ;[ a2, b2, c2 ].forEach(h2.markEligible)

        expect(h2.controller.activeProvider).toBe(h2.colorRampProvider) // nothing checked yet
        await h2.controller.restore(state)

        expect(h2.controller.serialize()).toEqual([ 'a|0', 'c|2' ])
        expect(h2.controller.activeProvider).toBe(h2.trackProvider)
    })

    it('restores the legacy bare-name session format', async () => {
        const h = makeHarness()
        const a = h.track('a'), b = h.track('b')
        h.setOrder([ a, b ])
        ;[ a, b ].forEach(h.markEligible)

        await h.controller.restore([ 'b' ]) // legacy: names only, no "|index"

        expect(h.controller.serialize()).toEqual([ 'b|1' ])
        expect(h.controller.activeProvider).toBe(h.trackProvider)
    })

    it('survives a track reorder via checkbox-state reconciliation', async () => {
        const h = makeHarness()
        const a = h.track('a'), b = h.track('b')
        h.setOrder([ a, b ])
        ;[ a, b ].forEach(h.markEligible)

        await h.controller.setTrackChecked(b, true) // b checked at index 1 -> "b|1"
        expect(h.controller.serialize()).toEqual([ 'b|1' ])

        // User reorders: b moves to index 0. The recorded id "b|1" is now stale,
        // but b's checkbox is still ticked.
        h.setOrder([ b, a ])

        // serialize must recover b under its NEW id via the checkbox-state fallback.
        expect(h.controller.serialize()).toEqual([ 'b|0' ])
    })

    it('drops a removed track from the blend and falls back / re-blends correctly', async () => {
        const h = makeHarness()
        const a = h.track('a'), b = h.track('b')
        h.setOrder([ a, b ])
        ;[ a, b ].forEach(h.markEligible)

        await h.controller.setTrackChecked(a, true)
        await h.controller.setTrackChecked(b, true)
        expect(h.controller.activeProvider).toBe(h.trackProvider)

        // Remove `b` (the last track) — IGV drops it from trackViews, THEN fires
        // trackremoved (so its name|index id can no longer be recomputed). `a` keeps
        // its index 0 and still colors the model.
        h.removeFromBrowser(b)
        h.controller.removeTrack(b)

        expect(h.removedNames).toEqual([ 'b' ])               // b's contribution removed by name
        expect(h.controller.serialize()).toEqual([ 'a|0' ])   // b no longer in the checked set
        expect(h.controller.activeProvider).toBe(h.trackProvider) // a remains -> still track provider

        // Remove the last remaining track -> nothing left -> fall back to the color ramp.
        h.removeFromBrowser(a)
        h.controller.removeTrack(a)

        expect(h.removedNames).toEqual([ 'b', 'a' ])
        expect(h.controller.serialize()).toBe('none')
        expect(h.controller.activeProvider).toBe(h.colorRampProvider)
    })
})
