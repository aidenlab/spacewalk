import * as THREE from "three"
import {StringUtils} from "igv-utils"
import EnsembleManager from "./ensembleManager.js"
import {clamp} from "./utils/mathUtils.js"
import ConvexHull from "./utils/convexHull.js"
import { disposeMaterial, removeAndDisposeArrayFromScene } from './utils/disposalUtils.js'

class PointCloud {

    static renderStyle = 'render-style-point-cloud'

    constructor ({ trace, pickHighlighter, deemphasizedColor, pointSizeBoundRadiusPercentage, pointOpacity, ensembleManager, igvPanel }) {
        this.pickHighlighter = pickHighlighter
        this.deemphasizedColor = deemphasizedColor
        this.ensembleManager = ensembleManager
        this.igvPanel = igvPanel

        this.pointOpacity = pointOpacity ?? 0.375
        this.deemphasizedPointOpacity = 0.125/4

        this.createMaterials()

        // Scale point size to pointcloud bbox for reasonable starting point size
        const { radius } = EnsembleManager.getTraceBounds(trace)

        this.pointSizeBoundRadiusPercentage = pointSizeBoundRadiusPercentage
        this.pointSize = undefined === this.pointSizeBoundRadiusPercentage ? Math.max(4, Math.floor(radius/16)) : this.pointSizeBoundRadiusPercentage * radius
        document.querySelector('#spacewalk_ui_manager_pointcloud_point_size_label').innerHTML = `Point Size (${ Math.floor(this.pointSize)} nm)`

        this.material.size = this.pointSize
        this.deemphasizedMaterial.size = this.pointSize

        const list = trace.map(({ xyz }) => xyz.length / 3)
        const sum = list.reduce((total, item) => total + item)

        const str = `PointCloud. trace(${ trace.length }) points(${ StringUtils.numberFormatter(sum)})`
        console.time(str)

        this.deemphasisColorAttribute = undefined

        this.meshList = trace
            .map(({ xyz, interpolant, drawUsage }) => {

                const geometry = new THREE.BufferGeometry()

                // xyz
                geometry.setAttribute('position', new THREE.Float32BufferAttribute(xyz, 3 ))

                // rgb
                geometry.userData.colorAttribute = new THREE.Float32BufferAttribute(new Float32Array(xyz.length * 3), 3)
                geometry.userData.colorAttribute.setUsage(drawUsage)

                const rgb = this.igvPanel.materialProvider.colorForInterpolant(interpolant)
                setGeometryColorAttribute(geometry.userData.colorAttribute.array, rgb)
                geometry.setAttribute('color', geometry.userData.colorAttribute)

                // retain a copy of deemphasis color for use during highlight/unhighlight
                geometry.userData.deemphasisColorAttribute = new THREE.Float32BufferAttribute(new Float32Array(xyz.length * 3), 3)
                setGeometryColorAttribute(geometry.userData.deemphasisColorAttribute.array, this.deemphasizedColor)

                const mesh = new THREE.Points(geometry, this.material)
                mesh.name = 'point_cloud'
                return mesh
            })

        // Wire up the highlighter to our context
        this.pickHighlighter.setPointCloudContext({
            meshList: this.meshList,
            material: this.material,
            deemphasizedMaterial: this.deemphasizedMaterial
        })

        const positionArray = getPositionArray(this.meshList)
        this.hull = new ConvexHull(positionArray)
        this.hull.mesh.name = 'point_cloud_convex_hull'

        console.timeEnd(str)
    }

    createMaterials() {
        const materialConfig =
            {
                size: 4,
                vertexColors: true,
                map: new THREE.TextureLoader().load( "texture/dot.png" ),
                sizeAttenuation: true,

                depthTest: true,
                depthWrite: true,

                transparent: true,

                opacity: this.pointOpacity,
                // NOTE: alphaTest value must ALWAYS be less than opacity value
                // If not, nothing will appear onscreen
                alphaTest: this.pointOpacity/2,

            };

        this.material = new THREE.PointsMaterial( materialConfig );
        this.material.side = THREE.DoubleSide;

        const deemphasizedConfig =
            {
                size: 4,
                vertexColors: true,
                map: new THREE.TextureLoader().load( "texture/dot.png" ),
                sizeAttenuation: true,

                // Do NOT participate in depth testing or depth writing
                depthTest: false,
                depthWrite: false,

                transparent: true,

                opacity: this.deemphasizedPointOpacity,
                // NOTE: alphaTest value must ALWAYS be less than opacity value
                // If not, nothing will appear onscreen
                alphaTest: this.deemphasizedPointOpacity/2,

            };

        this.deemphasizedMaterial = new THREE.PointsMaterial( deemphasizedConfig );
        this.deemphasizedMaterial.side = THREE.DoubleSide;
    }

