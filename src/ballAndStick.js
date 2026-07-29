import * as THREE from 'three'
import { StringUtils } from 'igv-utils'
import {clamp, lerp} from './utils/mathUtils.js'
import { appleCrayonColorThreeJS } from "./utils/colorUtils.js"
import EnsembleManager from './ensembleManager.js'
import ConvexHull from "./utils/convexHull.js"
import {getPositionArrayWithTrace} from "./utils/utils.js"
import { removeAndDisposeFromScene, disposeGeometry, disposeMaterial } from './utils/disposalUtils.js'
import { spacewalkConfig } from "./spacewalk-config.js"

const stickTesselation = { length: 2, radial: 8 }

class BallAndStick {

    static renderStyle = 'render-style-ball-stick'

    constructor ({ trace, pickHighlighter, stickMaterial, isStickVisible, ballRadiusIndex, stickRadiusIndex, ensembleManager, igvPanel, sceneManager }) {

        this.pickHighlighter = pickHighlighter
        this.stickMaterial = stickMaterial
        this.isStickVisible = isStickVisible
        this.ensembleManager = ensembleManager
        this.igvPanel = igvPanel
        this.sceneManager = sceneManager

        // Build geometry from trace
        const stickCurves = createStickCurves(EnsembleManager.getSingleCentroidVertices(trace, true))
        const averageCurveDistance = computeAverageCurveDistance(stickCurves)

        this.stickRadiusTable = generateRadiusTable(0.5e-1 * averageCurveDistance)
        this.stickRadiusIndex = stickRadiusIndex === undefined
            ? Math.floor(this.stickRadiusTable.length / 2)
            : clamp(stickRadiusIndex, 0, this.stickRadiusTable.length - 1)
        this.sticks = this.createSticks(trace, this.stickRadiusTable[this.stickRadiusIndex])

        this.ballRadiusTable = generateRadiusTable(2e-1 * averageCurveDistance)
        this.ballRadiusIndex = ballRadiusIndex === undefined
            ? Math.floor(this.ballRadiusTable.length / 2)
            : clamp(ballRadiusIndex, 0, this.ballRadiusTable.length - 1)
        this.balls = this.createBalls(trace, igvPanel.materialProvider, this.ballRadiusTable[this.ballRadiusIndex])

        // Wire up the highlighter to our balls mesh
        this.pickHighlighter.setBalls(this.balls)

        const positionArray = getPositionArrayWithTrace(trace)
        this.hull = new ConvexHull(positionArray)
        this.hull.mesh.name = 'ball_and_stick_convex_hull'
    }

    /**
     * Render the shared highlight selection (region indices == ball instanceIds).
     * Empty selection clears. See development-notes/refactor-highlighting-redesign.md.
     */
    renderHighlight(selection) {
        // Skip entries with no index (a gap-dwelling locator carries only an
        // interpolant for the bead; there is no ball to light).
        const instanceIdList = selection.map(({ index }) => index).filter(index => undefined !== index)
        if (instanceIdList.length > 0) {
            this.pickHighlighter.configureWithInstanceIdList(instanceIdList)
        } else {
            this.pickHighlighter.unhighlight()
        }
    }

    createBalls(trace, materialProvider, ballRadius) {

        // canonical ball geometry
        const widthSegments = 32
        const heightSegments = 16
        const geometry = new THREE.SphereGeometry(1, widthSegments, heightSegments)
        geometry.computeVertexNormals()

        console.log(`Ball&Stick. Create ${ StringUtils.numberFormatter(trace.length) } balls. Tesselation width ${ widthSegments } height ${ heightSegments }`)

        const genomicExtentList = this.ensembleManager.getCurrentGenomicExtentList()

        const colorList = new Array(trace.length)
            .fill()
            .flatMap((_, i) => {
                const color = materialProvider.colorForInterpolant(genomicExtentList[ i ].interpolant)
                return color.toArray()
            })

        // assign instance color list to canonical geometry
        geometry.setAttribute('instanceColor', new THREE.InstancedBufferAttribute(new Float32Array(colorList), 3) )

        const material = getColorRampMaterial('instanceColor')

        const mesh = new THREE.InstancedMesh(geometry, material, trace.length)

        const matrix = new THREE.Matrix4()

        const point = new THREE.Vector3()
        const rotation = new THREE.Euler()
        const quaternion = new THREE.Quaternion()
        const scale = new THREE.Vector3()

        trace.map(({ xyz }) => xyz).forEach((xyz, i) => {

            point.x = xyz.x
            point.y = xyz.y
            point.z = xyz.z

            rotation.x = 0
            rotation.y = 0
            rotation.z = 0
            quaternion.setFromEuler( rotation )

            scale.setScalar(true === xyz.isMissingData ? 1 : ballRadius)

            matrix.compose(point, quaternion, scale)

            mesh.setMatrixAt(i, matrix)
        })

        return mesh
    }

