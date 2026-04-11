import * as THREE from 'three'
import EnsembleManager from "./ensembleManager.js"
import SpacewalkEventBus from './spacewalkEventBus.js'
import {getCameraPoseAlongAxis} from './cameraLightingRig.js'
import BallAndStick from "./ballAndStick.js"
import PointCloud from "./pointCloud.js"
import GroundPlane from './groundPlane.js'
import Gnomon from './gnomon.js'
import GUIManager from "./guiManager.js"
import {setMaterialProvider, unsetDataMaterialProviderCheckbox} from "./utils/utils.js"
import Ribbon from './ribbon.js'
import { clearScene } from './utils/disposalUtils.js'
import {
    scene,
    ensembleManager,
    igvPanel,
    cameraLightingRig,
    getThreeJSContainerRect,
} from "./app.js"
import {appleCrayonColorThreeJS, highlightColor} from "./utils/colorUtils.js"
import { register, updateSwatch } from "./utils/sharedColorPicker.js"
import SettingsManager from "./settingsManager.js"
import BallHighlighter from "./ballHighlighter.js"
import PointCloudHighlighter from "./pointCloudHighlighter.js"
import ScaleBarService from "./scaleBarService.js"

class SceneManager {

    constructor(colorRampMaterialProvider) {
        this.colorRampMaterialProvider = colorRampMaterialProvider;
        this.isLoading = false;

        // Transient visualization objects — null when no model loaded
        this.ballAndStick = null
        this.pointCloud = null
        this.ribbon = null

        // Persistent state that survives across model loads
        this.ballHighlighter = new BallHighlighter(highlightColor)
        this.pointCloudHighlighter = new PointCloudHighlighter()
        this.stickMaterial = new THREE.MeshPhongMaterial({ color: appleCrayonColorThreeJS('aluminum') })
        this.stickMaterial.side = THREE.DoubleSide
        this.deemphasizedColor = appleCrayonColorThreeJS('magnesium')
        this.isStickVisible = true
        this.pointSizeBoundRadiusPercentage = undefined
        this.pointOpacity = 0.375

        // ScaleBarService — owned here alongside Gnomon and GroundPlane
        this.scaleBarService = null

        const saved = SettingsManager.load()

        register(
            document.querySelector(`div[data-colorpicker='groundplane']`),
            saved?.groundPlane ? new THREE.Color(saved.groundPlane.r, saved.groundPlane.g, saved.groundPlane.b) : appleCrayonColorThreeJS('iron'),
            () => this.getGroundPlane()?.color ?? appleCrayonColorThreeJS('iron'),
            color => this.getGroundPlane()?.setColor(color)
        )

        register(
            document.querySelector(`div[data-colorpicker='gnomon']`),
            saved?.gnomon ? new THREE.Color(saved.gnomon.r, saved.gnomon.g, saved.gnomon.b) : appleCrayonColorThreeJS('iron'),
            () => this.getGnomon()?.color ?? appleCrayonColorThreeJS('iron'),
            color => this.getGnomon()?.setColor(color)
        )

        SpacewalkEventBus.globalBus.subscribe('DidSelectTrace', this);
        SpacewalkEventBus.globalBus.subscribe('DidLeaveGenomicNavigator', this);
    }

