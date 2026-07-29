import * as THREE from "three"
import { vectorMax, vectorMin } from "./mathUtils.js"

// Project a mesh's geometry into the render container's pixel space, and report both the
// pixel extent and the corresponding world-space (nm) extent. Consumed by the scale bars
// (which straddle the data) and the reference ruler (which only needs nm-per-pixel).
function calculateProjectedBounds(mesh, camera, container) {

    let xyzCameraMin = new THREE.Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY)
    let xyzCameraMax = new THREE.Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY)

    let ndcMin = new THREE.Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY)
    let ndcMax = new THREE.Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY)

    const vertices = mesh.geometry.attributes.position.array;
    for (let i = 0; i < vertices.length; i += 3) {

        // Object space
        const vertex = new THREE.Vector3(vertices[i], vertices[i + 1], vertices[i + 2])

        // Camera space
        const xyzCamera = vertex.clone().applyMatrix4(camera.matrixWorldInverse)
        xyzCameraMin = vectorMin(xyzCameraMin, xyzCamera)
        xyzCameraMax = vectorMax(xyzCameraMax, xyzCamera)

        // World space
        const xyzWorld = vertex.clone().applyMatrix4(mesh.matrixWorld)

        // NDC space
        const ndc = xyzWorld.clone().project(camera)
        ndcMin = vectorMin(ndcMin, ndc)
        ndcMax = vectorMax(ndcMax, ndc)

    }

    // ndc: convert to 0 -> 1
    const ndcMin01X = 0.5 * ndcMin.x + 0.5
    const ndcMax01X = 0.5 * ndcMax.x + 0.5

    // ndc: y-axis is flipped
    const ndcMax01Y = -0.5 * ndcMin.y + 0.5
    const ndcMin01Y = -0.5 * ndcMax.y + 0.5

    // camera space extent (world space distances)
    const widthNM = xyzCameraMax.x - xyzCameraMin.x
    const heightNM = xyzCameraMax.y - xyzCameraMin.y

    const { width:cardBodyWidth, height:cardBodyHeight } = container.getBoundingClientRect()

    const south = ndcMin01Y * cardBodyHeight
    const north = ndcMax01Y * cardBodyHeight

    const west = ndcMin01X * cardBodyWidth
    const east = ndcMax01X * cardBodyWidth

    const width =  east - west
    const height = north - south

    return { north, south, east, west, width, height, widthNM, heightNM }

}

// nm represented by a single screen pixel, or undefined when the bounds are degenerate
function nmPerPixel({ width, widthNM }) {
    if (!isFinite(width) || width <= 0 || !isFinite(widthNM) || widthNM <= 0) {
        return undefined
    }
    return widthNM / width
}

export { calculateProjectedBounds, nmPerPixel }
