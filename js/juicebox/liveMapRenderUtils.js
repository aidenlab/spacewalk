/**
 * Shared rendering utilities for live contact and distance maps.
 * Replicates the canvas painting approach from hic-straw's
 * examples/live-contact-map.html.
 */

const DISTANCE_UNDEFINED = -1

/**
 * Fill a scaled pixel block in an ImageData buffer.
 * Each logical bin (x, y) maps to a rectangular block of screen pixels.
 * Uses floor boundaries to guarantee full coverage with no gaps.
 *
 * @param {Uint8ClampedArray} data - ImageData.data buffer
 * @param {number} size - Canvas width/height in pixels
 * @param {number} x - Logical bin x index
 * @param {number} y - Logical bin y index
 * @param {number} scale - Pixels per bin (size / N)
 * @param {number} r - Red (0-255)
 * @param {number} g - Green (0-255)
 * @param {number} b - Blue (0-255)
 * @param {number} a - Alpha (0-255)
 */
function fillScaledPixel(data, size, x, y, scale, r, g, b, a) {
    const x0 = Math.floor(x * scale)
    const y0 = Math.floor(y * scale)
    const x1 = Math.floor((x + 1) * scale)
    const y1 = Math.floor((y + 1) * scale)
    for (let py = y0; py < y1; py++) {
        for (let px = x0; px < x1; px++) {
            if (px >= size || py >= size) continue
            const idx = (py * size + px) * 4
            if (a < 255) {
                // Alpha blend over white background
                const invA = 255 - a
                data[idx]     = Math.floor((r * a + 255 * invA) / 255)
                data[idx + 1] = Math.floor((g * a + 255 * invA) / 255)
                data[idx + 2] = Math.floor((b * a + 255 * invA) / 255)
                data[idx + 3] = 255
            } else {
                data[idx]     = r
                data[idx + 1] = g
                data[idx + 2] = b
                data[idx + 3] = 255
            }
        }
    }
}

/**
 * Render a contact map onto a 2d canvas.
 * Iterates contact records and paints red pixels with alpha proportional to frequency.
 *
 * @param {CanvasRenderingContext2D} ctx - The 2d canvas context
 * @param {LiveContactMap} lcm - The initialized LiveContactMap instance
 */
function renderContactMap(ctx, lcm) {

    const N = lcm.traceLength
    const canvas = ctx.canvas
    const size = canvas.width
    const scale = size / N
    const offset = lcm.binOffset

    // White background
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, size, size)

    const imageData = ctx.getImageData(0, 0, size, size)
    const data = imageData.data

    for (const rec of lcm.contactRecords) {
        const x = rec.bin1 - offset
        const y = rec.bin2 - offset

        if (x < 0 || x >= N || y < 0 || y >= N) continue

        const alpha = Math.floor(255 * Math.min(rec.counts, 1))

        // Upper and lower triangle
        fillScaledPixel(data, size, x, y, scale, 255, 0, 0, alpha)
        fillScaledPixel(data, size, y, x, scale, 255, 0, 0, alpha)
    }

    // Diagonal
    for (let i = 0; i < N; i++) {
        fillScaledPixel(data, size, i, i, scale, 40, 40, 40, 255)
    }

    ctx.putImageData(imageData, 0, 0)
}

/**
 * Render a distance map onto a 2d canvas.
 * Close = blue, far = red.
 *
 * @param {CanvasRenderingContext2D} ctx - The 2d canvas context
 * @param {LiveContactMap} lcm - The initialized LiveContactMap instance
 */
function renderDistanceMap(ctx, lcm) {

    const { distances, maxDistance, traceLength: N } = lcm.getDistanceMatrix()
    const canvas = ctx.canvas
    const size = canvas.width
    const scale = size / N

    // Black background
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, size, size)

    const imageData = ctx.getImageData(0, 0, size, size)
    const data = imageData.data

    for (let i = 0; i < N; i++) {
        for (let j = i; j < N; j++) {
            const dist = distances[i * N + j]
            if (dist === DISTANCE_UNDEFINED) continue

            // close = blue, far = red
            const t = maxDistance > 0 ? dist / maxDistance : 0
            const r = Math.floor(255 * t)
            const g = 0
            const b = Math.floor(255 * (1 - t))

            fillScaledPixel(data, size, i, j, scale, r, g, b, 255)
            fillScaledPixel(data, size, j, i, scale, r, g, b, 255)
        }
    }

    ctx.putImageData(imageData, 0, 0)
}

export { fillScaledPixel, renderContactMap, renderDistanceMap, DISTANCE_UNDEFINED }
