import { juiceboxPanel } from '../app.js'
import SpacewalkEventBus from '../spacewalkEventBus.js'
import { renderDistanceMap } from './liveMapRenderUtils.js'

class LiveDistanceMapService {

    constructor() {
        this.lcm = null
        SpacewalkEventBus.globalBus.subscribe('DidLoadEnsembleFile', this)
    }

    receiveEvent({ type, data }) {
        if ('DidLoadEnsembleFile' === type) {
            this.lcm = null

            // Clear distance canvas
            const ctx = juiceboxPanel?.browser?.contactMatrixView?.ctx_live_distance
            if (ctx) {
                ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
            }
        }
    }

    /**
     * Render the distance map using data from a shared LiveContactMap instance.
     * Called by LiveContactMapService after the Calculate button is pressed.
     *
     * @param {LiveContactMap} lcm - The initialized LiveContactMap instance
     */
    renderFromLiveContactMap(lcm) {

        this.lcm = lcm

        const ctx = juiceboxPanel?.browser?.contactMatrixView?.ctx_live_distance
        if (!ctx) {
            console.warn('Live distance canvas context not available')
            return
        }

        renderDistanceMap(ctx, lcm)
    }

    getClassName() {
        return 'LiveDistanceMapService'
    }
}

export default LiveDistanceMapService
