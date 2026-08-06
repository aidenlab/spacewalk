import hic from 'juicebox.js'
import {BGZip} from 'igv-utils'
import Panel from './panel.js'
import { shortenURL } from "./share/shareHelper.js"
import { SpacewalkGlobals } from './spacewalkGlobals.js'
import GUIManager from "./guiManager.js"
import { presentResourceError, presentResourceErrors } from "./widgets/presentResourceError.js"
import { isHicMapLoaded } from "./juicebox/hicMapState.js"

class SessionService {

    constructor({ ensembleManager, sceneManager, igvPanel, juiceboxPanel, trackMaterialProvider, cameraLightingRig, ensembleIngestionController }) {
        this.ensembleManager = ensembleManager
        this.sceneManager = sceneManager
        this.igvPanel = igvPanel
        this.juiceboxPanel = juiceboxPanel
        this.trackMaterialProvider = trackMaterialProvider
        this.cameraLightingRig = cameraLightingRig
        this.ensembleIngestionController = ensembleIngestionController
    }

    async loadSession(json) {

        try {
            await this.loadSpacewalkSession(json.spacewalk)
        } catch (e) {
            // The ensemble (.sw) is the spine of the restore and has already been
            // reported by loadSpacewalkSession. Abort rather than load IGV/Juicebox
            // against a half-purged scene.
            return
        }

        // The ensemble spine is loaded. The remaining sub-loads are best-effort:
        // a dead .hic map or a missing IGV track shouldn't blank the app or abort
        // the rest of the restore. Collect each failure and report them together
        // in one dialog at the end rather than throwing on the first (which used
        // to skip everything after it) or stacking N separate dialogs.
        const problems = []

        if (json.juicebox) {
            try {
                await this.juiceboxPanel.loadSession(json.juicebox)
            } catch (e) {
                problems.push({ err: e, what: 'the Juicebox contact map' })
            }
        } else {
            const { chr, genomicStart, genomicEnd } = json.spacewalk.locus
            this.juiceboxPanel.locus = `${chr}:${genomicStart}-${genomicEnd}`
        }

        try {
            await this.loadIGVSession(json.spacewalk, json.igv)
        } catch (e) {
            problems.push({ err: e, what: 'the IGV tracks' })
        }

        // CRITICAL: After all sessions are loaded, apply the session's ensemble locus as the single source of truth
        // This ensures that regardless of what locus each component (Juicebox, IGV) derived from
        // its session state, they all use the ensemble locus from json.spacewalk.locus.
        // This keeps everything in lockstep - the ensemble locus is the authoritative value.
        // Note: We use json.spacewalk.locus directly (the session's saved locus) rather than
        // ensembleManager.locus (which may have been derived from the ensemble file) to ensure
        // we restore the exact locus that was saved in the session.
        const { chr, genomicStart, genomicEnd } = json.spacewalk.locus
        const sessionLocus = { chr, genomicStart, genomicEnd }

        // Apply to Juicebox (overrides any locus from juicebox session state)
        // Only apply if browser exists and genome is loaded (i.e., a Hi-C map has been loaded)
        if (this.juiceboxPanel.browser && this.juiceboxPanel.browser.genome) {
            try {
                await this.juiceboxPanel.browser.parseGotoInput(`${chr}:${genomicStart}-${genomicEnd}`)
            } catch (error) {
                console.warn('Error applying session ensemble locus to Juicebox after session load:', error.message)
            }
        }

        // Apply to IGV (overrides any locus from IGV session state)
        try {
            await this.igvPanel.locusDidChange(sessionLocus)
        } catch (error) {
            console.warn('Error applying session ensemble locus to IGV after session load:', error.message)
        }

        // One consolidated report for the best-effort sub-loads above. No-op when
        // they all succeeded. (The locus re-applies are intentionally not folded
        // in — they're lockstep sync of an already-loaded browser, not resource
        // fetches, and stay as console warnings.)
        presentResourceErrors(problems)
    }

