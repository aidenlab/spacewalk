import SpacewalkEventBus from './spacewalkEventBus.js'

const exclusionSet = new Set([ 'gnomon', 'groundplane', 'point_cloud', 'ribbon', 'stick' ]);

let currentInstanceId = undefined
class Picker {

    constructor(raycaster) {
        this.raycaster = raycaster;
        this.isEnabled = true;
        this.sceneManager = null
        this.genomicNavigator = null

        SpacewalkEventBus.globalBus.subscribe("DidEnterGenomicNavigator", this);
        SpacewalkEventBus.globalBus.subscribe("DidLeaveGenomicNavigator", this);
    }

    wireDependencies({ sceneManager, genomicNavigator }) {
        this.sceneManager = sceneManager
        this.genomicNavigator = genomicNavigator
    }

    receiveEvent({ type, data }) {

        if ("DidEnterGenomicNavigator" === type) {
            this.isEnabled = false;
            this.sceneManager?.ballHighlighter?.unhighlight()
        } else if ("DidLeaveGenomicNavigator" === type) {
            this.isEnabled = true;
            this.sceneManager?.ballHighlighter?.unhighlight()
        }

    }

    intersect({ x ,y, camera, scene }) {

        if (true === this.isEnabled && x && y) {

            this.raycaster.setFromCamera({ x, y }, camera)

            const hitList = this.raycaster.intersectObjects(scene.children).filter(item => !exclusionSet.has(item.object.name) && true === item.object.visible)

            if (hitList.length > 0) {
                const [ hit ] = hitList

                if (hit.instanceId && hit.instanceId !== currentInstanceId) {
                    currentInstanceId = hit.instanceId
                    this.sceneManager.ballHighlighter.processHit(hit)
                }

            } else {

                if (currentInstanceId) {
                    currentInstanceId = undefined
                    this.sceneManager.ballHighlighter.unhighlight()
                    this.genomicNavigator.repaint()
                }
            }

        }
    }
}

export default Picker;