    /**
     * Handle genomic interpolant events (delegated from SceneManager)
     */
    handleGenomicInterpolant(data) {
        const { interpolantList } = data

        if (interpolantList) {
            const interpolantWindowList = this.ensembleManager.getGenomicInterpolantWindowList(interpolantList)

            if (interpolantWindowList) {
                const objectList = interpolantWindowList.map(({ index }) => this.meshList[ index ])
                this.pickHighlighter.highlightWithObjectList(objectList)
            }

        } else {
            this.pickHighlighter.unhighlight()
        }
    }

    /**
     * Handle leave genomic navigator event (delegated from SceneManager)
     */
    handleLeaveGenomicNavigator() {
        this.pickHighlighter.unhighlight()
    }

    updateMaterialProvider (materialProvider) {

        for (const mesh of this.meshList) {

            mesh.material = this.material

            const index = this.meshList.indexOf(mesh)
            const { interpolant } = this.ensembleManager.currentTrace[ index ]
            const rgb = materialProvider.colorForInterpolant(interpolant)

            setGeometryColorAttribute(mesh.geometry.userData.colorAttribute.array, rgb)
            mesh.geometry.setAttribute('color', mesh.geometry.userData.colorAttribute)
            mesh.geometry.attributes.color.needsUpdate = true
        }
    }

    addToScene (scene) {

        this.scene = scene
        for (let mesh of this.meshList) {
            scene.add( mesh );
        }

        // scene.add(this.hull.mesh)
    }

    dispose () {

        removeAndDisposeArrayFromScene(this.scene, this.meshList)

        if (this.hull && this.hull.mesh) {
            this.scene.remove(this.hull.mesh)
            this.hull.mesh.geometry.dispose()
            disposeMaterial(this.hull.mesh.material)
        }

        // Dispose materials
        disposeMaterial(this.material)
        disposeMaterial(this.deemphasizedMaterial)

        // Clear highlighter references to our now-disposed context
        this.pickHighlighter.setPointCloudContext({
            meshList: undefined,
            material: undefined,
            deemphasizedMaterial: undefined
        })

        this.scene = undefined
    }

    renderLoopHelper () {
        // Color updates handled by updateMaterialProvider() and highlight/unhighlight
    }

    hide () {
        for (let mesh of this.meshList) {
            mesh.visible = false;
            this.hull.mesh.visible = false;
        }
    }

    show () {
        for (let mesh of this.meshList) {
            mesh.visible = true;
        }
        this.hull.mesh.visible = true;
    }

    updatePointSize(increment) {

        this.pointSize = Math.max(4, this.pointSize + (increment < 0 ? -32 : 32))
        document.querySelector('#spacewalk_ui_manager_pointcloud_point_size_label').innerHTML = `Point Size (${ Math.floor(this.pointSize)} nm)`

        this.material.size = this.pointSize
        this.material.needsUpdate = true

        this.deemphasizedMaterial.size = this.pointSize
        this.deemphasizedMaterial.needsUpdate = true

        const { radius } = EnsembleManager.getTraceBounds(this.ensembleManager.currentTrace)
        this.pointSizeBoundRadiusPercentage = this.pointSize / radius
    }

    updatePointTransparency(increment) {

        this.pointOpacity += (increment < 0 ? -1 : 1) * (10 / 100) * this.pointOpacity
        this.pointOpacity = clamp(1/10, 9/10, this.pointOpacity)

        this.material.opacity = this.pointOpacity
        this.material.alphaTest = this.pointOpacity/2
        this.material.needsUpdate = true
    }

}

function getPositionArray(meshes){

    const positionArrays = meshes.map(mesh => mesh.geometry.attributes.position.array);

    const length = positionArrays.reduce((sum, array) => sum + array.length, 0);
    const aggregatePositionArray = new Float32Array(length);

    let offset = 0;
    for (const array of positionArrays) {
        aggregatePositionArray.set(array, offset)
        offset += array.length;
    }

    return aggregatePositionArray
}

function setGeometryColorAttribute(geometryColorAttributeArray, threeJSColor) {
    for (let c = 0; c < geometryColorAttributeArray.length; c++) {
        threeJSColor.toArray(geometryColorAttributeArray, c * 3);
    }
}

export { setGeometryColorAttribute }
export default PointCloud;
