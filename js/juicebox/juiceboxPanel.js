import hic from 'juicebox.js'
import SpacewalkEventBus from '../spacewalkEventBus.js'
import Panel from '../panel.js'
import { ensembleManager, sceneManager, genomicNavigator, liveContactMapService } from '../app.js'
import {appleCrayonColorRGB255, rgb255String} from "../utils/colorUtils"
import {spacewalkConfig} from "../../spacewalk-config.js"

// Store reference to the singleton JuiceboxPanel instance for event handlers
let juiceboxPanelInstance = null;

class JuiceboxPanel extends Panel {

    constructor ({ container, panel, isHidden }) {

        const xFunction = (cw, w) => {
            return (cw - w)/2;
        };

        const yFunction = (ch, h) => {
            return ch - (h * 1.05);
        };

        super({ container, panel, isHidden, xFunction, yFunction });

        // Store singleton instance for event handlers to access
        juiceboxPanelInstance = this;

        this.panel.addEventListener('mouseenter', (event) => {
            event.stopPropagation();
            SpacewalkEventBus.globalBus.post({ type: 'DidEnterGenomicNavigator', data: 'DidEnterGenomicNavigator' });
        });

        this.panel.addEventListener('mouseleave', (event) => {
            event.stopPropagation();
            genomicNavigator.repaint()
            SpacewalkEventBus.globalBus.post({ type: 'DidLeaveGenomicNavigator', data: 'DidLeaveGenomicNavigator' });
        });

        SpacewalkEventBus.globalBus.subscribe('DidLoadEnsembleFile', this)

    }

    async initialize(container, config) {

        let session

        if (config.browsers) {
            session = Object.assign({ queryParametersSupported: false }, config)
        } else {
            const { width, height } = config
            session = { browsers: [ { width, height, queryParametersSupported: false } ] }
        }

        await this.loadSession(session)

    }

    async loadSession(session) {

        this.detachMouseHandlers()

        try {
            const [ browser ] = session.browsers
            if ('{}' === browser) {
                const { width, height} = spacewalkConfig.juiceboxConfig
                session = { browsers: [ { width, height, queryParametersSupported: false } ] }
            }
            await hic.restoreSession(document.querySelector('#spacewalk_juicebox_root_container'), session)
            this.browser = hic.getCurrentBrowser()

            if (!this.browser) {
                throw new Error('Failed to create browser instance after session restore')
            }
        } catch (e) {
            const error = new Error(`Error loading Juicebox Session ${ e.message }`)
            console.error(error.message)
            alert(error.message)
            this.browser = null
            return
        }

        // Initialize live map canvases (Spacewalk-specific, 2d contexts)
        this.initializeLiveMapCanvases()

        this.attachMouseHandlersAndEventSubscribers()

        // Show Hi-C tab
        this.hicMapTab.show()

        // Apply Spacewalk locus
        if (ensembleManager && ensembleManager.locus && this.browser.genome) {
            const { chr, genomicStart, genomicEnd } = ensembleManager.locus
            try {
                await this.browser.parseGotoInput(`${chr}:${genomicStart}-${genomicEnd}`)
            } catch (error) {
                console.warn('Error applying Spacewalk locus:', error.message)
            }
        }

        if (this.browser.activeDataset) {
            // Ensure map is repainted after session load
            setTimeout(() => {
                const activeTabButton = this.container.querySelector('button.nav-link.active')
                if (activeTabButton && activeTabButton.id === 'spacewalk-juicebox-panel-hic-map-tab') {
                    tabAssessment(this.browser, activeTabButton, this)
                    if (this.browser.contactMatrixView && this.browser.activeDataset) {
                        this.browser.contactMatrixView.update().catch(err => console.warn('Error updating contact matrix view after session load:', err))
                    }
                }
            }, 150)
        }

    }

