import * as THREE from "three"
import { appleCrayonColorThreeJS, rgb255String, threeJSColorToRGB255 } from "./utils/colorUtils.js"
import { register, updateSwatch } from "./utils/sharedColorPicker.js"
import { configureDrag } from "./utils/draggable.js"
import { clamp } from "./utils/mathUtils.js"

const RULER_LENGTH_PX = 128

// Where the ruler parks, as a corner plus an inset from that corner's two edges.
// Insets are stored exactly as the user left them and clamped only when applied, so
// shrinking the render container (or entering fullscreen) never destroys the position.
const DEFAULT_ANCHOR = { corner: 'bottom-right', dx: 20, dy: 20 }

const CORNERS = new Set(['bottom-right', 'bottom-left', 'top-left', 'top-right'])

// A fixed-length legend parked in a corner of the render container. Unlike the scale bars,
// which straddle the data, the ruler never moves with the camera — it answers the single
// question "what does 128px mean right now?" It is furniture: the user can drag it
// anywhere, and it stays where they put it.
class ReferenceRuler {

    constructor(renderContainer, isHidden, initialColor, anchor) {

        this.renderContainer = renderContainer
        this.color = initialColor ?? appleCrayonColorThreeJS('iron')
        this.visible = !(isHidden)
        this.anchor = ReferenceRuler.sanitizeAnchor(anchor)
        this.placed = false

        register(document.querySelector(`div[data-colorpicker='reference-ruler']`), this.color, () => this.color, color => this.setColor(color))
    }

    insertDOM() {

        const w = RULER_LENGTH_PX
        const colorString = rgb255String(threeJSColorToRGB255(this.color))
        const html =
            `<div id="spacewalk-reference-ruler-container" style="position: absolute; user-select: none; display: none; width: ${w}px; cursor: grab;">
              <div id="reference-ruler-bar" style="width: ${w}px; height: 5px; background-color: ${colorString};"></div>
              <div id="reference-ruler-label" style="width: ${w}px; text-align: center; font-family: 'HelveticaNeue-Light', 'Helvetica Neue'; font-size: 18px; font-weight: 300; letter-spacing: 0.75px; color: ${colorString}; margin-top: 4px;"></div>
            </div>`

        const fragment = document.createRange().createContextualFragment(html)
        this.container = fragment.firstChild
        this.renderContainer.appendChild(this.container)

        this.configurePlacement()
        this.applyAnchor()
    }

    configurePlacement() {

        // The whole widget is the handle — the 5px bar alone is a cruel target
        configureDrag(this.container, this.container, this.renderContainer, {
            contain: true,
            onDragStart: event => {

                this.container.style.cursor = 'grabbing'
                this.dragOrigin = { clientX: event.clientX, clientY: event.clientY }

                // The drag writes left/top, so the corner pair has to go — but clearing it first
                // would leave the widget unpositioned and drop it to its static position (which,
                // following the canvas in the DOM, is off-screen). Pin the current offset as
                // left/top first, then release. Both pairs must never be set at once: left+right
                // is merely over-constrained, but top+bottom with height:auto stretches the widget.
                const { offsetLeft, offsetTop } = this.container
                this.container.style.left = `${ offsetLeft }px`
                this.container.style.top = `${ offsetTop }px`
                this.container.style.right = ''
                this.container.style.bottom = ''
            },
            onDragEnd: (event, { left, top }) => {

                this.container.style.cursor = 'grab'

                // A click that moved nothing must not rewrite the anchor: re-deriving it from
                // the rendered position would bake in the render-time clamp and destroy the
                // user's stored inset.
                if (this.wasDragged(event)) {
                    this.anchor = this.anchorFromOffset(parseFloat(left), parseFloat(top))
                    ReferenceRuler.notifyPlacementChanged()
                }

                this.applyAnchor()
            }
        })

        // Escape hatch from parking the ruler somewhere useless
        this.container.addEventListener('dblclick', event => {
            event.stopPropagation()
            this.resetAnchor()
        })
    }

    static DRAG_SLOP_PX = 3

    wasDragged({ clientX, clientY }) {
        if (!this.dragOrigin) return false
        return Math.abs(clientX - this.dragOrigin.clientX) > ReferenceRuler.DRAG_SLOP_PX ||
               Math.abs(clientY - this.dragOrigin.clientY) > ReferenceRuler.DRAG_SLOP_PX
    }