    createSticks(trace, stickRadius) {

        // Missing-data vertices are filtered out, so a stick may span an absent extent,
        // joining the two locations on either side of the gap.
        const vertices = EnsembleManager.getSingleCentroidVertices(trace, true)

        const endPoints = []
        for (let i = 0; i < vertices.length - 1; i++) {
            endPoints.push({ a: vertices[ i ], b: vertices[ i + 1 ] })
        }

        if (spacewalkConfig.isCircular && vertices.length > 2) {
            endPoints.push({ a: vertices[ vertices.length - 1 ], b: vertices[ 0 ] })
        }

        // Canonical stick geometry: unit radius, unit length, aligned to +y. Each instance
        // matrix carries scale (radius, distance, radius), so a radius change is a matrix
        // rewrite rather than a geometry rebuild.
        const geometry = new THREE.CylinderGeometry(1, 1, 1, stickTesselation.radial, stickTesselation.length)

        const material = this.stickMaterial.clone()

        const mesh = new THREE.InstancedMesh(geometry, material, endPoints.length)

        const matrix = new THREE.Matrix4()
        const point = new THREE.Vector3()
        const quaternion = new THREE.Quaternion()
        const scale = new THREE.Vector3()
        const stickAxis = new THREE.Vector3()
        const cylinderUpAxis = new THREE.Vector3( 0, 1, 0 )

        endPoints.forEach(({ a, b }, i) => {

            // stick has length equal to distance between endpoints
            const distance = a.distanceTo( b )

            // stick endpoints define the axis of stick alignment
            stickAxis.subVectors(b, a).normalize()
            quaternion.setFromUnitVectors(cylinderUpAxis, stickAxis)

            // oriented stick sits at the location between endpoints
            point.addVectors(a, b).multiplyScalar(0.5)

            scale.set(stickRadius, distance, stickRadius)

            matrix.compose(point, quaternion, scale)
            mesh.setMatrixAt(i, matrix)
        })

        mesh.name = 'stick';
        return mesh;

    }

    setStickVisibility(visible) {
        this.isStickVisible = visible
    }

    updateBallRadius(increment) {

        this.ballRadiusIndex = clamp(this.ballRadiusIndex + increment, 0, this.ballRadiusTable.length - 1)
        this.sceneManager.ballRadiusIndex = this.ballRadiusIndex
        const radius = this.ballRadiusTable[ this.ballRadiusIndex ]

        const matrix = new THREE.Matrix4()
        const pp = new THREE.Vector3()
        const qq = new THREE.Quaternion()
        const ss = new THREE.Vector3()
        for (let i = 0; i < this.ensembleManager.currentTrace.length; i++) {

            this.balls.getMatrixAt(i, matrix)
            matrix.decompose(pp, qq, ss)

            // Missing-data balls keep the undersized marker scale createBalls gave them.
            const { xyz } = this.ensembleManager.currentTrace[ i ]
            ss.setScalar(true === xyz.isMissingData ? 1 : radius)

            matrix.compose(pp, qq, ss)
            this.balls.setMatrixAt(i, matrix)
        }

        this.balls.instanceMatrix.needsUpdate = true
    }

    updateStickRadius(increment) {

        this.stickRadiusIndex = clamp(this.stickRadiusIndex + increment, 0, this.stickRadiusTable.length - 1)
        this.sceneManager.stickRadiusIndex = this.stickRadiusIndex
        const radius = this.stickRadiusTable[ this.stickRadiusIndex ]

        const matrix = new THREE.Matrix4()
        const pp = new THREE.Vector3()
        const qq = new THREE.Quaternion()
        const ss = new THREE.Vector3()

        // Instance count is the missing-data-filtered vertex count, plus the closing
        // stick when circular. It is not trace.length.
        for (let i = 0; i < this.sticks.count; i++) {

            this.sticks.getMatrixAt(i, matrix)
            matrix.decompose(pp, qq, ss)

            // y carries the endpoint distance, not the radius. Leave it alone.
            ss.x = ss.z = radius

            matrix.compose(pp, qq, ss)
            this.sticks.setMatrixAt(i, matrix)
        }

        this.sticks.instanceMatrix.needsUpdate = true
    }

