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
            rgb: [r255, g255, b255],
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
    const shaded = options.shaded !== false
    const bondSegments = options.bondSegments ?? 16

    // Subdivide each bond into N segments. Each segment carries its own depth (from
    // projecting an interpolated world-space sample), so painter's-algorithm sorting
    // against atoms works locally along the bond's length — a single midpoint depth
    // can never order one bond correctly against balls at its two endpoint depths.
    const bonds = []
    const sampleWorld = new THREE.Vector3()
    for (const [ia, ib] of bondPairs) {
        const a = projectedVertices[ia]
        const b = projectedVertices[ib]
        const ra = atoms[ia]?.r ?? 0
        const rb = atoms[ib]?.r ?? 0

        const dx = b.x - a.x
        const dy = b.y - a.y
        const len = Math.hypot(dx, dy) || 1
        const ux = dx / len
        const uy = dy / len

        // Per-endpoint clipping by depth (see note above on diffuse shading + ordering).
        const clipA = a.z <= b.z
        const clipB = b.z <= a.z
        const startX = clipA ? a.x + ux * ra : a.x
        const startY = clipA ? a.y + uy * ra : a.y
        const endX = clipB ? b.x - ux * rb : b.x
        const endY = clipB ? b.y - uy * rb : b.y

        if ((endX - startX) * ux + (endY - startY) * uy <= 0) continue

        // Sample N+1 points; project each in world space for perspective-correct z.
        // 2D positions follow the (clipped) screen line so endpoints land on the
        // silhouettes; intermediate (x,y) comes from projecting the world lerp,
        // which projects onto the same 2D line as a straight 3D segment.
        const wa = vertices[ia]
        const wb = vertices[ib]
        const samples = new Array(bondSegments + 1)
        const tmp = { x: 0, y: 0, z: 0 }
        for (let k = 0; k <= bondSegments; k++) {
            const t = k / bondSegments
            sampleWorld.lerpVectors(wa, wb, t)
            project(sampleWorld, tmp)
            samples[k] = { x: tmp.x, y: tmp.y, z: tmp.z }
        }
        samples[0].x = startX; samples[0].y = startY
        samples[bondSegments].x = endX; samples[bondSegments].y = endY

        for (let k = 0; k < bondSegments; k++) {
            const s0 = samples[k]
            const s1 = samples[k + 1]
            bonds.push({
                kind: 'bond',
                x1: s0.x, y1: s0.y,
                x2: s1.x, y2: s1.y,
                z: (s0.z + s1.z) * 0.5,
                strokeWidth: stickStrokePx,
                color: bondColor,
            })
        }
    }

    // Painter's sort: far → near (larger NDC z is farther in default WebGL setup
    // after .project(), where z ∈ [-1, 1], -1 near, +1 far). Sort descending.
    const drawList = atoms.concat(bonds)
    drawList.sort((p, q) => q.z - p.z)

    // Background
    const bg = scene.background instanceof THREE.Color
        ? `rgb(${Math.round(255 * scene.background.r)},${Math.round(255 * scene.background.g)},${Math.round(255 * scene.background.b)})`
        : 'white'

    // Build deduped radial gradients (one per unique color), if shading enabled.
    const gradients = new Map()  // key: "r-g-b" → id
    const gradientIdFor = (rgb) => {
        const key = `${rgb[0]}-${rgb[1]}-${rgb[2]}`
        if (gradients.has(key)) return gradients.get(key)
        const id = `g${gradients.size}`
        gradients.set(key, id)
        return id
    }
    if (shaded) {
        for (const a of atoms) gradientIdFor(a.rgb)
    }

    // Diffuse-only shading: light direction in camera space, fixed relative to view.
    // Approximation: rotate light 30° horizontally (left) and 45° up from the camera axis.
    // Project that direction onto the screen plane to place the gradient center (lit pole)
    // in each circle's object bounding box (cx,cy ∈ [0,1], circle center at 0.5,0.5, radius 0.5).
    const lightAzimuth = -30 * Math.PI / 180   // negative = light from the left
    const lightElevation = 45 * Math.PI / 180  // tilt up from camera axis
    const lightCamX = Math.sin(lightAzimuth) * Math.cos(lightElevation)
    const lightCamY = Math.sin(lightElevation)
    // bbox units: shift from center (0.5,0.5) by 0.5 * screen-projection of light dir.
    // SVG y is down, so subtract lightCamY.
    const gradCx = 0.5 + 0.5 * lightCamX
    const gradCy = 0.5 - 0.5 * lightCamY
    // Gradient radius reaches the far rim of the disk from the lit pole.
    const litOffset = Math.hypot(gradCx - 0.5, gradCy - 0.5)
    const gradR = 0.5 + litOffset
    // Rim color: a fixed dark gray. Diffuse-only — base at 0%, gray at 100%, no specular peak.
    const rimGray = options.rimGray || 'rgb(50,50,50)'

    // Emit SVG
    const parts = []
    parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`)

    if (shaded && gradients.size > 0) {
        parts.push('<defs>')
        for (const [key, id] of gradients) {
            const [r, g, b] = key.split('-').map(Number)
            const base = `rgb(${r},${g},${b})`
            // Diffuse falloff: base color at lit pole, fading to a fixed dark gray on the unlit side.
            parts.push(`<radialGradient id="${id}" cx="${gradCx.toFixed(3)}" cy="${gradCy.toFixed(3)}" r="${gradR.toFixed(3)}" fx="${gradCx.toFixed(3)}" fy="${gradCy.toFixed(3)}"><stop offset="0%" stop-color="${base}"/><stop offset="100%" stop-color="${rimGray}"/></radialGradient>`)
        }
        parts.push('</defs>')
    }

    parts.push(`<rect width="100%" height="100%" fill="${bg}"/>`)

    for (const p of drawList) {
        if (p.kind === 'atom') {
            if (p.r <= 0) continue
            const fill = shaded ? `url(#${gradientIdFor(p.rgb)})` : p.color
            parts.push(`<circle cx="${p.cx.toFixed(2)}" cy="${p.cy.toFixed(2)}" r="${p.r.toFixed(2)}" fill="${fill}"/>`)
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
