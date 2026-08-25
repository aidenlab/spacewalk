import hic from 'juicebox.js'
import SpacewalkEventBus from '../spacewalkEventBus.js'
import Panel from '../panel.js'
import LiveMapView from './liveMapView.js'
import {appleCrayonColorRGB255, rgb255String} from "../utils/colorUtils"
import { presentResourceError } from "../widgets/presentResourceError.js"
import { applyPanelDimensions } from "./panelDimensions.js"

class JuiceboxPanel extends Panel {

    constructor ({ container, panel, isHidden, ensembleManager, sceneManager, genomicNavigator }) {

        const xFunction = (cw, w) => {
            return (cw - w)/2;
        };

        const yFunction = (ch, h) => {
            return ch - (h * 1.05);
        };

        const dragExcludeSelector = [
            'canvas',
            'button',
            'a',
            'input',
            'select',
            'textarea',
            'label',
            '.dropdown-menu',
            '.dropdown-toggle',
            '[data-bs-toggle]',
            '.form-range',
            '.form-select',
            '.nav-link',
            '.fa-times-circle'
        ].join(', ')

        super({
            container,
            panel,
            isHidden,
            xFunction,
            yFunction,
            dragSurface: panel,
            dragOptions: { excludeSelector: dragExcludeSelector }
        });

        this.ensembleManager = ensembleManager
        this.sceneManager = sceneManager
        this.genomicNavigator = genomicNavigator
        this.liveContactMapService = null

        // Owns the live-map render surface (canvases, contexts, spinners, sizing).
        // Browser is read lazily because it's created — and rebuilt on session reload — in loadSession.
        this.liveMapView = new LiveMapView({ getBrowser: () => this.browser })

        // Stable references for add/removeEventListener
        this._tabEventHandler = (event) => this.assessTab(event.target)

        // Juicebox clears its highlight via DidHideCrosshairs (see
        // attachMouseHandlersAndEventSubscribers); the panel only refreshes the ramp.
        this.panel.addEventListener('mouseleave', (event) => {
            event.stopPropagation();
            this.genomicNavigator.repaint()
        });

        SpacewalkEventBus.globalBus.subscribe('DidLoadEnsembleFile', this)

    }

    wireDependencies({ liveContactMapService }) {
        this.liveContactMapService = liveContactMapService
    }

    async initialize(container, config = JuiceboxPanel.defaultConfig) {

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
            applyPanelDimensions(session, JuiceboxPanel.defaultConfig)
            await hic.restoreSession(document.querySelector('#spacewalk_juicebox_root_container'), session)
            this.browser = hic.getCurrentBrowser()

            if (!this.browser) {
                throw new Error('Failed to create browser instance after session restore')
            }
        } catch (e) {
            console.error('Error loading Juicebox Session', e)
            presentResourceError(e, { what: 'the Hi-C map session' })
            this.browser = null
            return
        }

        // Mount the live map render surface (Spacewalk-specific, 2d contexts)
        this.liveMapView.mount()

        this.attachMouseHandlersAndEventSubscribers()

        // Show Hi-C tab
        this.hicMapTab.show()

