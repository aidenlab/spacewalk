import SpacewalkEventBus from '../spacewalkEventBus.js'

class LiveDistanceMapService {

    constructor({ liveMapView }) {
        this.liveMapView = liveMapView
        this.lcm = null
        SpacewalkEventBus.globalBus.subscribe('DidLoadEnsembleFile', this)
    }

    receiveEvent({ type, data }) {
        if ('DidLoadEnsembleFile' === type) {
            // Canvas clearing is handled by JuiceboxPanel via liveMapView.clear();
            // here we only drop the compute state.
            this.lcm = null
        }
    }

    /**
     * Render the distance map using data from a shared LiveContactMap instance.
     * Called by LiveContactMapService after the Calculate button is pressed.
     *
     * @param {LiveContactMap} lcm - The initialized LiveContactMap instance
     * @param {Object} [colorConfig] - Optional color configuration { background: {r,g,b} }
     */
    renderFromLiveContactMap(lcm, colorConfig) {
        this.lcm = lcm
        this.liveMapView.renderDistance(lcm, colorConfig)
    }

    getClassName() {
        return 'LiveDistanceMapService'
    }
}

export default LiveDistanceMapService