    /**
     * Initialize live map canvas contexts for direct 2d rendering.
     * Both live contact and live distance maps are painted directly
     * to their own canvases — they do NOT use Juicebox's tile pipeline.
     */
    initializeLiveMapCanvases() {
        const browser = this.browser
        const viewport = browser.layoutController.getContactMatrixViewport()

        if (!viewport) {
            console.warn('Viewport not found, cannot initialize live map canvases')
            return
        }

        const hicContainer = viewport.querySelector(`#${browser.id}-contact-map-canvas-container`)

        // --- Live Contact Map canvas ---
        let liveContactContainer = viewport.querySelector(`#${browser.id}-live-contact-map-canvas-container`)
        if (!liveContactContainer) {
            liveContactContainer = document.createElement('div')
            liveContactContainer.id = `${browser.id}-live-contact-map-canvas-container`
            if (hicContainer && hicContainer.nextSibling) {
                viewport.insertBefore(liveContactContainer, hicContainer.nextSibling)
            } else {
                viewport.appendChild(liveContactContainer)
            }
        }

        let contactCanvas = liveContactContainer.querySelector(`#${browser.id}-live-contact-map-canvas`)
        if (!contactCanvas) {
            contactCanvas = document.createElement('canvas')
            contactCanvas.id = `${browser.id}-live-contact-map-canvas`
            contactCanvas.style.imageRendering = 'pixelated'
            liveContactContainer.appendChild(contactCanvas)
        }

        // Spinner overlay for live contact map
        let contactSpinner = liveContactContainer.querySelector('.spacewalk-live-map-spinner-overlay')
        if (!contactSpinner) {
            contactSpinner = document.createElement('div')
            contactSpinner.className = 'spacewalk-live-map-spinner-overlay'
            contactSpinner.innerHTML = '<div class="spinner-border text-secondary"></div>'
            liveContactContainer.appendChild(contactSpinner)
        }
        liveContactContainer.style.position = 'relative'
        this.liveContactSpinner = contactSpinner

        // Store 2d context for live contact map rendering
        browser.contactMatrixView.ctx_live_contact = contactCanvas.getContext('2d')

        // --- Live Distance Map canvas ---
        let liveDistanceContainer = viewport.querySelector(`#${browser.id}-live-distance-map-canvas-container`)
        if (!liveDistanceContainer) {
            liveDistanceContainer = document.createElement('div')
            liveDistanceContainer.id = `${browser.id}-live-distance-map-canvas-container`
            if (liveContactContainer.nextSibling) {
                viewport.insertBefore(liveDistanceContainer, liveContactContainer.nextSibling)
            } else {
                viewport.appendChild(liveDistanceContainer)
            }
        }

        let distanceCanvas = liveDistanceContainer.querySelector(`#${browser.id}-live-distance-map-canvas`)
        if (!distanceCanvas) {
            distanceCanvas = document.createElement('canvas')
            distanceCanvas.id = `${browser.id}-live-distance-map-canvas`
            distanceCanvas.style.imageRendering = 'pixelated'
            liveDistanceContainer.appendChild(distanceCanvas)
        }

        // Spinner overlay for live distance map
        let distanceSpinner = liveDistanceContainer.querySelector('.spacewalk-live-map-spinner-overlay')
        if (!distanceSpinner) {
            distanceSpinner = document.createElement('div')
            distanceSpinner.className = 'spacewalk-live-map-spinner-overlay'
            distanceSpinner.innerHTML = '<div class="spinner-border text-secondary"></div>'
            liveDistanceContainer.appendChild(distanceSpinner)
        }
        liveDistanceContainer.style.position = 'relative'
        this.liveDistanceSpinner = distanceSpinner

        // Store 2d context for live distance map rendering
        browser.contactMatrixView.ctx_live_distance = distanceCanvas.getContext('2d')

        // Size both canvases to match viewport
        this.updateLiveMapCanvasSizes(browser.contactMatrixView)
    }

    /**
     * Update live map canvas sizes to match the main canvas viewport.
     */
    updateLiveMapCanvasSizes(contactMatrixView) {

        const width = contactMatrixView.viewportElement.offsetWidth
        const height = contactMatrixView.viewportElement.offsetHeight

        if (width === 0 || height === 0) {
            console.warn(`Viewport dimensions are invalid: ${width}x${height}. Canvas sizes not updated.`)
            return
        }

        for (const ctxName of ['ctx_live_contact', 'ctx_live_distance']) {
            const ctx = contactMatrixView[ctxName]
            if (ctx) {
                const canvas = ctx.canvas
                canvas.width = width
                canvas.height = height
                canvas.style.width = `${width}px`
                canvas.style.height = `${height}px`
            }
        }
    }

