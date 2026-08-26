/**
 * Is a Hi-C map — a static, externally measured contact map loaded from a .hic
 * URL — currently the active map in Juicebox?
 *
 * False for a live contact map, which Spacewalk derives from the ensemble at
 * view time, and false when no map is loaded or the browser doesn't exist yet
 * (JuiceboxPanel leaves `browser` null when session restore fails).
 *
 * The flag is juicebox.js's — `dataset.isLive`, set in hicDataset from
 * `config.liveContactMap`. It replaced an older name in Sept 2024, and the two
 * session guards went on testing the dead name for eighteen months (#84): the
 * comparison was vacuously true, so live contact maps were serialized into
 * saved sessions and shared session URLs. This lives in one place so the three
 * callers cannot drift apart again. `browser.dataset` and `browser.activeDataset`
 * are aliases for the same accessor in juicebox.js; `dataset` is the spelling
 * aidenlab/juicebox.js#468 canonicalizes on.
 */
function isHicMapLoaded(browser) {
    return Boolean(browser?.dataset) && !browser.dataset.isLive
}

export { isHicMapLoaded }
