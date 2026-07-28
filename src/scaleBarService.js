import * as THREE from "three"
import { rgb255String, threeJSColorToRGB255, appleCrayonColorThreeJS } from "./utils/colorUtils.js"
import { register, updateSwatch } from "./utils/sharedColorPicker.js"

class ScaleBarService {

    constructor(renderContainer, isHidden, initialColor) {
        this.renderContainer = renderContainer

        this.color = initialColor ?? appleCrayonColorThreeJS('iron')

        this.visible = !(isHidden);

        register(document.querySelector(`div[data-colorpicker='scale-bars']`), this.color, () => this.color, color => this.setColor(color))
    }

    setColor(color){

        const { r, g, b } = color
        this.color.setRGB(r, g, b)
        ScaleBarService.setSVGElementColor('horizontal-scale-bar', this.color)
        ScaleBarService.setSVGElementColor('horizontal-scale-bar-label', this.color)
        ScaleBarService.setSVGElementColor('vertical-scale-bar', this.color)
        ScaleBarService.setSVGElementColor('vertical-scale-bar-label', this.color)
    }

    updateScaleBars(scaleBarBounds) {
        // Guard against invalid dimensions
        if (!isFinite(scaleBarBounds.width) || !isFinite(scaleBarBounds.height) ||
            scaleBarBounds.width <= 0 || scaleBarBounds.height <= 0) {
            return;
        }

        // Position the horizontal scale bar container
        this.horizontalContainer.style.left = `${scaleBarBounds.west}px`;
        this.horizontalContainer.style.top = `${scaleBarBounds.north + 20}px`; // Offset slightly above the object

        // Horizontal Scale Bar
        const horizontalSVG = this.horizontalContainer.querySelector('#horizontal-scale-bar-svg');
        const horizontalBar = this.horizontalContainer.querySelector('#horizontal-scale-bar');
        const horizontalLabel = this.horizontalContainer.querySelector('#horizontal-scale-bar-label');

        // Update SVG dimensions and viewBox
        horizontalSVG.setAttribute('width', `${scaleBarBounds.width}px`);
        horizontalSVG.setAttribute('viewBox', `0 0 ${scaleBarBounds.width} 38`);

        // Update rect dimensions explicitly
        horizontalBar.setAttribute('width', `${scaleBarBounds.width}`);
        horizontalBar.setAttribute('height', `5`); // Fixed bar height

        // Update label text
        horizontalLabel.textContent = `${Math.round(scaleBarBounds.widthNM)} nm`;

        // Position the vertical scale bar container
        this.verticalContainer.style.left = `${scaleBarBounds.west - 38}px`; // Position to the left of the data
        this.verticalContainer.style.top = `${scaleBarBounds.south}px`;

        // Vertical Scale Bar
        const verticalSVG = this.verticalContainer.querySelector('#vertical-scale-bar-svg');
        const verticalBar = this.verticalContainer.querySelector('#vertical-scale-bar');
        const verticalLabel = this.verticalContainer.querySelector('#vertical-scale-bar-label');

        // Update SVG dimensions and viewBox
        verticalSVG.setAttribute('height', `${scaleBarBounds.height}px`);
        verticalSVG.setAttribute('viewBox', `0 0 38 ${scaleBarBounds.height}`);

        // Update rect dimensions explicitly
        verticalBar.setAttribute('width', `5`); // Fixed bar width
        verticalBar.setAttribute('height', `${scaleBarBounds.height}`);

        // Calculate the midpoint of the bar
        const labelY = scaleBarBounds.height / 2;

        // Update label positioning
        verticalLabel.setAttribute('y', `${labelY}`);
        verticalLabel.setAttribute('transform', `rotate(-90, 18, ${labelY})`);
        verticalLabel.textContent = `${Math.round(scaleBarBounds.heightNM)} nm`;
    }

    // Called each animation frame with bounds already projected by the render loop
    render(scaleBarBounds) {

        if (!this.visible) return

        this.horizontalContainer.style.display = 'block'
        this.verticalContainer.style.display = 'block'
        this.updateScaleBars(scaleBarBounds)
    }

