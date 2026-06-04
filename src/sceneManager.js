import * as THREE from 'three'
import EnsembleManager from "./ensembleManager.js"
import SpacewalkEventBus from './spacewalkEventBus.js'
import {getCameraPoseAlongAxis} from './cameraLightingRig.js'
import BallAndStick from "./ballAndStick.js"
import PointCloud from "./pointCloud.js"
import Ribbon from './ribbon.js'
import { clearScene } from './utils/disposalUtils.js'
import { getThreeJSContainerRect } from "./utils/threeJSContainer.js"
import {appleCrayonColorThreeJS, highlightColor} from "./utils/colorUtils.js"
import BallHighlighter from "./ballHighlighter.js"
import PointCloudHighlighter from "./pointCloudHighlighter.js"
import HighlightController from "./highlightController.js"

class SceneManager {

    constructor({ colorRampMaterialProvider, scene, ensembleManager, cameraLightingRig, sceneFixtures }) {
        this.colorRampMaterialProvider = colorRampMaterialProvider;
        this.scene = scene;
        this.ensembleManager = ensembleManager;
        this.cameraLightingRig = cameraLightingRig;
        this.sceneFixtures = sceneFixtures;
        this.igvPanel = null;
        this.isLoading = false;

        // Transient visualization objects — null when no model loaded
        this.ballAndStick = null
        this.pointCloud = null
        this.ribbon = null

        // Persistent state that survives across model loads.
        // Highlighters are created later via createHighlighters() once igvPanel
        // and genomicNavigator exist — they aren't constructed at app boot.
        this.ballHighlighter = null
        this.pointCloudHighlighter = null

        // Phase 1 (shadow mode) single source of truth for the highlight
        // selection. Producers report here; nothing renders from it yet.
        // See development-notes/refactor-highlighting-redesign.md.
        this.highlightController = new HighlightController()

        this.stickMaterial = new THREE.MeshPhongMaterial({ color: appleCrayonColorThreeJS('aluminum') })
        this.stickMaterial.side = THREE.DoubleSide
        this.deemphasizedColor = appleCrayonColorThreeJS('magnesium')
        this.isStickVisible = true
        this.ballRadiusIndex = undefined
        this.pointSizeBoundRadiusPercentage = undefined
        this.pointOpacity = 0.375

        SpacewalkEventBus.globalBus.subscribe('DidSelectTrace', this);
        SpacewalkEventBus.globalBus.subscribe('DidLeaveGenomicNavigator', this);
        SpacewalkEventBus.globalBus.subscribe('DidChangeColorMap', this);
    }

    wireDependencies({ igvPanel }) {
        this.igvPanel = igvPanel
    }

    createHighlighters({ ensembleManager, igvPanel, genomicNavigator }) {
        this.ballHighlighter = new BallHighlighter(highlightColor, { ensembleManager, igvPanel })
        this.pointCloudHighlighter = new PointCloudHighlighter({ ensembleManager, igvPanel })

        // The navigator strip renders from the shared selection, independent of
        // render style.
        this.highlightController.addRenderer(selection => genomicNavigator.renderHighlight(selection))

        // The active 3D visualization renders the same selection. This is the one
        // place the render-style switch lives, replacing the delegate* routers.
        this.highlightController.addRenderer(selection => this.getActiveVisualization()?.renderHighlight(selection))
    }

    getActiveVisualization() {
        if (this.ballAndStick && BallAndStick.renderStyle === this.renderStyle) {
            return this.ballAndStick
        } else if (this.pointCloud && PointCloud.renderStyle === this.renderStyle) {
            return this.pointCloud
        } else if (this.ribbon && Ribbon.renderStyle === this.renderStyle) {
            return this.ribbon
        }
        return undefined
    }

    receiveEvent({ type, data }) {

        if ('DidSelectTrace' === type) {
            const { trace } = data
            this.isLoading = true
            try {
                this.setupWithTrace(trace)
                this.configureRenderStyle(true === this.ensembleManager.isPointCloud ? PointCloud.renderStyle : this.renderStyle)
            } finally {
                this.isLoading = false
            }

        } else if ('DidLeaveGenomicNavigator' === type) {
            this.clearHighlight('leaveNavigator')
        } else if ('DidChangeColorMap' === type) {
            if (this.igvPanel.materialProvider === this.colorRampMaterialProvider) {
                this.updateMaterialProvider(this.colorRampMaterialProvider)
            }
        }

    }

    /**
     * Clear the shared highlight selection. The controller reconciles by handing
     * the empty selection to every registered renderer — the navigator strip and
     * the active visualization both clear via renderHighlight([]). No per-viz
     * routing needed: only the active viz is a registered renderer, and inactive
     * vizzes are already hidden by configureRenderStyle().
     */
    clearHighlight(source) {
        this.highlightController.clear(source)
    }

