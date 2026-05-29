/**
 * Owns "which IGV tracks drive the 3D model's coloring": the checked-track set,
 * the active-provider selection, and session serialize/restore. All IGV/DOM
 * access goes through an injected TrackEnvironment port, so this logic is
 * testable with an in-memory environment — no IGV browser, no DOM.
 *
 * There are permanently exactly two material providers (color-ramp and track),
 * so active-provider selection is a fixed binary switch, not a registry of N.
 *
 * TrackEnvironment port (see src/igvTrackEnvironment.js for the production adapter):
 *   tracks()                -> ordered array of tracks (browser trackViews order)
 *   idFor(track)            -> canonical "name|index" id
 *   isColorEligible(track)  -> boolean (zoom gate)
 *   isLoading(track)        -> boolean
 *   reflectCheckbox(t, b)   -> push checked state into the track + its checkbox
 *   isCheckedInUI(track)    -> boolean (checkbox currently ticked)
 */
class MaterialProviderController {

    constructor({ trackProvider, colorRampProvider, env, onActiveProviderChanged }) {
        this.trackProvider = trackProvider
        this.colorRampProvider = colorRampProvider
        this.env = env
        this.onActiveProviderChanged = onActiveProviderChanged || (() => {})
        // id (name|index) -> true. Single source of truth for checked tracks.
        this.checked = new Map()
    }

    /** The provider the renderer should read. Binary switch on the checked set. */
    get activeProvider() {
        return this.checked.size > 0 ? this.trackProvider : this.colorRampProvider
    }

    async setTrackChecked(track, checked) {
        const id = this.env.idFor(track)
        if (id.endsWith('|-1')) return  // track not present in the browser

        if (checked) {
            if (!this.env.isColorEligible(track)) {
                // Zoomed out too far to sample features — reject and revert the checkbox.
                console.warn(`Track ${track.name} zoom level too low. Cannot add to material provider.`)
                this.env.reflectCheckbox(track, false)
                return
            }
            await this.trackProvider.configure(track)
            this.checked.set(id, true)
            this.env.reflectCheckbox(track, true)
        } else {
            this.trackProvider.removeTrackInstance(track)
            this.checked.delete(id)
            this.env.reflectCheckbox(track, false)
        }

        this._notifyActiveProvider()
    }

    /**
     * A track was removed from the browser entirely (trackremoved event). By the time
     * this fires the track is already out of browser.trackViews, so its name|index id
     * can no longer be recomputed — remove its contribution by name from both the
     * checked set and the blended provider, then re-evaluate the active provider. If
     * other tracks remain checked the provider re-blends and stays active; otherwise the
     * switch falls back to the color ramp.
     */
    removeTrack(track) {
        const prefix = `${track.name}|`
        const staleIds = Array.from(this.checked.keys()).filter(id => id.startsWith(prefix))
        let wasContributing = staleIds.length > 0

        for (const id of staleIds) this.checked.delete(id)

        if (!wasContributing && this.env.isCheckedInUI(track)) {
            wasContributing = true
        }

        if (wasContributing) {
            this.trackProvider.removeTrack(track.name)
            this._notifyActiveProvider()
        }
    }

    clear() {
        this.checked.clear()
    }

    /** @returns {string[]|'none'} checked-track ids, reconciled against the current browser. */
    serialize() {
        let ids = this._reconciledIds()
        if (ids.length === 0) {
            // Recover checkbox state not yet recorded under a current id — e.g. after a
            // reorder, where the recorded id's index is stale but the checkbox is still ticked.
            for (const track of this.env.tracks()) {
                if (track && this.env.isCheckedInUI(track)) {
                    this.checked.set(this.env.idFor(track), true)
                }
            }
            ids = this._reconciledIds()
        }
        return ids.length > 0 ? ids : 'none'
    }

    async restore(state) {
        const raw = Array.isArray(state) ? state : (state === 'none' ? [] : [ state ])
        if (raw.length === 0) return

        const isNewFormat = raw.some(s => typeof s === 'string' && s.includes('|'))
        let toRestore

        if (isNewFormat) {
            const idSet = new Set(raw)
            toRestore = this.env.tracks().filter(track => track && idSet.has(this.env.idFor(track)))
        } else {
            // Legacy format: bare track names. Restore the first track per name.
            const names = new Set(raw)
            const seen = new Set()
            toRestore = []
            for (const track of this.env.tracks()) {
                if (!track || !names.has(track.name) || seen.has(track.name)) continue
                seen.add(track.name)
                toRestore.push(track)
            }
        }

        for (const track of toRestore) {
            if (this.env.isLoading(track)) continue
            await this.setTrackChecked(track, true)
        }
    }

    _reconciledIds() {
        const valid = new Set(this.env.tracks().filter(Boolean).map(track => this.env.idFor(track)))
        return Array.from(this.checked.keys()).filter(id => valid.has(id))
    }

    _notifyActiveProvider() {
        this.onActiveProviderChanged(this.activeProvider)
    }
}

export default MaterialProviderController