        // Apply Spacewalk locus
        if (this.ensembleManager && this.ensembleManager.locus && this.browser.genome) {
            const { chr, genomicStart, genomicEnd } = this.ensembleManager.locus
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
                    this.assessTab(activeTabButton)
                    if (this.browser.contactMatrixView && this.browser.activeDataset) {
                        this.browser.contactMatrixView.update().catch(err => console.warn('Error updating contact matrix view after session load:', err))
                    }
                }
            }, 150)
        }

    }

    attachMouseHandlersAndEventSubscribers() {

        this.browser.eventBus.subscribe('DidHideCrosshairs', {
            receiveEvent: () => {
                this.sceneManager.clearHighlight('hideCrosshairs')
                this.genomicNavigator.repaint()
            }
        })

        this.browser.coordinator.addCallback('onMapLoaded', async ({ dataset, state, datasetType }) => {
            const activeTabButton = this.container.querySelector('button.nav-link.active')
            this.assessTab(activeTabButton)

            // Ensure repaint after map load
            if (this.browser.contactMatrixView && this.browser.activeDataset) {
                setTimeout(() => {
                    this.browser.contactMatrixView.update().catch(err => console.warn('Error updating contact matrix view after MapLoad:', err))
                }, 50)
            }
        })

        // Repaint live maps when Juicebox color swatches change
        this.browser.coordinator.addCallback('onBackgroundColorChange', ({ rgb }) => {
            if (this.liveContactMapService) {
                this.liveMapView.resize()
                this.liveContactMapService.repaintContactMap({ background: rgb })
                this.liveContactMapService.repaintDistanceMap({ background: rgb })
            }
        })

        this.browser.coordinator.addCallback('onForegroundColorChange', ({ rgb }) => {
            if (this.liveContactMapService) {
                this.liveMapView.resize()
                this.liveContactMapService.repaintContactMap({ foreground: rgb })
                this.liveContactMapService.repaintDistanceMap({ foreground: rgb })
            }
        })

        this.browser.setCustomCrosshairsHandler(args => this.handleCrosshairs(args))

        this.configureTabs()
    }

    handleCrosshairs({ xBP, yBP, startXBP, startYBP, endXBP, endYBP, interpolantX, interpolantY }) {

        const em = this.ensembleManager
        if (undefined === em || undefined === em.locus) {
            return
        }

        const { genomicStart, genomicEnd } = em.locus

        const trivialRejection = startXBP > genomicEnd || endXBP < genomicStart || startYBP > genomicEnd || endYBP < genomicStart
        if (trivialRejection) return

        const xRejection = xBP < genomicStart || xBP > genomicEnd
        const yRejection = yBP < genomicStart || yBP > genomicEnd
        if (xRejection || yRejection) return

        // A crosshair over a gap in the genomic extent yields no window -> clear, don't highlight.
        const windowList = em.getGenomicInterpolantWindowList([ interpolantX, interpolantY ])
        if (windowList) {
            // Each crosshair carries its own continuous interpolant -> two gliding beads.
            this.sceneManager.highlightController.set(windowList.map(({ index, interpolant }) => ({ index, interpolant })), 'juiceboxCrosshairs')
        } else {
            this.sceneManager.highlightController.clear('juiceboxCrosshairs')
        }
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
        this.assessTab(activeTabButton)

        for (const tabElement of this.container.querySelectorAll('button[data-bs-toggle="tab"]')) {
            tabElement.addEventListener('show.bs.tab', this._tabEventHandler)
        }
    }

    isActiveTab(tab) {
        return tab._element.classList.contains('active')
    }

    detachMouseHandlers() {
        // Move controls back to card-header before browser DOM is destroyed
        moveControlsToCardHeader(document.getElementById('hic-live-map-controls-widget'))
        moveControlsToCardHeader(document.getElementById('hic-live-distance-map-controls-widget'))

        for (const tabElement of this.container.querySelectorAll('button[data-bs-toggle="tab"]')) {
            tabElement.removeEventListener('show.bs.tab', this._tabEventHandler);
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
                // Clear live contact + distance canvases
                this.liveMapView.clear()
            }

            // Apply Spacewalk's locus
            if (this.ensembleManager && this.ensembleManager.locus && this.browser.genome) {
                const { chr, genomicStart, genomicEnd } = this.ensembleManager.locus
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
            if (this.ensembleManager && this.ensembleManager.locus && !isControl) {
                const { chr, genomicStart, genomicEnd } = this.ensembleManager.locus
                config.locus = `${chr}:${genomicStart}-${genomicEnd}`
            }

            if (false === isControl) {
                this.present()
                await this.browser.loadHicFile(config)
            }

        } catch (e) {
            console.error(`Error loading ${ url }`, e)
            presentResourceError(e, { what: 'the Hi-C map', url })
        }

    }

    assessTab(activeTabButton) {

        const browser = this.browser
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

        const resolutionWidget    = hicNavbarContainer?.querySelector('.hic-resolution-selector-container')
        const normalizationWidget = hicNavbarContainer?.querySelector('.hic-normalization-selector-container')
        const colorScaleWidget    = hicNavbarContainer?.querySelector('.hic-colorscale-widget-container')
        // Threshold steppers (the +/- icons next to the colorscale numeric input).
        // The color swatches and numeric input live in the same container and must remain visible on Live tabs.
        const colorScaleThresholdButtons = colorScaleWidget
            ? colorScaleWidget.querySelectorAll('i.fa-minus, i.fa-plus')
            : []

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
                if (resolutionWidget) resolutionWidget.style.display = ''
                if (normalizationWidget) normalizationWidget.style.display = ''
                colorScaleThresholdButtons.forEach(btn => { btn.style.display = '' })
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
                        if (this.liveContactMapService) {
                            this.liveMapView.resize()
                            this.liveContactMapService.repaintContactMap()
                        }
                    }, 0)
                }
                // Hide navbar dataset row, move contact controls into navbar
                if (contactMapNavBar) contactMapNavBar.style.display = 'none'
                if (resolutionWidget) resolutionWidget.style.display = 'none'
                if (normalizationWidget) normalizationWidget.style.display = 'none'
                colorScaleThresholdButtons.forEach(btn => { btn.style.display = 'none' })
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
                        if (this.liveContactMapService) {
                            this.liveMapView.resize()
                            this.liveContactMapService.repaintDistanceMap()
                        }
                    }, 0)
                }
                // Hide navbar dataset row, move distance controls into navbar
                if (contactMapNavBar) contactMapNavBar.style.display = 'none'
                if (resolutionWidget) resolutionWidget.style.display = 'none'
                if (normalizationWidget) normalizationWidget.style.display = 'none'
                colorScaleThresholdButtons.forEach(btn => { btn.style.display = 'none' })
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

JuiceboxPanel.defaultConfig = {
    width: 480,
    height: 480,
    contactMapMenu: {
        id: 'contact-map-datalist',
        items: 'https://aidenlab.org/juicebox/res/hicfiles.json'
    }
}

export default JuiceboxPanel;