    async loadIGVSession(spacewalk, igv) {

        // Clearing is unconditional, and has to happen before the early return
        // below: a session carrying no IGV state still has to purge whatever
        // the previous session left behind, or those tracks survive the restore.
        this.igvPanel.browser.removeAllTracks()
        this.igvPanel.clearMaterialProviderSessionState()

        this.trackMaterialProvider.clearAllTracks()

        // A Spacewalk session need not carry an IGV block — saving with no
        // tracks loaded produces one with only `spacewalk`. igv's loadSession
        // dereferences its argument immediately, so handing it undefined throws
        // a TypeError before any fetch, which used to surface as the misleading
        // "the IGV tracks could not be loaded". Nothing left to restore here;
        // loadSession applies the session locus to the panel either way.
        if (!igv) {
            return
        }

        await this.igvPanel.browser.loadSession(igv)
        this.igvPanel.configureMouseHandlers()

        if ('none' !== spacewalk.igvPanelState) {
            await this.igvPanel.restoreSessionState(spacewalk.igvPanelState)
        }

    }

    async loadSpacewalkSession(session) {

        const {
            url,
            traceKey,
            ensembleGroupKey,
            renderStyle,
            panelVisibility,
        } = session

        GUIManager.updateRenderStyleWidgetState(renderStyle)

        // Restore saved panel visibility before ingesting. setState only
        // presents/dismisses panels from the saved flags — it's independent of
        // the ensemble — and ingestEnsemblePath now posts DidLoadEnsembleFile
        // itself, so panel visibility must be settled before that fires.
        //
        // TODO: Gnomon, ground plane, scale bars, and background color are now
        // managed by SettingsManager (localStorage). Session values are ignored
        // during testing of the new settings approach.
        Panel.setState(panelVisibility)

        try {
            await this.ensembleIngestionController.ingestEnsemblePath(url, traceKey, ensembleGroupKey)
        } catch (error) {
            presentResourceError(error, { what: 'the Spacewalk ensemble', url })
            throw error
        }

    }

    async getShareURL() {

        const spacewalkCompressedSession = this.getCompressedSession()

        if (spacewalkCompressedSession) {
            const igvCompressedSession = this.igvPanel.browser.compressedSession()

            let juiceboxCompressedSession
            if (isHicMapLoaded(this.juiceboxPanel.browser)) {
                // Note format is: session=blob:${BGZip.compressString(jsonString)}
                juiceboxCompressedSession = hic.compressedSession()
            }

            const path = window.location.href.slice()
            const index = path.indexOf("?")
            const prefix = index > 0 ? path.substring(0, index) : path

            // Encode blob values so special chars (=, &, etc.) in compressed data don't break URL parsing
            const spacewalkParam = encodeURIComponent(`blob:${spacewalkCompressedSession}`)
            const igvParam = encodeURIComponent(`blob:${igvCompressedSession}`)

            let url = `${prefix}?spacewalkSessionURL=${spacewalkParam}&sessionURL=${igvParam}`
            if (juiceboxCompressedSession) {
                const [jKey, jVal] = juiceboxCompressedSession.split('=', 2)
                url += `&${jKey}=${encodeURIComponent(jVal)}`
            }

            return shortenURL(url)

        } else {
            return undefined
        }

    }

    getCompressedSession() {
        const json = this.spacewalkToJSON()
        if (json) {
            return BGZip.compressString( JSON.stringify( json ) )
        } else {
            return undefined
        }
    }

    spacewalkToJSON() {

        if (!SpacewalkGlobals.url) {
            return undefined
        }

        const spacewalk = { url: SpacewalkGlobals.url }

        spacewalk.locus = { ...this.ensembleManager.locus }
        spacewalk.traceKey = this.ensembleManager.currentIndex.toString()
        spacewalk.ensembleGroupKey = this.ensembleManager.datasource.currentEnsembleGroupKey
        spacewalk.igvPanelState = this.igvPanel.getSessionState()
        spacewalk.renderStyle = this.sceneManager.renderStyle
        spacewalk.panelVisibility = Panel.toJSON()

        // TODO: Gnomon, ground plane, scale bars, and background color are now
        // managed by SettingsManager (localStorage). No longer saved to session files.

        spacewalk.cameraLightingRig = this.cameraLightingRig.getState()

        return spacewalk
    }

    toJSON() {

        const spacewalk = this.spacewalkToJSON()

        if (!spacewalk) {
            return undefined
        }

        const igv = this.igvPanel.browser.toJSON()

        const json = { spacewalk, igv }

        if (isHicMapLoaded(this.juiceboxPanel.browser)) {
            json.juicebox = hic.toJSON()
        }

        return json
    }
}

export { SessionService };
