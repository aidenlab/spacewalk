/**
 * Shared rendering utilities for live contact and distance maps.
 * Replicates the canvas painting approach from hic-straw's
 * examples/live-contact-map.html.
 */

const DISTANCE_UNDEFINED = -1

const defaultForeground = { r: 255, g: 0, b: 0 }
const defaultBackground = { r: 255, g: 255, b: 255 }

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
 * @param {number} bgR - Background red for alpha blending (0-255)
 * @param {number} bgG - Background green for alpha blending (0-255)
 * @param {number} bgB - Background blue for alpha blending (0-255)
 */
function fillScaledPixel(data, size, x, y, scale, r, g, b, a, bgR, bgG, bgB) {
    const x0 = Math.floor(x * scale)
    const y0 = Math.floor(y * scale)
    const x1 = Math.floor((x + 1) * scale)
    const y1 = Math.floor((y + 1) * scale)
    for (let py = y0; py < y1; py++) {
        for (let px = x0; px < x1; px++) {
            if (px >= size || py >= size) continue
            const idx = (py * size + px) * 4
            if (a < 255) {
                const invA = 255 - a
                data[idx]     = Math.floor((r * a + bgR * invA) / 255)
                data[idx + 1] = Math.floor((g * a + bgG * invA) / 255)
                data[idx + 2] = Math.floor((b * a + bgB * invA) / 255)
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
 * Iterates contact records and paints pixels with alpha proportional to frequency.
 *
 * @param {CanvasRenderingContext2D} ctx - The 2d canvas context
 * @param {LiveContactMap} lcm - The initialized LiveContactMap instance
 * @param {Object} [colorConfig] - Optional color configuration
 * @param {Object} [colorConfig.foreground] - Foreground {r, g, b} for contact pixels
 * @param {Object} [colorConfig.background] - Background {r, g, b} for canvas fill and alpha blending
 */
function renderContactMap(ctx, lcm, colorConfig) {

    const fg = colorConfig?.foreground || defaultForeground
    const bg = colorConfig?.background || defaultBackground

    const N = lcm.traceLength
    const canvas = ctx.canvas
    const size = canvas.width
    const scale = size / N
    const offset = lcm.binOffset

    // Background fill
    ctx.fillStyle = `rgb(${bg.r},${bg.g},${bg.b})`
    ctx.fillRect(0, 0, size, size)

    const imageData = ctx.getImageData(0, 0, size, size)
    const data = imageData.data

    for (const rec of lcm.contactRecords) {
        const x = rec.bin1 - offset
        const y = rec.bin2 - offset

        if (x < 0 || x >= N || y < 0 || y >= N) continue

        const alpha = Math.floor(255 * Math.min(rec.counts, 1))

        // Upper and lower triangle
        fillScaledPixel(data, size, x, y, scale, fg.r, fg.g, fg.b, alpha, bg.r, bg.g, bg.b)
        fillScaledPixel(data, size, y, x, scale, fg.r, fg.g, fg.b, alpha, bg.r, bg.g, bg.b)
    }

    // Diagonal
    for (let i = 0; i < N; i++) {
        fillScaledPixel(data, size, i, i, scale, 40, 40, 40, 255, bg.r, bg.g, bg.b)
    }

    ctx.putImageData(imageData, 0, 0)
}

/**
 * Render a distance map onto a 2d canvas.
 * Uses foreground color for close distances, background for far.
 * Gradient: close (t=0) = foreground, far (t=1) = background.
 *
 * @param {CanvasRenderingContext2D} ctx - The 2d canvas context
 * @param {LiveContactMap} lcm - The initialized LiveContactMap instance
 * @param {Object} [colorConfig] - Optional color configuration
 * @param {Object} [colorConfig.foreground] - Foreground {r, g, b} for close distances
 * @param {Object} [colorConfig.background] - Background {r, g, b} for canvas fill and far distances
 */
function renderDistanceMap(ctx, lcm, colorConfig) {

    const fg = colorConfig?.foreground || defaultForeground
    const bg = colorConfig?.background || defaultBackground

    const { distances, maxDistance, traceLength: N } = lcm.getDistanceMatrix()
    const canvas = ctx.canvas
    const size = canvas.width
    const scale = size / N

    // Background fill
    ctx.fillStyle = `rgb(${bg.r},${bg.g},${bg.b})`
    ctx.fillRect(0, 0, size, size)

    const imageData = ctx.getImageData(0, 0, size, size)
    const data = imageData.data

    for (let i = 0; i < N; i++) {
        for (let j = i; j < N; j++) {
            const dist = distances[i * N + j]
            if (dist === DISTANCE_UNDEFINED) continue

            // t=0 (close) -> foreground, t=1 (far) -> background
            const t = maxDistance > 0 ? dist / maxDistance : 0
            const r = Math.floor(fg.r * (1 - t) + bg.r * t)
            const g = Math.floor(fg.g * (1 - t) + bg.g * t)
            const b = Math.floor(fg.b * (1 - t) + bg.b * t)

            fillScaledPixel(data, size, i, j, scale, r, g, b, 255, bg.r, bg.g, bg.b)
            fillScaledPixel(data, size, j, i, scale, r, g, b, 255, bg.r, bg.g, bg.b)
        }
    }

    ctx.putImageData(imageData, 0, 0)
}

export { fillScaledPixel, renderContactMap, renderDistanceMap, DISTANCE_UNDEFINED }
