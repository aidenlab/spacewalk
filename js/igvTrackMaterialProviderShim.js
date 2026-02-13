/**
 * Shim for track material provider checkbox injection.
 * Injects checkboxes into IGV's axis column after initialization settles.
 * Zero IGV.js modifications - all logic lives in Spacewalk.
 */

const MATERIAL_PROVIDER_EXCLUSION_TYPES = new Set(['ruler', 'sequence', 'ideogram'])

/**
 * Inject material provider checkboxes into each track's axis column.
 * Skips tracks that are excluded or already injected.
 *
 * @param {Object} browser - IGV browser instance
 * @param {Object} igvPanel - IGVPanel instance (for activate/deactivate)
 */
function injectCheckboxes(browser, igvPanel) {
    if (!browser || !browser.trackViews) return

    for (const trackView of browser.trackViews) {
        const track = trackView.track
        if (!track) continue
        if (MATERIAL_PROVIDER_EXCLUSION_TYPES.has(track.type)) continue
        if (!trackView.axis) continue
        if (trackView._embeddingCheckboxInjected) continue

        const container = document.createElement('div')
        const input = document.createElement('input')
        input.type = 'checkbox'
        input.name = 'track-material-provider'
        input.checked = track.embeddingCheckboxChecked ?? false

        input.addEventListener('change', async (event) => {
            event.preventDefault()
            event.stopPropagation()
            track.embeddingCheckboxChecked = input.checked
            if (input.checked) {
                await igvPanel.activateTrackMaterialProvider(track)
            } else {
                await igvPanel.deactivateTrackMaterialProvider(track)
            }
        })

        container.appendChild(input)
        trackView.axis.appendChild(container)
        trackView.materialProviderInput = input
        trackView._embeddingCheckboxInjected = true
    }
}

/**
 * Install the shim: inject checkboxes and subscribe to trackorderchanged for re-injection.
 * Safe to call multiple times (e.g. after createBrowser and after loadSession).
 *
 * @param {Object} browser - IGV browser instance
 * @param {Object} igvPanel - IGVPanel instance
 */
function installShim(browser, igvPanel) {
    if (!browser) return

    injectCheckboxes(browser, igvPanel)

    if (!browser._embeddingShimInstalled) {
        browser._embeddingShimInstalled = true
        browser.on('trackorderchanged', () => {
            injectCheckboxes(browser, igvPanel)
        })
    }
}

export { installShim, injectCheckboxes, MATERIAL_PROVIDER_EXCLUSION_TYPES }
