import {ensembleManager, igvPanel} from "./app.js";
import {setGeometryColorAttribute} from "./pointCloud.js";

class PointCloudHighlighter {

    constructor () {
        this.objects = undefined
        this.meshList = undefined
        this.material = undefined
        this.deemphasizedMaterial = undefined
    }

    /**
     * Set the point cloud context this highlighter operates on.
     * Called each time a new PointCloud is created.
     */
    setPointCloudContext({ meshList, material, deemphasizedMaterial }) {
        this.meshList = meshList
        this.material = material
        this.deemphasizedMaterial = deemphasizedMaterial
    }

    highlightWithObjectList(objectList) {

        if (this.objects && this.objects.length === objectList.length) {

            const delta = objectList.filter((object, i) => object.uuid !== this.objects[ i ].uuid)
            if (0 === delta.length) {
                return
            }

        }

        // this.unhighlight()
        this.objects = [ ...objectList ]
        this.highlight()
    }

    highlight() {

        if (this.meshList) {

            for (const mesh of this.meshList) {
                mesh.material = this.deemphasizedMaterial

                // Ensure deemphasized points are drawn BEFORE highlighted points
                mesh.renderOrder = 0;

                mesh.geometry.setAttribute('color', mesh.geometry.userData.deemphasisColorAttribute)
                mesh.geometry.attributes.color.needsUpdate = true
            }

            for (const mesh of this.objects) {

                mesh.material = this.material

                // Ensure highlighted points are drawn AFTER deemphasized points
                mesh.renderOrder = 1;

                const index = this.meshList.indexOf(mesh)
                const { interpolant } = ensembleManager.currentTrace[ index ]
                const rgb = igvPanel.materialProvider.colorForInterpolant(interpolant)

                setGeometryColorAttribute(mesh.geometry.userData.colorAttribute.array, rgb)
                mesh.geometry.setAttribute('color', mesh.geometry.userData.colorAttribute)
                mesh.geometry.attributes.color.needsUpdate = true
            }

        }

    }

    unhighlight() {

        if (this.meshList) {

            for (const mesh of this.meshList) {

                mesh.material = this.material

                const index = this.meshList.indexOf(mesh)
                const { interpolant } = ensembleManager.currentTrace[ index ]
                const rgb = igvPanel.materialProvider.colorForInterpolant(interpolant)

                setGeometryColorAttribute(mesh.geometry.userData.colorAttribute.array, rgb)
                mesh.geometry.setAttribute('color', mesh.geometry.userData.colorAttribute)
                mesh.geometry.attributes.color.needsUpdate = true
            }

        }



        this.objects = undefined
    }

}

export default PointCloudHighlighter
