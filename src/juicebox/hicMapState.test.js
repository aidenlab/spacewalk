import { describe, it, expect } from 'vitest'
import { isHicMapLoaded } from './hicMapState.js'

// One question asked in three places (session JSON, share URL, live-map
// registration), so it gets one answer. It reads juicebox.js's `dataset.isLive`
// — the flag that replaced the name the session guards kept testing after it was
// dropped in Sept 2024 (#84).

describe('isHicMapLoaded', () => {

    it('is true for a Hi-C map', () => {
        expect(isHicMapLoaded({ dataset: { url: 'map.hic', isLive: false } })).toBe(true)
    })

    it('is false for a live contact map', () => {
        expect(isHicMapLoaded({ dataset: { isLive: true } })).toBe(false)
    })

    it('is false when no map is loaded', () => {
        expect(isHicMapLoaded({ dataset: undefined })).toBe(false)
    })

    // JuiceboxPanel sets this.browser to null when session restore fails, and
    // starts out with no browser at all.
    it('is false when there is no browser', () => {
        expect(isHicMapLoaded(null)).toBe(false)
        expect(isHicMapLoaded(undefined)).toBe(false)
    })

    // juicebox.js predates the flag on some datasets; absent means not live.
    it('treats a dataset with no isLive flag as a Hi-C map', () => {
        expect(isHicMapLoaded({ dataset: { url: 'map.hic' } })).toBe(true)
    })

})