    receiveEvent({ type, data }) {

        if ('DidSelectTrace' === type) {
            const { trace } = data
            this.isLoading = true
            try {
                this.setupWithTrace(trace)
            } finally {
                this.isLoading = false
            }

        } else if ('DidLeaveGenomicNavigator' === type) {
            this.delegateLeaveGenomicNavigator()
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

    async ingestEnsemblePath(url, traceKey, ensembleGroupKey) {

        this.isLoading = true

        try {
            await ensembleManager.loadURL(url, traceKey, ensembleGroupKey)

            this.setupWithTrace(ensembleManager.currentTrace)
            this.configureRenderStyle(true === ensembleManager.isPointCloud ? PointCloud.renderStyle : GUIManager.getRenderStyleWidgetState())

            unsetDataMaterialProviderCheckbox(igvPanel)
            setMaterialProvider(this.colorRampMaterialProvider)

            if (ensembleManager.genomeAssembly !== igvPanel.browser.genome.id) {
                console.log(`Genome swap from ${ igvPanel.browser.genome.id } to ${ ensembleManager.genomeAssembly }. Call igv_browser.loadGenome`)
                await igvPanel.browser.loadGenome(ensembleManager.genomeAssembly)
            }

            await igvPanel.locusDidChange(ensembleManager.locus)
        } catch (error) {
            console.error('Error loading ensemble:', error)
            this.purgeScene()
            throw error
        } finally {
            this.isLoading = false
        }

    }

    async ingestEnsembleGroup(ensembleGroupKey) {

        this.isLoading = true

        try {
            await ensembleManager.loadEnsembleGroup(ensembleGroupKey)

            this.setupWithTrace(ensembleManager.currentTrace)
            this.configureRenderStyle(true === ensembleManager.isPointCloud ? PointCloud.renderStyle : GUIManager.getRenderStyleWidgetState())

            unsetDataMaterialProviderCheckbox(igvPanel)
            setMaterialProvider(this.colorRampMaterialProvider)

            await igvPanel.locusDidChange(ensembleManager.locus)
        } catch (error) {
            console.error('Error loading ensemble group:', error)
            this.purgeScene()
            throw error
        } finally {
            this.isLoading = false
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
                isStickVisible: this.isStickVisible
            })
            this.ballAndStick.addToScene(scene)
        }

        scene.background = this.background;

        const {min, max, center, radius} = EnsembleManager.getTraceBounds(trace);
        const {position, fov} = getCameraPoseAlongAxis({ center, radius, axis: '+z', scaleFactor: 1e1 })

        const boundingDiameter = (2 * radius)

        const { width, height } = getThreeJSContainerRect();
        cameraLightingRig.configure(fov, width/height, position, center, boundingDiameter)

        scene.add(createHemisphereLight())

        // Apply saved settings if available
        const saved = SettingsManager.load()

        // GroundPlane
        const groundPlaneConfig =
            {
            size: boundingDiameter,
            divisions: 16,
            position: new THREE.Vector3(center.x, min.y, center.z),
            color: saved?.groundPlane ? new THREE.Color(saved.groundPlane.r, saved.groundPlane.g, saved.groundPlane.b) : appleCrayonColorThreeJS('iron'),
            opacity: 0.25,
            isHidden: saved?.groundPlane ? !saved.groundPlane.visible : GroundPlane.setGroundPlaneHidden()
            };

        const groundPlane = new GroundPlane(groundPlaneConfig)
        scene.add(groundPlane)
        updateSwatch(document.querySelector(`div[data-colorpicker='groundplane']`), groundPlaneConfig.color)

        // Gnomon
        const gnomonConfig =
            {
                min,
                max,
                boundingDiameter,
                color: saved?.gnomon ? new THREE.Color(saved.gnomon.r, saved.gnomon.g, saved.gnomon.b) : appleCrayonColorThreeJS('iron'),
                isHidden: saved?.gnomon ? !saved.gnomon.visible : Gnomon.setGnomonHidden()
            };
        const gnomon = new Gnomon(gnomonConfig)
        gnomon.addToScene(scene)
        updateSwatch(document.querySelector(`div[data-colorpicker='gnomon']`), gnomonConfig.color)

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

    getHemisphereLight(){
        return scene.getObjectByName('hemisphereLight')
    }

    initializeScaleBarService(renderContainer) {
        const saved = SettingsManager.load()
        const scaleBarsHidden = saved?.scaleBars ? !saved.scaleBars.visible : ScaleBarService.setScaleBarsHidden()
        const scaleBarsColor = saved?.scaleBars ? new THREE.Color(saved.scaleBars.r, saved.scaleBars.g, saved.scaleBars.b) : undefined
        this.scaleBarService = new ScaleBarService(renderContainer, scaleBarsHidden, scaleBarsColor)
        this.scaleBarService.insertScaleBarDOM()
    }

    getScaleBarService() {
        return this.scaleBarService
    }

    getGnomon(){
        return scene.getObjectByName('gnomon')
    }

    getGroundPlane(){
        return scene.getObjectByName('groundplane')
    }

    toJSON() {
        const { r, g, b } = scene.background
        return  { r, g, b }
    }

    isGood2Go() {
        return !this.isLoading && scene && this.getGnomon() && this.getGroundPlane()
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

        // Dispose named objects BEFORE clearScene removes them from the scene
        const gnomonInstance = this.getGnomon()
        if (gnomonInstance) {
            gnomonInstance.dispose()
        }

        const groundPlaneInstance = this.getGroundPlane()
        if (groundPlaneInstance) {
            groundPlaneInstance.dispose()
        }

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

function createHemisphereLight() {
    // Update due to r155 changes to illumination: Multiply light intensities by PI to get same brightness as previous threejs release.
    // See: https://discourse.threejs.org/t/updates-to-lighting-in-three-js-r155/53733
    const light = new THREE.HemisphereLight( appleCrayonColorThreeJS('snow'), appleCrayonColorThreeJS('tin'), Math.PI )
    light.name = 'hemisphereLight'
    return light
}


export default SceneManager;
