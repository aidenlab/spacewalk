import SpacewalkEventBus from './spacewalkEventBus.js'
import { hideGlobalSpinner } from './utils/utils.js'
import { parseLaunchIntent } from './launchIntent.js'
import { uncompressSessionURL } from './sessionURLCodec.js'

/**
 * Executes the launch intent produced by parseLaunchIntent: a thin, side-effecting
 * dispatcher over the pure decision. All the parsing/precedence logic lives (and is
 * tested) in launchIntent.js; this wires the decision to the loaders and performs
 * the mechanical BGZip-decode + JSON.parse of any session blobs.
 */
class SessionBootstrapper {

    constructor({ ensembleManager, ensembleIngestionController, sessionService }) {
        this.ensembleManager = ensembleManager
        this.ensembleIngestionController = ensembleIngestionController
        this.sessionService = sessionService
    }

    async run(href) {

        const intent = parseLaunchIntent(href)

        switch (intent.kind) {

            case 'file':
                try {
                    await this.ensembleIngestionController.ingestEnsemblePath(intent.fileURL, intent.traceKey, intent.ensembleGroupKey)
                    const data = this.ensembleManager.createEventBusPayload()
                    SpacewalkEventBus.globalBus.post({ type: 'DidLoadEnsembleFile', data })
                } catch (error) {
                    console.error('Failed to load file from URL params:', error)
                    hideGlobalSpinner()
                }
                return

            case 'session': {
                const sessions = {}
                for (const [ source, raw ] of Object.entries(intent.sessions)) {
                    sessions[source] = JSON.parse(uncompressSessionURL(raw))
                }
                await this.sessionService.loadSession(sessions)
                return
            }

            case 'none':
            default:
                return
        }
    }
}

export default SessionBootstrapper