    attachMouseHandlersAndEventSubscribers() {

        this.browser.eventBus.subscribe('DidHideCrosshairs', sceneManager)
        this.browser.eventBus.subscribe('DidHideCrosshairs', genomicNavigator)

        this.browser.coordinator.addCallback('onMapLoaded', async ({ dataset, state, datasetType }) => {
            const activeTabButton = this.container.querySelector('button.nav-link.active')
            tabAssessment(this.browser, activeTabButton, this)

            // Ensure repaint after map load
            if (this.browser.contactMatrixView && this.browser.activeDataset) {
                setTimeout(() => {
                    this.browser.contactMatrixView.update().catch(err => console.warn('Error updating contact matrix view after MapLoad:', err))
                }, 50)
            }
        })

        // Repaint live maps when Juicebox color swatches change
        this.browser.coordinator.addCallback('onBackgroundColorChange', ({ rgb }) => {
            if (liveContactMapService) {
                this.updateLiveMapCanvasSizes(this.browser.contactMatrixView)
                liveContactMapService.repaintContactMap({ background: rgb })
                liveContactMapService.repaintDistanceMap({ background: rgb })
            }
        })

        this.browser.coordinator.addCallback('onForegroundColorChange', ({ rgb }) => {
            if (liveContactMapService) {
                this.updateLiveMapCanvasSizes(this.browser.contactMatrixView)
                liveContactMapService.repaintContactMap({ foreground: rgb })
                liveContactMapService.repaintDistanceMap({ foreground: rgb })
            }
        })

        this.browser.setCustomCrosshairsHandler(({ xBP, yBP, startXBP, startYBP, endXBP, endYBP, interpolantX, interpolantY }) => {
            juiceboxMouseHandler({ xBP, yBP, startXBP, startYBP, endXBP, endYBP, interpolantX, interpolantY });
        })

        this.configureTabs()
    }

    configureTabs() {

        const hicMapTabElement = document.getElementById('spacewalk-juicebox-panel-hic-map-tab')
        const liveMapTabElement = document.getElementById('spacewalk-juicebox-panel-live-map-tab')
        const liveDistanceMapTabElement = document.getElementById('spacewalk-juicebox-panel-live-distance-map-tab')

        // Each tab targets its own canvas container
        hicMapTabElement.setAttribute("data-bs-target", `#${this.browser.id}-contact-map-canvas-container`)
        liveMapTabElement.setAttribute("data-bs-target", `#${this.browser.id}-live-contact-map-canvas-container`)
        liveDistanceMapTabElement.setAttribute("data-bs-target", `#${this.browser.id}-live-distance-map-canvas-container`)

        this.hicMapTab = new bootstrap.Tab(hicMapTabElement)
        this.liveMapTab = new bootstrap.Tab(liveMapTabElement)
        this.liveDistanceMapTab = new bootstrap.Tab(liveDistanceMapTabElement)

        this.hicMapTab.show()

        const activeTabButton = this.container.querySelector('button.nav-link.active')
        tabAssessment(this.browser, activeTabButton, this)

        for (const tabElement of this.container.querySelectorAll('button[data-bs-toggle="tab"]')) {
            tabElement.addEventListener('show.bs.tab', tabEventHandler)
        }
    }

    showLiveMapSpinner() {
        const activeTabButton = this.panel.querySelector('button.nav-link.active')
        if (activeTabButton?.id === 'spacewalk-juicebox-panel-live-map-tab' && this.liveContactSpinner) {
            this.liveContactSpinner.style.display = 'flex'
        } else if (activeTabButton?.id === 'spacewalk-juicebox-panel-live-distance-map-tab' && this.liveDistanceSpinner) {
            this.liveDistanceSpinner.style.display = 'flex'
        }
    }

    hideLiveMapSpinner() {
        if (this.liveContactSpinner) this.liveContactSpinner.style.display = 'none'
        if (this.liveDistanceSpinner) this.liveDistanceSpinner.style.display = 'none'
    }

