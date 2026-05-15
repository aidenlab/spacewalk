import * as THREE from "three"
import hic from 'juicebox.js'
import {BGZip} from 'igv-utils'
import Panel from './panel.js'
import SpacewalkEventBus from './spacewalkEventBus.js'
import { shortenURL } from "./share/shareHelper.js"
import {
    scene,
    trackMaterialProvider,
    igvPanel,
    juiceboxPanel,
    ensembleManager,
    sceneManager,
    cameraLightingRig,
} from './app.js'
import { SpacewalkGlobals } from './spacewalkGlobals.js'
import GUIManager from "./guiManager.js"

async function loadSession(json) {

    await loadSpacewalkSession(json.spacewalk)

    if (json.juicebox) {
        await juiceboxPanel.loadSession(json.juicebox)
    } else {
        const { chr, genomicStart, genomicEnd } = json.spacewalk.locus
        juiceboxPanel.locus = `${chr}:${genomicStart}-${genomicEnd}`
    }

    await loadIGVSession(json.spacewalk, json.igv)

    // CRITICAL: After all sessions are loaded, apply the session's ensemble locus as the single source of truth
    // This ensures that regardless of what locus each component (Juicebox, IGV) derived from
    // its session state, they all use the ensemble locus from json.spacewalk.locus.
    // This keeps everything in lockstep - the ensemble locus is the authoritative value.
    // Note: We use json.spacewalk.locus directly (the session's saved locus) rather than
    // ensembleManager.locus (which may have been derived from the ensemble file) to ensure
    // we restore the exact locus that was saved in the session.
    const { chr, genomicStart, genomicEnd } = json.spacewalk.locus
    const sessionLocus = { chr, genomicStart, genomicEnd }

    // Update ensembleManager's datasource locus to match session (if datasource supports it)
    // This ensures ensembleManager.locus getter returns the session locus
    // if (ensembleManager && ensembleManager.datasource && ensembleManager.datasource.locus) {
    //     ensembleManager.datasource.locus = sessionLocus
    // }

    // Apply to Juicebox (overrides any locus from juicebox session state)
    // Only apply if browser exists and genome is loaded (i.e., a Hi-C map has been loaded)
    if (juiceboxPanel.browser && juiceboxPanel.browser.genome) {
        try {
            await juiceboxPanel.browser.parseGotoInput(`${chr}:${genomicStart}-${genomicEnd}`)
        } catch (error) {
            console.warn('Error applying session ensemble locus to Juicebox after session load:', error.message)
        }
    }

    // Apply to IGV (overrides any locus from IGV session state)
    try {
        await igvPanel.locusDidChange(sessionLocus)
    } catch (error) {
        console.warn('Error applying session ensemble locus to IGV after session load:', error.message)
    }
}

async function loadIGVSession(spacewalk, igv) {

    igvPanel.browser.removeAllTracks()
    igvPanel.clearMaterialProviderSessionState()

    // Clear any existing track colors from previous session

    trackMaterialProvider.clearAllTracks();

    await igvPanel.browser.loadSession(igv)
    igvPanel.configureMouseHandlers()

    if ('none' !== spacewalk.igvPanelState) {
        await igvPanel.restoreSessionState(spacewalk.igvPanelState)
    }

}

async function loadSpacewalkSession (session) {

    const {
        url,
        traceKey,
        ensembleGroupKey,
        renderStyle,
        gnomonColor,
        gnomonVisibility,
        groundplaneColor,
        groundPlaneVisibility,
        rulerColor,
        rulerVisibility,
        panelVisibility,
        cameraLightingRig,
        backgroundColor
    } = session

    GUIManager.updateRenderStyleWidgetState(renderStyle)

    try {
        await sceneManager.ingestEnsemblePath(url, traceKey, ensembleGroupKey)

        // TODO: Gnomon, ground plane, scale bars, and background color are now
        // managed by SettingsManager (localStorage). Session values are ignored
        // during testing of the new settings approach.
        // const gnomonInstance = sceneManager.getGnomon()
        // gnomonInstance.setState({ visibility: gnomonVisibility, ...gnomonColor })
        // const groundPlaneInstance = sceneManager.getGroundPlane()
        // groundPlaneInstance.setState({ visibility: groundPlaneVisibility, ...groundplaneColor })
        // if (rulerColor && rulerVisibility) {
        //     scaleBarService.setState({ visibility: rulerVisibility, ...rulerColor })
        // }
        // if (backgroundColor) {
        //     const { r, g, b } = backgroundColor
        //     scene.background = new THREE.Color(r, g, b)
        // }

        Panel.setState(panelVisibility)

        const data = ensembleManager.createEventBusPayload()
        SpacewalkEventBus.globalBus.post({ type: "DidLoadEnsembleFile", data })
    } catch (error) {
        console.error('Failed to load session:', error)
    }

}

