import * as THREE from "three"
import { appleCrayonColorThreeJS, rgb255String, threeJSColorToRGB255 } from "./utils/colorUtils.js"
import { register, updateSwatch } from "./utils/sharedColorPicker.js"

const RULER_LENGTH_PX = 128

// A fixed-length legend parked in a corner of the render container. Unlike the scale bars,
// which straddle the data, the ruler never moves with the camera — it answers the single
// question "what does 128px mean right now?"
class ReferenceRuler {

    constructor(renderContainer, isHidden, initialColor) {

        this.renderContainer = renderContainer
        this.color = initialColor ?? appleCrayonColorThreeJS('iron')
        this.visible = !(isHidden)

        register(document.querySelector(`div[data-colorpicker='reference-ruler']`), this.color, () => this.color, color => this.setColor(color))
    }

    insertDOM() {

        const w = RULER_LENGTH_PX
        const colorString = rgb255String(threeJSColorToRGB255(this.color))
        const html =
            `<div id="spacewalk-reference-ruler-container" style="position: absolute; left: 20px; bottom: 20px; user-select: none; display: none; width: ${w}px;">
              <div id="reference-ruler-bar" style="width: ${w}px; height: 5px; background-color: ${colorString};"></div>
              <div id="reference-ruler-label" style="width: ${w}px; text-align: center; font-family: 'HelveticaNeue-Light', 'Helvetica Neue'; font-size: 18px; font-weight: 300; letter-spacing: 0.75px; color: ${colorString}; margin-top: 4px;"></div>
            </div>`

        const fragment = document.createRange().createContextualFragment(html)
        this.container = fragment.firstChild
        this.renderContainer.appendChild(this.container)
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

    static formatNMLabel(nm) {
        if (!isFinite(nm) || nm <= 0) return '0 nm'
        if (nm >= 1000) return `${(nm / 1000).toFixed(2)} μm`
        if (nm >= 100) return `${Math.round(nm)} nm`
        if (nm >= 10) return `${nm.toFixed(1)} nm`
        return `${nm.toFixed(2)} nm`
    }

}

export default ReferenceRuler
export { RULER_LENGTH_PX }
