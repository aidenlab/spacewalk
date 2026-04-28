import * as THREE from "three"
import { Line2 } from "three/examples/jsm/lines/Line2.js"
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js"
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js"
import EnsembleManager from './ensembleManager.js'
import { igvPanel, ensembleManager, scene } from "./app.js"
import { appleCrayonColorThreeJS } from "./utils/colorUtils.js"
import { getPositionArrayWithTrace } from "./utils/utils.js"
import ConvexHull from "./utils/convexHull"
import { disposeMaterial, removeAndDisposeArrayFromScene } from './utils/disposalUtils.js'

const polylineWidth = 4
const highlightBeadRadiusScalefactor = 1/(6e1)

class Polyline {

    static renderStyle = 'render-style-polyline'

    constructor(trace) {

        const traceVertices = EnsembleManager.getSingleCentroidVertices(trace, true)

        this.curve = new THREE.CurvePath()
        for (let i = 0; i < traceVertices.length - 1; i++) {
            this.curve.add(new THREE.LineCurve3(traceVertices[i], traceVertices[i + 1]))
        }
        this.curve.updateArcLengths()

        const geometry = new LineGeometry()

        const positions = []
        for (const { x, y, z } of traceVertices) {
            positions.push(x, y, z)
        }
        geometry.setPositions(positions)

        const colors = getRGBListWithMaterialAndLength(igvPanel.materialProvider, traceVertices.length)
        geometry.setColors(colors)

        const material = new LineMaterial({ linewidth: polylineWidth, vertexColors: true })

        const mesh = new Line2(geometry, material)
        mesh.computeLineDistances()
        mesh.scale.set(1, 1, 1)
        mesh.name = 'polyline'

        this.spline = { mesh, vertexCount: traceVertices.length }

        const positionArray = getPositionArrayWithTrace(trace)
        this.hull = new ConvexHull(positionArray)
        this.hull.mesh.name = 'polyline_convex_hull'
    }

    handleGenomicInterpolant(data) {
        const { interpolantList } = data

        if (interpolantList) {
            for (let interpolant of interpolantList) {
                const { x, y, z } = this.curve.getPointAt(interpolant)
                const index = interpolantList.indexOf(interpolant)
                this.highlightBeads[index].position.set(x, y, z)
                this.highlightBeads[index].visible = true
            }
        }
    }

    handleHideHighlights() {
        if (this.highlightBeads) {
            this.highlightBeads[0].visible = false
            this.highlightBeads[1].visible = false
        }
    }

    updateMaterialProvider(materialProvider) {
        if (this.spline) {
            const colors = getRGBListWithMaterialAndLength(materialProvider, this.spline.vertexCount)
            this.spline.mesh.geometry.setColors(colors)

            this.spline.mesh.geometry.attributes.instanceStart.needsUpdate = true
            this.spline.mesh.geometry.attributes.instanceEnd.needsUpdate = true
        }
    }

    addToScene(scene) {

        scene.add(this.spline.mesh)

        const { center, radius } = EnsembleManager.getTraceBounds(ensembleManager.currentTrace)

        this.highlightBeads = []

        const material = new THREE.MeshPhongMaterial({ color: appleCrayonColorThreeJS('maraschino') })
        const geometry = new THREE.SphereGeometry(radius * highlightBeadRadiusScalefactor, 64, 32)
        this.highlightBeads[0] = new THREE.Mesh(geometry, material)
        this.highlightBeads[1] = new THREE.Mesh(geometry, material)

        scene.add(this.highlightBeads[0])
        scene.add(this.highlightBeads[1])

        const { x, y, z } = center
        this.highlightBeads[0].position.set(x, y, z)
        this.highlightBeads[1].position.set(x, y, z)

        this.highlightBeads[0].visible = false
        this.highlightBeads[1].visible = false
    }

    dispose() {

        if (this.spline && this.spline.mesh) {
            scene.remove(this.spline.mesh)
            disposeMaterial(this.spline.mesh.material)
            this.spline.mesh.geometry.dispose()
        }

        if (this.highlightBeads) {
            removeAndDisposeArrayFromScene(scene, this.highlightBeads)
        }

        if (this.hull && this.hull.mesh) {
            scene.remove(this.hull.mesh)
            this.hull.mesh.geometry.dispose()
            disposeMaterial(this.hull.mesh.material)
        }

        if (this.curve) {
            this.curve = undefined
        }
    }

    hide() {
        this.spline.mesh.visible = false

        if (this.highlightBeads) {
            this.highlightBeads[0].visible = false
            this.highlightBeads[1].visible = false
        }

        this.hull.mesh.visible = false
    }

    show() {
        this.spline.mesh.visible = true
        this.hull.mesh.visible = true
    }

    renderLoopHelper() {
        this.spline.mesh.material.resolution.set(window.innerWidth, window.innerHeight)
    }
}

function getRGBListWithMaterialAndLength(materialProvider, length) {
    const rgbList = new Float32Array(length * 3)
    for (let i = 0; i < length; i++) {
        materialProvider.colorForInterpolant(i / (length - 1)).toArray(rgbList, i * 3)
    }
    return rgbList
}

export default Polyline