    isActiveTab(tab) {
        return tab._element.classList.contains('active')
    }

    detachMouseHandlers() {
        // Move controls back to card-header before browser DOM is destroyed
        moveControlsToCardHeader(document.getElementById('hic-live-map-controls-widget'))
        moveControlsToCardHeader(document.getElementById('hic-live-distance-map-controls-widget'))

        for (const tabElement of this.container.querySelectorAll('button[data-bs-toggle="tab"]')) {
            tabElement.removeEventListener('show.bs.tab', tabEventHandler);
        }
    }

    async receiveEvent({ type, data }) {

        if ('DidLoadEnsembleFile' === type) {

            if (this.browser.contactMatrixView) {
                // Clear Juicebox main canvas (Hi-C)
                if (this.browser.contactMatrixView.ctx) {
                    const ctx = this.browser.contactMatrixView.ctx
                    ctx.fillStyle = rgb255String( appleCrayonColorRGB255('snow') )
                    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
                }
                // Clear live contact canvas
                if (this.browser.contactMatrixView.ctx_live_contact) {
                    const ctx = this.browser.contactMatrixView.ctx_live_contact
                    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
                }
                // Clear live distance canvas
                if (this.browser.contactMatrixView.ctx_live_distance) {
                    const ctx = this.browser.contactMatrixView.ctx_live_distance
                    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
                }
            }

            // Apply Spacewalk's locus
            if (ensembleManager && ensembleManager.locus && this.browser.genome) {
                const { chr, genomicStart, genomicEnd } = ensembleManager.locus
                try {
                    await this.browser.parseGotoInput(`${chr}:${genomicStart}-${genomicEnd}`)
                } catch (error) {
                    console.warn('Error applying Spacewalk locus after ensemble load:', error.message)
                }
            }

            this.hicMapTab.show()

        }

        super.receiveEvent({ type, data });

    }

    getClassName(){ return 'JuiceboxPanel' }

    async loadHicFile(url, name, mapType) {

        try {
            const isControl = ('control-map' === mapType)

            const config = { url, name, isControl }
            if (ensembleManager && ensembleManager.locus && !isControl) {
                const { chr, genomicStart, genomicEnd } = ensembleManager.locus
                config.locus = `${chr}:${genomicStart}-${genomicEnd}`
            }

            if (false === isControl) {
                this.present()
                await this.browser.loadHicFile(config)
            }

        } catch (e) {
            const error = new Error(`Error loading ${ url }: ${ e }`)
            console.error(error.message)
            alert(error.message)
        }

    }
}

function juiceboxMouseHandler({ xBP, yBP, startXBP, startYBP, endXBP, endYBP, interpolantX, interpolantY }) {

    if (undefined === ensembleManager || undefined === ensembleManager.locus) {
        return
    }

    const { genomicStart, genomicEnd } = ensembleManager.locus

    const trivialRejection = startXBP > genomicEnd || endXBP < genomicStart || startYBP > genomicEnd || endYBP < genomicStart

    if (trivialRejection) {
        return
    }

    const xRejection = xBP < genomicStart || xBP > genomicEnd
    const yRejection = yBP < genomicStart || yBP > genomicEnd

    if (xRejection || yRejection) {
        return
    }

    sceneManager.delegateGenomicInterpolant({ interpolantList: [ interpolantX, interpolantY ] })
    genomicNavigator.highlightFromInterpolant([ interpolantX, interpolantY ])
}

function tabEventHandler(event) {
    tabAssessment(juiceboxPanelInstance.browser, event.target, juiceboxPanelInstance);
}

