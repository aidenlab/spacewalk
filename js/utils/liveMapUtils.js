import { ensembleManager } from "../app.js"
import SWBDatasource from "../datasource/SWBDatasource.js"

/**
 * Ensure live map vertex lists are computed and return them.
 * Lazily triggers calculation on SWBDatasource if not yet done.
 *
 * @returns {Promise<Array<Array<{x, y, z, isMissingData?}>>>} traces — array of vertex lists per trace
 */
async function ensureLiveMapVertexLists() {

    if (!ensembleManager || !ensembleManager.locus) {
        throw new Error('No ensemble loaded')
    }

    if (ensembleManager.datasource instanceof SWBDatasource) {
        if (!ensembleManager.datasource.liveContactFrequencyMapVertexLists) {
            await ensembleManager.datasource.calculateLiveMapVertexLists()
        }
    }

    return ensembleManager.getLiveMapVertexLists()
}

export { ensureLiveMapVertexLists }
