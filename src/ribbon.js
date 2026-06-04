import * as THREE from "three"
import {StringUtils} from "igv-utils";
import { Line2 } from "three/examples/jsm/lines/Line2.js"
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js"
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js"
import EnsembleManager from './ensembleManager.js'
import {appleCrayonColorThreeJS} from "./utils/colorUtils.js";
import {getPositionArrayWithTrace} from "./utils/utils.js"
import ConvexHull from "./utils/convexHull"
import { disposeMaterial, removeAndDisposeArrayFromScene } from './utils/disposalUtils.js'
import { spacewalkConfig } from "./spacewalk-config.js"

const ribbonWidth = 4/*2*/
const highlightBeadRadiusScalefactor = 1/(6e1)
const RibbonScaleFactor = 32

class Ribbon {

    static renderStyle = 'render-style-ribbon'

    constructor(trace, { ensembleManager, igvPanel }) {

        this.ensembleManager = ensembleManager

        const traceVertices = EnsembleManager.getSingleCentroidVertices(trace, true)
        this.curve = new THREE.CatmullRomCurve3( traceVertices, spacewalkConfig.isCircular === true )
        this.curve.arcLengthDivisions = 2e3
        this.curve.updateArcLengths()

        const geometry = new LineGeometry()

        const curvePointCount = Math.round(traceVertices.length * RibbonScaleFactor)
        const curvePoints = this.curve.getSpacedPoints( curvePointCount )

        const a = `Trace vertices(${ StringUtils.numberFormatter(traceVertices.length) })`
        const b = `Curve points(${ StringUtils.numberFormatter(curvePointCount) })`

        console.log(`Ribbon.createFatSpline ${ a } ${ b }`)
        const positions = []
        for (const { x, y, z } of curvePoints ) {
            positions.push(x, y, z)
        }
        geometry.setPositions( positions )

        const colors = getRGBListWithMaterialAndLength(igvPanel.materialProvider, curvePoints.length)
        geometry.setColors( colors )

        const material = new LineMaterial( { linewidth: ribbonWidth, vertexColors: true } )

        const mesh = new Line2(geometry, material)
        mesh.computeLineDistances()
        mesh.scale.set( 1, 1, 1 )
        mesh.name = 'ribbon'

        this.spline = { mesh, vertexCount: curvePoints.length }

        const positionArray = getPositionArrayWithTrace(trace)
        this.hull = new ConvexHull(positionArray)
        this.hull.mesh.name = 'ribbon_convex_hull'
    }

    /**
     * Render the shared highlight selection. Ribbon shows up to two beads on the
     * curve; it maps each region index to its interpolant via the genomic-extent
     * list (skipping indices with no extent), then positions a bead there. Empty
     * selection hides both beads. See development-notes/refactor-highlighting-redesign.md.
     */
    renderHighlight(selection) {
        if (!this.highlightBeads) {
            return
        }

        this.highlightBeads[ 0 ].visible = false
        this.highlightBeads[ 1 ].visible = false

        const genomicExtentList = this.ensembleManager.getCurrentGenomicExtentList()
        selection.slice(0, 2).forEach((index, i) => {
            const extent = genomicExtentList[ index ]
            if (extent) {
                const { x, y, z } = this.curve.getPointAt(extent.interpolant)
                this.highlightBeads[ i ].position.set(x, y, z)
                this.highlightBeads[ i ].visible = true
            }
        })
    }

    /**
     * Handle leave genomic navigator or hide crosshairs events (delegated from SceneManager)
     */
    handleHideHighlights() {
        if (this.highlightBeads) {
            this.highlightBeads[ 0 ].visible = false
            this.highlightBeads[ 1 ].visible = false
        }
    }

    updateMaterialProvider (materialProvider) {
        if (this.spline) {
            const colors = getRGBListWithMaterialAndLength(materialProvider, this.spline.vertexCount)
            this.spline.mesh.geometry.setColors(colors)

            this.spline.mesh.geometry.attributes.instanceStart.needsUpdate = true
            this.spline.mesh.geometry.attributes.instanceEnd.needsUpdate = true

        }
    }

    addToScene (scene) {

        this.scene = scene
        scene.add( this.spline.mesh )

        const { center, radius } = EnsembleManager.getTraceBounds(this.ensembleManager.currentTrace)

        this.highlightBeads = []

        const material = new THREE.MeshPhongMaterial({ color: appleCrayonColorThreeJS('maraschino') })
        const geometry = new THREE.SphereGeometry( radius * highlightBeadRadiusScalefactor, 64, 32 )
        this.highlightBeads[ 0 ] = new THREE.Mesh( geometry, material )
        this.highlightBeads[ 1 ] = new THREE.Mesh( geometry, material )

        scene.add( this.highlightBeads[ 0 ] )
        scene.add( this.highlightBeads[ 1 ] )

        const { x, y, z } = center
        this.highlightBeads[ 0 ].position.set(x, y, z)
        this.highlightBeads[ 1 ].position.set(x, y, z)

        this.highlightBeads[ 0 ].visible = false
        this.highlightBeads[ 1 ].visible = false

        // scene.add(this.hull.mesh)

    }

    dispose () {

        if (this.spline && this.spline.mesh) {
            this.scene.remove(this.spline.mesh)
            disposeMaterial(this.spline.mesh.material)
            this.spline.mesh.geometry.dispose()
        }

        if (this.highlightBeads) {
            removeAndDisposeArrayFromScene(this.scene, this.highlightBeads)
        }

        if (this.hull && this.hull.mesh) {
            this.scene.remove(this.hull.mesh)
            this.hull.mesh.geometry.dispose()
            disposeMaterial(this.hull.mesh.material)
        }

        if (this.curve) {
            this.curve = undefined
        }

        this.scene = undefined

    }

    hide () {
        this.spline.mesh.visible = false

        if (this.highlightBeads) {
            this.highlightBeads[ 0 ].visible = false
            this.highlightBeads[ 1 ].visible = false
        }

        this.hull.mesh.visible = false
    }

    show () {
        this.spline.mesh.visible = true
        this.hull.mesh.visible = true
    }

    renderLoopHelper () {
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

export default Ribbon;