    // Convert a dropped container-relative position into the nearest corner plus insets
    anchorFromOffset(left, top) {

        const { width:cw, height:ch } = this.renderContainer.getBoundingClientRect()
        const { width:w, height:h } = this.container.getBoundingClientRect()

        const horizontal = (left + w / 2) < cw / 2 ? 'left' : 'right'
        const vertical = (top + h / 2) < ch / 2 ? 'top' : 'bottom'

        return {
            corner: `${vertical}-${horizontal}`,
            dx: 'left' === horizontal ? left : cw - (left + w),
            dy: 'top' === vertical ? top : ch - (top + h)
        }
    }

    // Write the anchor to CSS, clamping so the widget stays fully inside the container.
    // Each corner uses its native CSS pair, so the browser tracks the corner across
    // resizes for free. Safe to call at any time; a hidden widget measures 0x0 and is skipped.
    // Returns false when the widget can't be measured (it is hidden), so callers know the
    // anchor has not landed yet and must retry once it is on screen.
    applyAnchor() {

        if (!this.container) return false

        const { width:w, height:h } = this.container.getBoundingClientRect()
        if (0 === w || 0 === h) return false

        const { width:cw, height:ch } = this.renderContainer.getBoundingClientRect()
        const [ vertical, horizontal ] = this.anchor.corner.split('-')

        const style = this.container.style
        style.left = style.right = style.top = style.bottom = ''
        style[horizontal] = `${ clamp(this.anchor.dx, 0, Math.max(0, cw - w)) }px`
        style[vertical] = `${ clamp(this.anchor.dy, 0, Math.max(0, ch - h)) }px`

        this.placed = true
        return true
    }

    resetAnchor() {
        this.anchor = { ...DEFAULT_ANCHOR }
        this.applyAnchor()
        ReferenceRuler.notifyPlacementChanged()
    }

    setColor(color) {
        const { r, g, b } = color
        this.color.setRGB(r, g, b)
        const colorString = rgb255String(threeJSColorToRGB255(this.color))
        const bar = document.getElementById('reference-ruler-bar')
        const label = document.getElementById('reference-ruler-label')
        if (bar) bar.style.backgroundColor = colorString
        if (label) label.style.color = colorString
    }

    // Called each animation frame with the current nm-per-pixel, or undefined when the
    // scene provides no usable bounds
    render(nmPerPixel) {

        if (!this.visible) return

        this.container.style.display = 'block'

        // The widget is display:none until the first render, and a hidden element can't be
        // measured — so the anchor lands here, on the frame it becomes visible.
        if (!this.placed) this.applyAnchor()

        if (undefined === nmPerPixel) return

        const label = this.container.querySelector('#reference-ruler-label')
        label.textContent = ReferenceRuler.formatNMLabel(RULER_LENGTH_PX * nmPerPixel)
    }

    toggle() {
        this.setVisibility(this.visible ? 'hidden' : 'visible')
    }

    setVisibility(visibilityString) {
        this.visible = 'visible' === visibilityString
        this.container.style.display = this.visible ? 'block' : 'none'
        // A hidden widget can't be measured, so the anchor lands on show rather than at construction
        if (this.visible) this.applyAnchor()
        const input = document.getElementById('spacewalk_ui_manager_reference_ruler')
        if (input) input.checked = this.visible
    }

    setState({ r, g, b, visibility }) {
        this.setColor(new THREE.Color(r, g, b))
        this.setVisibility(visibility)
        updateSwatch(document.querySelector(`div[data-colorpicker='reference-ruler']`), new THREE.Color(r, g, b))
    }

    toJSON() {
        const { r, g, b } = this.color
        return { r, g, b, visibility: this.visible ? 'visible' : 'hidden' }
    }

    // Records written before the ruler was placeable have no anchor; they get the default
    static sanitizeAnchor(anchor) {
        if (!anchor || !CORNERS.has(anchor.corner) || !isFinite(anchor.dx) || !isFinite(anchor.dy)) {
            return { ...DEFAULT_ANCHOR }
        }
        return { corner: anchor.corner, dx: anchor.dx, dy: anchor.dy }
    }

    // SettingsManager already persists on this event
    static notifyPlacementChanged() {
        document.dispatchEvent(new Event('spacewalk-settings-changed'))
    }

    static formatNMLabel(nm) {
        if (!isFinite(nm) || nm <= 0) return '0 nm'
        if (nm >= 1000) return `${(nm / 1000).toFixed(2)} μm`
        if (nm >= 100) return `${Math.round(nm)} nm`
        if (nm >= 10) return `${nm.toFixed(1)} nm`
        return `${nm.toFixed(2)} nm`
    }

}

export default ReferenceRuler
