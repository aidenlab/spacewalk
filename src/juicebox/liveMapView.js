import { renderContactMap, renderDistanceMap } from './liveMapRenderUtils.js'

/**
 * Owns the live-map render surface: the two live <canvas> elements (contact and
 * distance), their 2d contexts, the spinner overlays, sizing to the Juicebox
 * viewport, and rendering. The canvases live inside Juicebox's contact-matrix
 * viewport DOM, so the view takes a `getBrowser` thunk (the browser is created —
 * and recreated on session reload — by JuiceboxPanel).
 *
 * Replaces the old arrangement where JuiceboxPanel created these canvases and
 * stashed their contexts on `contactMatrixView.ctx_live_*` as a side-channel the
 * live-map services reached back through. The services now render via this view.
 */
class LiveMapView {

    constructor({ getBrowser }) {
        this.getBrowser = getBrowser
        this.contactCtx = null
        this.distanceCtx = null
        this.contactSpinner = null
        this.distanceSpinner = null
    }

    /**
     * Create (or re-find) the live contact/distance canvas containers, canvases,
     * and spinner overlays inside the Juicebox viewport, then size them. Idempotent
     * and safe to call again after a session reload rebuilds the Juicebox DOM.
     */
    mount() {
        const browser = this.getBrowser()
        const viewport = browser?.layoutController?.getContactMatrixViewport()
        if (!viewport) {
            console.warn('Viewport not found, cannot mount live map canvases')
            return
        }

        const hicContainer = viewport.querySelector(`#${browser.id}-contact-map-canvas-container`)

        const contact = this._ensureSurface(viewport, `${browser.id}-live-contact-map`, hicContainer)
        this.contactCtx = contact.canvas.getContext('2d')
        this.contactSpinner = contact.spinner

        const distance = this._ensureSurface(viewport, `${browser.id}-live-distance-map`, contact.container)
        this.distanceCtx = distance.canvas.getContext('2d')
        this.distanceSpinner = distance.spinner

        this.resize()
    }

    /** Size both live canvases to match the Juicebox viewport. */
    resize() {
        const contactMatrixView = this.getBrowser()?.contactMatrixView
        const width = contactMatrixView?.viewportElement?.offsetWidth
        const height = contactMatrixView?.viewportElement?.offsetHeight

        if (!width || !height) {
            console.warn(`Viewport dimensions are invalid: ${width}x${height}. Canvas sizes not updated.`)
            return
        }

        for (const ctx of [ this.contactCtx, this.distanceCtx ]) {
            if (!ctx) continue
            const { canvas } = ctx
            canvas.width = width
            canvas.height = height
            canvas.style.width = `${width}px`
            canvas.style.height = `${height}px`
        }
    }

    renderContact(lcm, colors) {
        if (!this.contactCtx) {
            console.warn('Live contact canvas context not available')
            return
        }
        renderContactMap(this.contactCtx, lcm, colors)
    }

    renderDistance(lcm, colors) {
        if (!this.distanceCtx) {
            console.warn('Live distance canvas context not available')
            return
        }
        renderDistanceMap(this.distanceCtx, lcm, colors)
    }

    /** Clear both live canvases (e.g. when a new ensemble is loaded). */
    clear() {
        for (const ctx of [ this.contactCtx, this.distanceCtx ]) {
            if (ctx) ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
        }
    }

    /** Show the spinner for whichever live tab is currently active (matches prior behavior). */
    showSpinner() {
        const activeId = document.querySelector('.nav-link.active')?.id
        if (activeId === 'spacewalk-juicebox-panel-live-map-tab' && this.contactSpinner) {
            this.contactSpinner.style.display = 'flex'
        } else if (activeId === 'spacewalk-juicebox-panel-live-distance-map-tab' && this.distanceSpinner) {
            this.distanceSpinner.style.display = 'flex'
        }
    }

    hideSpinner() {
        if (this.contactSpinner) this.contactSpinner.style.display = 'none'
        if (this.distanceSpinner) this.distanceSpinner.style.display = 'none'
    }

    /**
     * Find-or-create a `<div>` container (positioned after `previousSibling`), a
     * pixelated `<canvas>`, and a spinner overlay for one live map. Idempotent.
     */
    _ensureSurface(viewport, idPrefix, previousSibling) {

        let container = viewport.querySelector(`#${idPrefix}-canvas-container`)
        if (!container) {
            container = document.createElement('div')
            container.id = `${idPrefix}-canvas-container`
            if (previousSibling && previousSibling.nextSibling) {
                viewport.insertBefore(container, previousSibling.nextSibling)
            } else {
                viewport.appendChild(container)
            }
        }

        let canvas = container.querySelector(`#${idPrefix}-canvas`)
        if (!canvas) {
            canvas = document.createElement('canvas')
            canvas.id = `${idPrefix}-canvas`
            canvas.style.imageRendering = 'pixelated'
            container.appendChild(canvas)
        }

        let spinner = container.querySelector('.spacewalk-live-map-spinner-overlay')
        if (!spinner) {
            spinner = document.createElement('div')
            spinner.className = 'spacewalk-live-map-spinner-overlay'
            spinner.innerHTML = '<div class="spinner-border text-secondary"></div>'
            container.appendChild(spinner)
        }

        container.style.position = 'relative'

        return { container, canvas, spinner }
    }
}

export default LiveMapView
