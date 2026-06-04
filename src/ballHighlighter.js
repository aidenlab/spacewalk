class BallHighlighter {

    constructor (highlightColor, { ensembleManager, igvPanel }) {
        this.highlightColor = highlightColor;
        this.ensembleManager = ensembleManager
        this.igvPanel = igvPanel
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
