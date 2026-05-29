class BallHighlighter {

    constructor (highlightColor, { ensembleManager, igvPanel, genomicNavigator }) {
        this.highlightColor = highlightColor;
        this.ensembleManager = ensembleManager
        this.igvPanel = igvPanel
        this.genomicNavigator = genomicNavigator
        this.instanceIdList = undefined
        this.balls = undefined
    }

    /**
     * Set the balls InstancedMesh this highlighter operates on.
     * Called each time a new BallAndStick is created.
     */
    setBalls(balls) {
        this.balls = balls
    }

    processHit(hit) {
        if (false === this.hasInstanceId(hit.instanceId)) {
            this.configureWithInstanceIdList([hit.instanceId])
        }
    }

    hasInstanceId(instanceId) {
        if (undefined === this.instanceIdList) {
            return false
        } else {
            return this.instanceIdList.has(instanceId)
        }
    }

    configureWithInstanceIdList(instanceIdList) {
        this.unhighlight()
        this.instanceIdList = new Set()
        for (let instanceId of instanceIdList) {
            this.instanceIdList.add(instanceId)
        }
        this.highlight()
    }

    highlight() {

        if (this.balls && this.instanceIdList) {

            const bufferAttribute = this.balls.geometry.getAttribute('instanceColor')

            for (const instanceId of this.instanceIdList) {
                this.highlightColor.toArray(bufferAttribute.array, instanceId * 3)
            }

            this.balls.geometry.attributes.instanceColor.needsUpdate = true

            const genomicExtentList = this.ensembleManager.getCurrentGenomicExtentList()
            const interpolantWindowList = Array.from(this.instanceIdList).map(instanceId => genomicExtentList[ instanceId ])
            this.genomicNavigator.highlightWithInterpolantWindowList(interpolantWindowList)

        }

    }

    unhighlight() {

        if (this.balls && this.instanceIdList) {

            const bufferAttribute = this.balls.geometry.getAttribute('instanceColor')

            const genomicExtentList = this.ensembleManager.getCurrentGenomicExtentList()
            for (const instanceId of this.instanceIdList) {
                const color = this.igvPanel.materialProvider.colorForInterpolant(genomicExtentList[ instanceId ].interpolant)
                color.toArray(bufferAttribute.array, instanceId * 3)
            }

            this.balls.geometry.attributes.instanceColor.needsUpdate = true;

            this.instanceIdList = undefined
         }

    }

}

export default BallHighlighter;
