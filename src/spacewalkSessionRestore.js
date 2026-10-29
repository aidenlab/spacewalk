import GUIManager from "./guiManager.js"
import { readStructureAppearance } from "./structureAppearance.js"

/**
 * Restore the 3D viewer's part of a `spacewalk` session block: render style,
 * structure appearance, then the ensemble at its group and trace. Shared by the
 * full app (SessionService) and the viewer page, so both read a session the same
 * way; it imports nothing from igv or juicebox.js. The block's shape is in
 * development-notes/spacewalk-mcp/session-format.md.
 *
 * Rejects if the ensemble cannot be loaded; the caller reports it.
 */
async function restoreSpacewalkSession({ sceneManager, ensembleIngestionController }, session) {

    const { url, traceKey, ensembleGroupKey, renderStyle, structureAppearance } = session

    GUIManager.updateRenderStyleWidgetState(renderStyle)

    // Before ingesting: the new trace is built with it. A session written
    // before structure appearance existed carries none and loads with defaults.
    const appearance = readStructureAppearance(structureAppearance)
    sceneManager.setStructureAppearance(appearance)
    GUIManager.updateStructureAppearanceWidgetState(appearance)

    await ensembleIngestionController.ingestEnsemblePath(url, traceKey, ensembleGroupKey)
}

export { restoreSpacewalkSession }
