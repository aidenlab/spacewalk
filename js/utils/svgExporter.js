import * as THREE from 'three'
import EnsembleManager from '../ensembleManager.js'
import { spacewalkConfig } from '../../spacewalk-config.js'

/**
 * Export the current ball-and-stick scene as an SVG string.
 *
 * Projects 3D primitives (atom centers, bond endpoints) to 2D screen space
 * using the live camera and emits <circle>/<line> elements sorted by depth
 * (painter's algorithm). Bond endpoints are clipped inward by each terminal
 * atom's projected radius so bonds never pierce through near spheres.
 */
export function exportBallAndStickSVG({ scene, camera, ballAndStick, canvas, trace, options = {} }) {

    const {
        width: canvasWidth,
        height: canvasHeight,
    } = canvas.getBoundingClientRect()

    const W = Math.round(canvasWidth)
    const H = Math.round(canvasHeight)

    camera.updateMatrixWorld()
    scene.updateMatrixWorld()

    const { balls } = ballAndStick
    const count = balls.count

    // Camera-right basis in world space, for projecting sphere/cylinder radius to pixels.
    const cameraRight = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize()

    const ballsWorld = balls.matrixWorld
    const instanceMatrix = new THREE.Matrix4()
    const worldMatrix = new THREE.Matrix4()
    const pos = new THREE.Vector3()
    const quat = new THREE.Quaternion()
    const scl = new THREE.Vector3()
    const offset = new THREE.Vector3()
    const ndc = new THREE.Vector3()
    const ndcOffset = new THREE.Vector3()

    // Project a world-space point to pixel coords + depth.
    const project = (p, out) => {
        ndc.copy(p).project(camera)
        out.x = (ndc.x * 0.5 + 0.5) * W
        out.y = (-ndc.y * 0.5 + 0.5) * H
        out.z = ndc.z
        return out
    }

    // Atoms ---------------------------------------------------------------
    const atoms = new Array(count)
    const instanceColor = balls.geometry.getAttribute('instanceColor')

    const tmpA = { x: 0, y: 0, z: 0 }
    const tmpB = { x: 0, y: 0, z: 0 }

    for (let i = 0; i < count; i++) {
        balls.getMatrixAt(i, instanceMatrix)
        worldMatrix.multiplyMatrices(ballsWorld, instanceMatrix)
        worldMatrix.decompose(pos, quat, scl)
        const worldRadius = scl.x  // unit SphereGeometry; instance scale is the radius

        // Project center
        project(pos, tmpA)

        // Project a point offset by worldRadius along camera-right → screen-space radius.
        offset.copy(pos).addScaledVector(cameraRight, worldRadius)
        project(offset, tmpB)
        const screenRadius = Math.hypot(tmpB.x - tmpA.x, tmpB.y - tmpA.y)

        const r255 = Math.round(255 * instanceColor.getX(i))
        const g255 = Math.round(255 * instanceColor.getY(i))
        const b255 = Math.round(255 * instanceColor.getZ(i))

        atoms[i] = {
            kind: 'atom',
            cx: tmpA.x,
            cy: tmpA.y,
            z: tmpA.z,
            r: screenRadius,
            color: `rgb(${r255},${g255},${b255})`,
        }
    }

    // Bonds ---------------------------------------------------------------
    // Derive bond endpoints from centroid vertices, same source the renderer uses.
    const vertices = EnsembleManager.getSingleCentroidVertices(trace, true)
    const bondPairs = []
    for (let i = 0; i < vertices.length - 1; i++) {
        bondPairs.push([i, i + 1])
    }
    if (spacewalkConfig.isCircular && vertices.length > 2) {
        bondPairs.push([vertices.length - 1, 0])
    }

    // Project each centroid vertex once.
    const projectedVertices = vertices.map(v => {
        const out = { x: 0, y: 0, z: 0 }
        return project(v, out)
    })

    // Stick radius in world space (live from the instance).
    const stickWorldRadius = ballAndStick.stickRadiusTable[ballAndStick.stickRadiusIndex]
    // Project at scene origin-ish point to get an average pixel stroke width.
    const sceneCenter = new THREE.Vector3()
    balls.getMatrixAt(Math.floor(count / 2), instanceMatrix)
    worldMatrix.multiplyMatrices(ballsWorld, instanceMatrix)
    worldMatrix.decompose(sceneCenter, quat, scl)
    project(sceneCenter, tmpA)
    offset.copy(sceneCenter).addScaledVector(cameraRight, stickWorldRadius)
    project(offset, tmpB)
    const stickStrokePx = Math.max(0.5, Math.hypot(tmpB.x - tmpA.x, tmpB.y - tmpA.y))

    const bondColor = options.bondColor || 'rgb(140,140,140)'

    const bonds = []
    for (const [ia, ib] of bondPairs) {
        // Map centroid-vertex indices to atom indices. With current geometry,
        // ball i is at trace vertex i, and centroid vertices align 1:1 with trace
        // when each trace bin has a single centroid (typical for ball-and-stick).
        // If counts don't match, fall back to no clipping.
        const a = projectedVertices[ia]
        const b = projectedVertices[ib]
        const ra = atoms[ia]?.r ?? 0
        const rb = atoms[ib]?.r ?? 0

        const dx = b.x - a.x
        const dy = b.y - a.y
        const len = Math.hypot(dx, dy) || 1
        const ux = dx / len
        const uy = dy / len

        // Clip endpoints inward by atom radius so bonds end at the sphere silhouette.
        const x1 = a.x + ux * ra
        const y1 = a.y + uy * ra
        const x2 = b.x - ux * rb
        const y2 = b.y - uy * rb

        // Skip bonds that would invert after clipping (atoms overlap).
        if ((x2 - x1) * ux + (y2 - y1) * uy <= 0) continue

        bonds.push({
            kind: 'bond',
            x1, y1, x2, y2,
            z: (a.z + b.z) * 0.5,
            strokeWidth: stickStrokePx,
            color: bondColor,
        })
    }

    // Painter's sort: far → near (larger NDC z is farther in default WebGL setup
    // after .project(), where z ∈ [-1, 1], -1 near, +1 far). Sort descending.
    const drawList = atoms.concat(bonds)
    drawList.sort((p, q) => q.z - p.z)

    // Background
    const bg = scene.background instanceof THREE.Color
        ? `rgb(${Math.round(255 * scene.background.r)},${Math.round(255 * scene.background.g)},${Math.round(255 * scene.background.b)})`
        : 'white'

    // Emit SVG
    const parts = []
    parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`)
    parts.push(`<rect width="100%" height="100%" fill="${bg}"/>`)

    for (const p of drawList) {
        if (p.kind === 'atom') {
            if (p.r <= 0) continue
            parts.push(`<circle cx="${p.cx.toFixed(2)}" cy="${p.cy.toFixed(2)}" r="${p.r.toFixed(2)}" fill="${p.color}"/>`)
        } else {
            parts.push(`<line x1="${p.x1.toFixed(2)}" y1="${p.y1.toFixed(2)}" x2="${p.x2.toFixed(2)}" y2="${p.y2.toFixed(2)}" stroke="${p.color}" stroke-width="${p.strokeWidth.toFixed(2)}" stroke-linecap="round"/>`)
        }
    }

    parts.push('</svg>')
    return parts.join('\n')
}

/**
 * Trigger a browser download of the current scene as an SVG file.
 */
export function downloadBallAndStickSVG(args, filename = 'spacewalk.svg') {
    const svg = exportBallAndStickSVG(args)
    const blob = new Blob([svg], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
}
