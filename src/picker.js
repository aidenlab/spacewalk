const exclusionSet = new Set([ 'gnomon', 'groundplane', 'point_cloud', 'ribbon', 'stick' ]);

let currentInstanceId = undefined

/**
 * The 3D-canvas hover producer. Like every other highlight producer
 * (igvCursorGuide, genomicNavigator, juiceboxPanel) it reports its selection to
 * highlightController.set/clear; the difference is it is pumped by the render
 * loop (intersect() runs every frame) rather than by its own mousemove listener.
 *
 * Because it runs every frame, it must only raycast when the pointer is actually
 * over the canvas — otherwise it would re-pick on frozen coordinates and trample
 * whichever 1D producer is currently driving. ThreeJSInitializer nulls the
 * pointer coordinates on canvas mouseleave (so intersect() no-ops while the
 * cursor is over a 1D producer) and calls onPointerLeftCanvas() to clear the
 * picker's own highlight at that transition. This replaces the former
 * isEnabled flag toggled by DidEnter/LeaveGenomicNavigator.
 */
class Picker {

    constructor(raycaster) {
        this.raycaster = raycaster;
        this.sceneManager = null
        this.genomicNavigator = null
    }

    wireDependencies({ sceneManager, genomicNavigator }) {
        this.sceneManager = sceneManager
        this.genomicNavigator = genomicNavigator
    }

    /**
     * The pointer left the 3D canvas. Clear the picker's highlight in one shot —
     * safe because it fires at the canvas-exit transition, before any 1D producer
     * has driven. (The per-frame intersect() must NOT clear on absent coordinates,
     * or it would erase a producer's highlight every frame.)
     */
    onPointerLeftCanvas() {
        if (undefined !== currentInstanceId) {
            currentInstanceId = undefined
            this.sceneManager?.highlightController?.clear('pickerLeftCanvas')
            this.genomicNavigator?.repaint()
        }
    }

    intersect({ x ,y, camera, scene }) {

        // null x/y == pointer is not over the canvas (see ThreeJSInitializer).
        if (null !== x && null !== y) {

            this.raycaster.setFromCamera({ x, y }, camera)

            const hitList = this.raycaster.intersectObjects(scene.children).filter(item => !exclusionSet.has(item.object.name) && true === item.object.visible)

            if (hitList.length > 0) {
                const [ hit ] = hitList

                if (hit.instanceId && hit.instanceId !== currentInstanceId) {
                    currentInstanceId = hit.instanceId
                    // The picker is discrete: the bead sits at the picked window's center.
                    const { interpolant } = this.sceneManager.ensembleManager.getCurrentGenomicExtentList()[ hit.instanceId ]
                    this.sceneManager.highlightController.set([ { index: hit.instanceId, interpolant } ], 'picker')
                }

            } else {

                if (currentInstanceId) {
                    currentInstanceId = undefined
                    this.sceneManager.highlightController.clear('picker')
                    this.genomicNavigator.repaint()
                }
            }

        }
    }
}

export default Picker;