function getUrlParams(url) {

    const search = decodeURIComponent( url.slice( url.indexOf( '?' ) + 1 ) );

    return search
        .split('&')
        .reduce((acc, key_value) => {

            const [ key, value ] = key_value.split( '=', 2 );
            acc[ key ] = value;
            return acc;
        }, {});

}

async function getShareURL() {

    const spacewalkCompressedSession = getCompressedSession()

    if (spacewalkCompressedSession) {
        const igvCompressedSession = igvPanel.browser.compressedSession()

        let juiceboxCompressedSession
        if (juiceboxPanel.browser.dataset && undefined === juiceboxPanel.browser.dataset.isLiveContactMapDataSet) {
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

function getCompressedSession() {
    const json = spacewalkToJSON()
    if (json) {
        return BGZip.compressString( JSON.stringify( json ) )
    } else {
        return undefined
    }

}

function spacewalkToJSON () {

    let spacewalk
    if (SpacewalkGlobals.url) {

        spacewalk = { url: SpacewalkGlobals.url }

        spacewalk.locus = { ...ensembleManager.locus }

        spacewalk.traceKey = ensembleManager.currentIndex.toString()

        spacewalk.ensembleGroupKey = ensembleManager.datasource.currentEnsembleGroupKey

        spacewalk.igvPanelState = igvPanel.getSessionState()

        spacewalk.renderStyle = sceneManager.renderStyle

        spacewalk.panelVisibility = Panel.toJSON()

        // TODO: Gnomon, ground plane, scale bars, and background color are now
        // managed by SettingsManager (localStorage). No longer saved to session files.
        // let json
        // json = sceneManager.getGnomon().toJSON()
        // spacewalk.gnomonVisibility = json.visibility
        // spacewalk.gnomonColor = { r:json.r, g:json.g, b:json.b }
        // json = sceneManager.getGroundPlane().toJSON()
        // spacewalk.groundPlaneVisibility = json.visibility
        // spacewalk.groundplaneColor = { r:json.r, g:json.g, b:json.b }
        // json = scaleBarService.toJSON()
        // spacewalk.rulerVisibility = json.visibility
        // spacewalk.rulerColor = { r:json.r, g:json.g, b:json.b }
        // spacewalk.backgroundColor = sceneManager.toJSON()

        spacewalk.cameraLightingRig = cameraLightingRig.getState()

        return spacewalk
    } else {
        return undefined
    }


}

function toJSON () {

    const spacewalk = spacewalkToJSON()

    if (spacewalk) {
        const igv = igvPanel.browser.toJSON()

        const json = { spacewalk, igv }

        if (juiceboxPanel.browser.dataset && undefined === juiceboxPanel.browser.dataset.isLiveContactMapDataSet) {
            json.juicebox = hic.toJSON()
        }

        return json

    } else {
        return undefined
    }


}

function uncompressSessionURL(sessionURL) {

    if (sessionURL.indexOf('/gzip;base64') > 0) {

        const bytes = BGZip.decodeDataURI(sessionURL, undefined)
        let json = '';
        for (let b of bytes) {
            json += String.fromCharCode(b)
        }
        return json;
    } else {

        const enc = sessionURL.slice(5);
        return BGZip.uncompressString(enc)
    }
}

export { getShareURL, getUrlParams, toJSON, loadSession, uncompressSessionURL };
