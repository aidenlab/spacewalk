import * as THREE from 'three'
import EnsembleManager from "./ensembleManager.js"
import SpacewalkEventBus from './spacewalkEventBus.js'
import {getCameraPoseAlongAxis} from './cameraLightingRig.js'
import BallAndStick from "./ballAndStick.js"
import PointCloud from "./pointCloud.js"
import Ribbon from './ribbon.js'
import { clearScene } from './utils/disposalUtils.js'
import {
    scene,
    ensembleManager,
    igvPanel,
    genomicNavigator,
    cameraLightingRig,
    sceneFixtures,
    getThreeJSContainerRect,
} from "./app.js"
import {appleCrayonColorThreeJS, highlightColor} from "./utils/colorUtils.js"
import BallHighlighter from "./ballHighlighter.js"
import PointCloudHighlighter from "./pointCloudHighlighter.js"

class SceneManager {

    constructor(colorRampMaterialProvider) {
        this.colorRampMaterialProvider = colorRampMaterialProvider;
        this.isLoading = false;

        // Transient visualization objects — null when no model loaded
        this.ballAndStick = null
        this.pointCloud = null
        this.ribbon = null

        // Persistent state that survives across model loads
        this.ballHighlighter = new BallHighlighter(highlightColor, { ensembleManager, igvPanel, genomicNavigator })
        this.pointCloudHighlighter = new PointCloudHighlighter({ ensembleManager, igvPanel })
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

    receiveEvent({ type, data }) {

        if ('DidSelectTrace' === type) {
            const { trace } = data
            this.isLoading = true
            try {
                this.setupWithTrace(trace)
                this.configureRenderStyle(true === ensembleManager.isPointCloud ? PointCloud.renderStyle : this.renderStyle)
            } finally {
                this.isLoading = false
            }

        } else if ('DidLeaveGenomicNavigator' === type) {
            this.delegateLeaveGenomicNavigator()
        } else if ('DidChangeColorMap' === type) {
            if (igvPanel.materialProvider === this.colorRampMaterialProvider) {
                this.updateMaterialProvider(this.colorRampMaterialProvider)
            }
        }

    }

    /**
     * Delegate genomic interpolant events to the active visualization object
     */
    delegateGenomicInterpolant(data) {
        if (this.ballAndStick && BallAndStick.renderStyle === this.renderStyle) {
            this.ballAndStick.handleGenomicInterpolant(data)
        } else if (this.pointCloud && PointCloud.renderStyle === this.renderStyle) {
            this.pointCloud.handleGenomicInterpolant(data)
        } else if (this.ribbon && Ribbon.renderStyle === this.renderStyle) {
            this.ribbon.handleGenomicInterpolant(data)
        }
    }

    /**
     * Delegate hide crosshairs events to affected visualization objects
     */
    delegateHideCrosshairs() {
        if (this.ballAndStick && BallAndStick.renderStyle === this.renderStyle) {
            this.ballAndStick.handleHideCrosshairs()
        }
        if (this.ribbon) {
            this.ribbon.handleHideHighlights()
        }
    }

    /**
     * Delegate leave genomic navigator events
     */
    delegateLeaveGenomicNavigator() {
        if (this.pointCloud && PointCloud.renderStyle === this.renderStyle) {
            this.pointCloud.handleLeaveGenomicNavigator()
        }
        if (this.ribbon) {
            this.ribbon.handleHideHighlights()
        }
    }

    setupWithTrace(trace) {

        this.background = scene.background
        this.purgeScene()

        if (ensembleManager.isPointCloud) {
            this.pointCloud = new PointCloud({
                trace,
                pickHighlighter: this.pointCloudHighlighter,
                deemphasizedColor: this.deemphasizedColor,
                pointSizeBoundRadiusPercentage: this.pointSizeBoundRadiusPercentage,
                pointOpacity: this.pointOpacity
            })
            this.pointCloud.addToScene(scene)
        } else {
            this.ribbon = new Ribbon(trace)
            this.ribbon.addToScene(scene)

            this.ballAndStick = new BallAndStick({
                trace,
                pickHighlighter: this.ballHighlighter,
                stickMaterial: this.stickMaterial,
                isStickVisible: this.isStickVisible,
                ballRadiusIndex: this.ballRadiusIndex
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

        this.ribbon = new Ribbon(trace)
        this.ribbon.addToScene(scene)

        this.ballAndStick = new BallAndStick({
            trace,
            pickHighlighter: this.ballHighlighter,
            stickMaterial: this.stickMaterial,
            isStickVisible: this.isStickVisible,
            ballRadiusIndex: this.ballRadiusIndex
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
        const { r, g, b } = scene.background
        return  { r, g, b }
    }

    isGood2Go() {
        return !this.isLoading && scene && sceneFixtures.getGnomon() && sceneFixtures.getGroundPlane()
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
        sceneFixtures.dispose()

        // Clear remaining scene objects (hemisphere light, etc.)
        clearScene(scene)

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