function tabAssessment(browser, activeTabButton, panel) {

    const viewport = browser.layoutController.getContactMatrixViewport()
    if (!viewport) {
        console.warn('Viewport not found for tab assessment')
        return
    }

    const hicContainer = viewport.querySelector(`#${browser.id}-contact-map-canvas-container`)
    const liveContactContainer = viewport.querySelector(`#${browser.id}-live-contact-map-canvas-container`)
    const liveDistanceContainer = viewport.querySelector(`#${browser.id}-live-distance-map-canvas-container`)

    // Juicebox navbar elements
    const hicNavbarContainer = browser.rootElement?.querySelector('.hic-navbar-container')
    const contactMapNavBar = hicNavbarContainer?.querySelector(`div[id$='-contact-map-hic-nav-bar-map-container']`)
    const controlsWidget = document.getElementById('hic-live-map-controls-widget')
    const distanceControlsWidget = document.getElementById('hic-live-distance-map-controls-widget')

    // Hide all canvas containers
    if (hicContainer) hicContainer.style.display = 'none'
    if (liveContactContainer) liveContactContainer.style.display = 'none'
    if (liveDistanceContainer) liveDistanceContainer.style.display = 'none'

    switch (activeTabButton.id) {
        case 'spacewalk-juicebox-panel-hic-map-tab':
            if (hicContainer) {
                hicContainer.style.display = 'block'
                // Trigger repaint
                setTimeout(() => {
                    if (browser.contactMatrixView && browser.activeDataset) {
                        browser.contactMatrixView.update().catch(err => console.warn('Error updating contact matrix view:', err))
                    }
                }, 0)
            }
            // Show navbar dataset row, restore controls to card-header
            if (contactMapNavBar) contactMapNavBar.style.display = ''
            moveControlsToCardHeader(controlsWidget)
            moveControlsToCardHeader(distanceControlsWidget)
            controlsWidget.style.display = 'none'
            distanceControlsWidget.style.display = 'none'
            document.getElementById('hic-file-chooser-dropdown').style.display = 'block'
            break;

        case 'spacewalk-juicebox-panel-live-map-tab':
            if (liveContactContainer) {
                liveContactContainer.style.display = 'block'
                // Repaint with current state when tab becomes visible (contact canvas may have been cleared when switching to Distance tab)
                setTimeout(() => {
                    if (liveContactMapService) {
                        panel.updateLiveMapCanvasSizes(browser.contactMatrixView)
                        liveContactMapService.repaintContactMap()
                    }
                }, 0)
            }
            // Hide navbar dataset row, move contact controls into navbar
            if (contactMapNavBar) contactMapNavBar.style.display = 'none'
            moveControlsToNavbar(controlsWidget, hicNavbarContainer, contactMapNavBar)
            moveControlsToCardHeader(distanceControlsWidget)
            controlsWidget.style.display = ''
            distanceControlsWidget.style.display = 'none'
            document.getElementById('hic-file-chooser-dropdown').style.display = 'none'
            break;

        case 'spacewalk-juicebox-panel-live-distance-map-tab':
            if (liveDistanceContainer) {
                liveDistanceContainer.style.display = 'block'
                // Repaint with current colors when tab becomes visible
                setTimeout(() => {
                    if (liveContactMapService) {
                        panel.updateLiveMapCanvasSizes(browser.contactMatrixView)
                        liveContactMapService.repaintDistanceMap()
                    }
                }, 0)
            }
            // Hide navbar dataset row, move distance controls into navbar
            if (contactMapNavBar) contactMapNavBar.style.display = 'none'
            moveControlsToCardHeader(controlsWidget)
            moveControlsToNavbar(distanceControlsWidget, hicNavbarContainer, contactMapNavBar)
            controlsWidget.style.display = 'none'
            distanceControlsWidget.style.display = ''
            document.getElementById('hic-file-chooser-dropdown').style.display = 'none'
            break;

        default:
            console.log('Unknown tab is active');
            break;
    }
}

function moveControlsToNavbar(controlsWidget, hicNavbarContainer, contactMapNavBar) {
    if (!hicNavbarContainer || controlsWidget.parentElement === hicNavbarContainer) return
    if (!controlsWidget._originalParent) {
        controlsWidget._originalParent = controlsWidget.parentElement
    }
    hicNavbarContainer.insertBefore(controlsWidget, contactMapNavBar)
}

function moveControlsToCardHeader(controlsWidget) {
    if (!controlsWidget?._originalParent || controlsWidget.parentElement === controlsWidget._originalParent) return
    controlsWidget._originalParent.appendChild(controlsWidget)
}

export default JuiceboxPanel;
