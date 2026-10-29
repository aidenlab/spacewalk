import { defaultColormapName } from './utils/colorMapManager.js'

// Ball and stick radii are rungs on a fixed ladder (see CONTEXT.md, Radius step).
// The ladder's values scale with the trace; its length and midpoint do not.
const RADIUS_LADDER_LENGTH = 11
const RADIUS_LADDER_MIDPOINT = Math.floor(RADIUS_LADDER_LENGTH / 2)

/**
 * Structure appearance (CONTEXT.md): how the 3D structure is drawn, as distinct
 * from the furniture around it. Written into the `spacewalk` session block as
 * `structureAppearance`; the shape is documented in
 * development-notes/spacewalk-mcp/session-format.md, because the spacewalk-mcp
 * Worker reads and writes it too.
 *
 * pointSizeRadiusFraction is the point size as a fraction of the trace's bounding
 * radius; null means "not chosen yet", and the point cloud derives one from its bounds.
 */
function defaultStructureAppearance() {
    return {
        ballRadiusIndex: RADIUS_LADDER_MIDPOINT,
        stickRadiusIndex: RADIUS_LADDER_MIDPOINT,
        sticksVisible: true,
        pointSizeRadiusFraction: null,
        pointOpacity: 0.375,
        colorRamp: defaultColormapName,
        isCircular: false,
    }
}

// Read a session's block field by field; a field missing or malformed falls back
// to its default, so a session written before this existed loads with defaults.
function readStructureAppearance(record) {
    const values = defaultStructureAppearance()
    if (!record) return values

    for (const key of [ 'ballRadiusIndex', 'stickRadiusIndex' ]) {
        if (Number.isInteger(record[key])) {
            values[key] = Math.min(Math.max(record[key], 0), RADIUS_LADDER_LENGTH - 1)
        }
    }
    for (const key of [ 'sticksVisible', 'isCircular' ]) {
        if ('boolean' === typeof record[key]) values[key] = record[key]
    }
    if (isPositive(record.pointSizeRadiusFraction)) values.pointSizeRadiusFraction = record.pointSizeRadiusFraction
    if (isPositive(record.pointOpacity) && record.pointOpacity <= 1) values.pointOpacity = record.pointOpacity
    if ('string' === typeof record.colorRamp && record.colorRamp.length > 0) values.colorRamp = record.colorRamp

    return values
}

function isPositive(value) {
    return Number.isFinite(value) && value > 0
}

export { RADIUS_LADDER_LENGTH, defaultStructureAppearance, readStructureAppearance }