    insertScaleBarDOM() {

        let fragment

        const horizontalHTML =
            `<div id="spacewalk-horizontal-scale-bar-container" style="position: absolute;user-select: none;; display: none">
              <svg id="horizontal-scale-bar-svg" xmlns="http://www.w3.org/2000/svg" height="38px" viewBox="0 0 372 38" preserveAspectRatio="none">
                <rect id="horizontal-scale-bar" x="0" y="4" width="100%" height="5" fill="grey"></rect>
                <text id="horizontal-scale-bar-label" x="50%" y="30" font-family="HelveticaNeue-Light, Helvetica Neue" font-size="18" font-weight="300" letter-spacing="0.75" fill="black" text-anchor="middle">
                  25nm
                </text>
              </svg>
            </div>`

        fragment = document.createRange().createContextualFragment(horizontalHTML)
        this.horizontalContainer =  fragment.firstChild
        this.renderContainer.appendChild(this.horizontalContainer)

        const verticalHTML =
            `<div id="spacewalk-vertical-scale-bar-container" style="position: absolute;user-select: none; display: none">
              <svg id="vertical-scale-bar-svg" xmlns="http://www.w3.org/2000/svg" width="38px" viewBox="0 0 38 266" preserveAspectRatio="none">
                <rect id="vertical-scale-bar" x="24" y="0" width="5" height="100%" fill="grey"></rect>
                <text id="vertical-scale-bar-label" x="18" y="133" font-family="HelveticaNeue-Light, Helvetica Neue" font-size="18" font-weight="300" letter-spacing="0.75" fill="black" text-anchor="middle" transform="rotate(-90, 18, 133)">
                  25nm
                </text>
              </svg>
            </div>`

        fragment = document.createRange().createContextualFragment(verticalHTML)
        this.verticalContainer =  fragment.firstChild
        this.renderContainer.appendChild(this.verticalContainer)

        ScaleBarService.setSVGElementColor('horizontal-scale-bar', this.color)
        ScaleBarService.setSVGElementColor('horizontal-scale-bar-label', this.color)
        ScaleBarService.setSVGElementColor('vertical-scale-bar', this.color)
        ScaleBarService.setSVGElementColor('vertical-scale-bar-label', this.color)


    }

    toggle() {
        const isVisible = !this.visible
        const visibilityString = true === isVisible ? 'visible' : 'hidden'
        this.setVisibility(visibilityString)
    }

    setVisibility(visibilityString) {
        'visible' === visibilityString ? this.present() : this.dismiss()
    }

    present() {
        this.visible = true;
        this.horizontalContainer.style.display = 'block'
        this.verticalContainer.style.display = 'block'
        ScaleBarService.setRulerWidgetVisibilityStatus(this.visible);
    }

    dismiss() {
        this.visible = false;
        this.horizontalContainer.style.display = 'none'
        this.verticalContainer.style.display = 'none'
        ScaleBarService.setRulerWidgetVisibilityStatus(this.visible);
    }

    setState({ r, g, b, visibility}) {

        this.setColor(new THREE.Color(r, g, b))
        this.setVisibility(visibility)
        updateSwatch(document.querySelector(`div[data-colorpicker='scale-bars']`), new THREE.Color(r, g, b))
    }

    toJSON(){
        const { r, g, b } = this.color
        return { r, g, b, visibility: this.visible ? 'visible' : 'hidden' }
    }

    static setSVGElementColor(elementID, color){
        const element = document.getElementById(`${ elementID }`)
        element.setAttribute("fill", `${ rgb255String(threeJSColorToRGB255(color)) }`)
    }

    static setRulerWidgetVisibilityStatus(status) {
        const input = document.getElementById('spacewalk_ui_manager_scale_bars');
        if (input) {
            input.checked = status;
        }
    }

    static setScaleBarsHidden() {
        const input = document.getElementById('spacewalk_ui_manager_scale_bars')
        const status = input.checked
        return !status
    }

}

export default ScaleBarService