    updateMaterialProvider (materialProvider) {

        for (let i = 0; i < this.ensembleManager.currentTrace.length; i++) {
            const { interpolant } = this.ensembleManager.currentTrace[ i ]
            const color = materialProvider.colorForInterpolant(interpolant)

            const bufferAttribute = this.balls.geometry.getAttribute('instanceColor')
            color.toArray(bufferAttribute.array, i * 3)
        }

        this.balls.geometry.attributes.instanceColor.needsUpdate = true

    }

    renderLoopHelper () {
        this.sticks.visible = (this.isStickVisible && this.sceneManager.renderStyle === BallAndStick.renderStyle)
    }

    addToScene (scene) {
        this.scene = scene
        scene.add(this.balls)
        scene.add(this.sticks)
        // scene.add(this.hull.mesh)
    }

    dispose () {
        // Balls and sticks are both InstancedMesh. InstancedMesh.dispose() frees only the
        // instance buffers, and disposeObject prefers an object's own dispose(), so its
        // fallback path never reaches geometry or material. Free them here.
        for (const mesh of [ this.balls, this.sticks ]) {
            const { geometry, material } = mesh
            removeAndDisposeFromScene(this.scene, mesh)
            disposeGeometry(geometry)
            disposeMaterial(material)
        }

        if (this.hull && this.hull.mesh) {
            removeAndDisposeFromScene(this.scene, this.hull.mesh)
        }

        // Clear highlighter reference to our now-disposed balls
        this.pickHighlighter.setBalls(undefined)
        this.scene = undefined
    }

    hide () {
        this.balls.visible = false
        this.sticks.visible = false
        this.hull.mesh.visible = false
    }

    show () {
        this.balls.visible = true
        this.sticks.visible = true
        this.hull.mesh.visible = true
    }

}

function generateRadiusTable(defaultRadius) {

    const radiusTableLength = 11;
    const radiusTable = [];

    for (let i = 0; i < radiusTableLength; i++) {
        const interpolant = i / (radiusTableLength - 1);
        const radius = lerp(0.5 * defaultRadius, 2.0 * defaultRadius, interpolant);
        radiusTable.push(radius);
    }

    return radiusTable
}

function computeAverageCurveDistance (curves) {

    let acc = 0;
    const sum = curves
        .reduce((accumulator, curve) => {
            accumulator += curve.getLength();
            return accumulator;
        }, acc);

    return sum / curves.length;

}

function createStickCurves (vertices) {

    let curves = [];
    for (let i = 0, j = 1; j < vertices.length; ++i, ++j) {
        curves.push( new THREE.CatmullRomCurve3([ vertices[i], vertices[j] ]) );
    }

    if (spacewalkConfig.isCircular && vertices.length > 2) {
        curves.push( new THREE.CatmullRomCurve3([ vertices[vertices.length - 1], vertices[0] ]) );
    }

    return curves;
}

function getColorRampMaterial(instanceColor){

    const material = new THREE.MeshPhongMaterial({ color: appleCrayonColorThreeJS('snow') });

    material.onBeforeCompile = shader => {

        const colorParsChunk =
            [
                `attribute vec3 ${ instanceColor };`,
                `varying vec3 v_${ instanceColor };`,
                '#include <common>'
            ].join( '\n' );

        const instanceColorChunk =
            [
                '#include <begin_vertex>',
                `v_${ instanceColor } = ${ instanceColor };`
            ].join( '\n' );

        shader.vertexShader = shader.vertexShader
            .replace( '#include <common>', colorParsChunk )
            .replace( '#include <begin_vertex>', instanceColorChunk );

        const fragmentParsChunk =
            [
                `varying vec3 v_${ instanceColor };`,
                '#include <common>'
            ].join( '\n' );

        const colorChunk =
            [
                `vec4 diffuseColor = vec4( diffuse * v_${ instanceColor }, opacity );`
            ].join( '\n' );

        shader.fragmentShader = shader.fragmentShader
            .replace( '#include <common>', fragmentParsChunk )
            .replace( 'vec4 diffuseColor = vec4( diffuse, opacity );', colorChunk );

    };

    return material;
}

export default BallAndStick;
