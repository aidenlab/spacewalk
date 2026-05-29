/**
 * Canonical identity for an IGV track: its name plus its position among the
 * browser's trackViews (`name|index`). Shared by MaterialProviderController
 * (via the track-environment port) and TrackMaterialProvider so the scheme
 * lives in exactly one place.
 */
function trackIdFromBrowser(track, browser) {
    const index = browser?.trackViews?.findIndex(tv => tv.track === track) ?? -1
    return `${track.name}|${index}`
}

export { trackIdFromBrowser }
