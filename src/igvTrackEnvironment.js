import { trackIdFromBrowser } from './trackId.js'

/**
 * Production TrackEnvironment: adapts the live IGV browser + the injected
 * material-provider checkbox DOM to the small port MaterialProviderController
 * depends on. `getBrowser` is a thunk because the browser is created after the
 * panel (and the controller) already exist.
 */
function createIGVTrackEnvironment(getBrowser) {

    return {

        tracks() {
            const trackViews = getBrowser()?.trackViews ?? []
            return trackViews.map(tv => tv.track)
        },

        idFor(track) {
            return trackIdFromBrowser(track, getBrowser())
        },

        isColorEligible(track) {
            const viewport = track.trackView?.viewports?.[0]
            if (!viewport) return false
            if (typeof viewport.checkZoomIn === 'function') {
                return viewport.checkZoomIn()
            }
            const zoomInNotice = viewport.$zoomInNotice?.get?.(0)
            return !(zoomInNotice && zoomInNotice.style.display !== 'none')
        },

        isLoading(track) {
            return typeof track.trackView?.isLoading === 'function' && track.trackView.isLoading()
        },

        reflectCheckbox(track, checked) {
            track.embeddingCheckboxChecked = checked
            if (track.trackView?.materialProviderInput) {
                track.trackView.materialProviderInput.checked = checked
            }
        },

        isCheckedInUI(track) {
            return !!(track.embeddingCheckboxChecked || track.trackView?.materialProviderInput?.checked)
        }
    }
}

export { createIGVTrackEnvironment }