    setupWithTrace(trace) {

        const { scene, ensembleManager, igvPanel, cameraLightingRig, sceneFixtures } = this

        this.background = scene.background
        this.purgeScene()

        if (ensembleManager.isPointCloud) {
            this.pointCloud = new PointCloud({
                trace,
                pickHighlighter: this.pointCloudHighlighter,
                deemphasizedColor: this.deemphasizedColor,
                pointSizeBoundRadiusPercentage: this.pointSizeBoundRadiusPercentage,
                pointOpacity: this.pointOpacity,
                ensembleManager,
                igvPanel
            })
            this.pointCloud.addToScene(scene)
        } else {
            this.ribbon = new Ribbon(trace, { ensembleManager, igvPanel })
            this.ribbon.addToScene(scene)

            this.ballAndStick = new BallAndStick({
                trace,
                pickHighlighter: this.ballHighlighter,
                stickMaterial: this.stickMaterial,
                isStickVisible: this.isStickVisible,
                ballRadiusIndex: this.ballRadiusIndex,
                ensembleManager,
                igvPanel,
                sceneManager: this
            })
            this.ballAndStick.addToScene(scene)
        }

        scene.background = this.background;

        const {min, max, center, radius} = EnsembleManager.getTraceBounds(trace);
        const {position, fov} = getCameraPoseAlongAxis({ center, radius, axis: '+z', scaleFactor: 1e1 })

        const boundingDiameter = (2 * radius)

        const { width, height } = getThreeJSContainerRect();
        cameraLightingRig.configure(fov, width/height, position, center, boundingDiameter)

        sceneFixtures.setupForBounds({ min, max, center, boundingDiameter })
    }

    rebuildTraceGeometry() {

        const { scene, ensembleManager, igvPanel } = this

        if (ensembleManager.isPointCloud) return

        const trace = ensembleManager.currentTrace
        if (!trace) return

        if (this.ballAndStick) {
            this.isStickVisible = this.ballAndStick.isStickVisible
            this.ballAndStick.dispose()
            this.ballAndStick = null
        }
        if (this.ribbon) {
            this.ribbon.dispose()
            this.ribbon = null
        }

        this.ribbon = new Ribbon(trace, { ensembleManager, igvPanel })
        this.ribbon.addToScene(scene)

        this.ballAndStick = new BallAndStick({
            trace,
            pickHighlighter: this.ballHighlighter,
            stickMaterial: this.stickMaterial,
            isStickVisible: this.isStickVisible,
            ballRadiusIndex: this.ballRadiusIndex,
            ensembleManager,
            igvPanel,
            sceneManager: this
        })
        this.ballAndStick.addToScene(scene)

        this.configureRenderStyle(this.renderStyle)
    }

    configureRenderStyle (renderStyle) {

        if (Ribbon.renderStyle === renderStyle) {
            this.pointCloud?.hide()
            this.ballAndStick?.hide()
            this.ribbon?.show()
        } else if (BallAndStick.renderStyle === renderStyle) {
            this.pointCloud?.hide()
            this.ribbon?.hide()
            this.ballAndStick?.show()
        } else if (PointCloud.renderStyle === renderStyle) {
            this.ballAndStick?.hide()
            this.ribbon?.hide()
            this.pointCloud?.show()
        }

        this.renderStyle = renderStyle
    }

    toJSON() {
        const { r, g, b } = this.scene.background
        return  { r, g, b }
    }

    isGood2Go() {
        return !this.isLoading && this.scene && this.sceneFixtures.getGnomon() && this.sceneFixtures.getGroundPlane()
     }

    purgeScene() {

        // Capture persistent state from outgoing visualization objects before disposal
        if (this.pointCloud) {
            this.pointSizeBoundRadiusPercentage = this.pointCloud.pointSizeBoundRadiusPercentage
            this.pointOpacity = this.pointCloud.pointOpacity
        }
        if (this.ballAndStick) {
            this.isStickVisible = this.ballAndStick.isStickVisible
        }

        // Dispose visualization objects
        if (this.ballAndStick) {
            this.ballAndStick.dispose()
            this.ballAndStick = null
        }
        if (this.ribbon) {
            this.ribbon.dispose()
            this.ribbon = null
        }
        if (this.pointCloud) {
            this.pointCloud.dispose()
            this.pointCloud = null
        }

        // Dispose fixtures BEFORE clearScene removes them from the scene
        this.sceneFixtures.dispose()

        // Clear remaining scene objects (hemisphere light, etc.)
        clearScene(this.scene)

    }

    /**
     * Render loop delegation — called by App.render() each frame
     */
    renderLoopHelper() {
        this.pointCloud?.renderLoopHelper()
        this.ballAndStick?.renderLoopHelper()
        this.ribbon?.renderLoopHelper()
    }

    updateMaterialProvider(materialProvider) {
        this.ribbon?.updateMaterialProvider(materialProvider)
        this.ballAndStick?.updateMaterialProvider(materialProvider)
        this.pointCloud?.updateMaterialProvider(materialProvider)
    }

    getConvexHull() {
        switch (this.renderStyle) {
            case Ribbon.renderStyle:
                return this.ribbon?.hull
            case PointCloud.renderStyle:
                return this.pointCloud?.hull
            case BallAndStick.renderStyle:
                return this.ballAndStick?.hull
            default:
                return undefined
        }
    }

}

export default SceneManager;
