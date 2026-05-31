import GUIManager from './guiManager.js'
import PointCloud from './pointCloud.js'
import { unsetDataMaterialProviderCheckbox } from './utils/utils.js'

/**
 * Orchestrates loading an ensemble (or switching ensemble groups) into the app.
 * Coordinates EnsembleManager, SceneManager, IGVPanel, and the color-ramp
 * material provider. This isn't scene management per se — it's app-level glue
 * that used to live on SceneManager and made it harder to read.
 */
class EnsembleIngestionController {

    constructor({ ensembleManager, sceneManager, igvPanel, colorRampMaterialProvider, genomicNavigator, trackMaterialProvider }) {
        this.ensembleManager = ensembleManager
        this.sceneManager = sceneManager
        this.igvPanel = igvPanel
        this.colorRampMaterialProvider = colorRampMaterialProvider
        this.genomicNavigator = genomicNavigator
        this.trackMaterialProvider = trackMaterialProvider
    }

    async ingestEnsemblePath(url, traceKey, ensembleGroupKey) {
        const { ensembleManager, sceneManager, igvPanel, colorRampMaterialProvider, genomicNavigator, trackMaterialProvider } = this
        sceneManager.isLoading = true
        try {
            await ensembleManager.loadURL(url, traceKey, ensembleGroupKey)

            sceneManager.setupWithTrace(ensembleManager.currentTrace)
            sceneManager.configureRenderStyle(ensembleManager.isPointCloud === true ? PointCloud.renderStyle : GUIManager.getRenderStyleWidgetState())

            // Cached per-track color lists are keyed to the prior ensemble's
            // genomic extent. Drop them on full ensemble load — mismatched
            // lengths crash the blend loop, and an empty list crashes the
            // navigator repaint below.
            trackMaterialProvider.clearAllTracks()

            unsetDataMaterialProviderCheckbox(igvPanel)
            // Flip IGVPanel off the now-empty trackMaterialProvider before
            // anyone repaints through it. DidLoadEnsembleFile would do this
            // too, but it fires after this method returns.
            igvPanel.materialProvider = colorRampMaterialProvider
            sceneManager.updateMaterialProvider(colorRampMaterialProvider)
            genomicNavigator.repaint()

            if (ensembleManager.genomeAssembly !== igvPanel.browser.genome.id) {
                console.log(`Genome swap from ${ igvPanel.browser.genome.id } to ${ ensembleManager.genomeAssembly }. Call igv_browser.loadGenome`)
                await igvPanel.browser.loadGenome(ensembleManager.genomeAssembly)
            }

            await igvPanel.locusDidChange(ensembleManager.locus)
        } catch (error) {
            console.error('Error loading ensemble:', error)
            sceneManager.purgeScene()
            throw error
        } finally {
            sceneManager.isLoading = false
        }
    }

    async ingestEnsembleGroup(ensembleGroupKey) {
        const { ensembleManager, sceneManager, igvPanel, colorRampMaterialProvider, genomicNavigator } = this
        sceneManager.isLoading = true
        try {
            await ensembleManager.loadEnsembleGroup(ensembleGroupKey)

            sceneManager.setupWithTrace(ensembleManager.currentTrace)
            sceneManager.configureRenderStyle(ensembleManager.isPointCloud === true ? PointCloud.renderStyle : GUIManager.getRenderStyleWidgetState())

            unsetDataMaterialProviderCheckbox(igvPanel)
            sceneManager.updateMaterialProvider(colorRampMaterialProvider)
            genomicNavigator.repaint()

            await igvPanel.locusDidChange(ensembleManager.locus)
        } catch (error) {
            console.error('Error loading ensemble group:', error)
            sceneManager.purgeScene()
            throw error
        } finally {
            sceneManager.isLoading = false
        }
    }
}

export default EnsembleIngestionController
