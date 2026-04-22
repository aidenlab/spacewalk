import { ensembleManager } from "../app.js"

/**
 * Return vertex lists for datasources that compute them in-process (CNDB).
 * SWB no longer goes through here — liveContactMapService hands the HDF5
 * handle directly to hic-straw's LiveContactMap.
 *
 * @returns {Promise<Array<Array<{x, y, z, isMissingData?}>>>}
 */
async function ensureLiveMapVertexLists() {

    if (!ensembleManager || !ensembleManager.locus) {
        throw new Error('No ensemble loaded')
    }

    return ensembleManager.getLiveMapVertexLists()
}

export { ensureLiveMapVertexLists }
