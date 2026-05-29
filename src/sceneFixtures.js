import * as THREE from 'three'
import GroundPlane from './groundPlane.js'
import Gnomon from './gnomon.js'
import { appleCrayonColorThreeJS } from './utils/colorUtils.js'
import { register, updateSwatch } from './utils/sharedColorPicker.js'
import SettingsManager from './settingsManager.js'

/**
 * Owns the per-trace scene fixtures: HemisphereLight, GroundPlane, Gnomon.
 * Registers their color pickers once at construction; builds/disposes the
 * scene objects per trace via setupForBounds / dispose.
 */
class SceneFixtures {

    constructor(scene) {
        this.scene = scene

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
    }

    setupForBounds({ min, max, center, boundingDiameter }) {
        this.scene.add(createHemisphereLight())

        const saved = SettingsManager.load()

        const groundPlaneConfig = {
            size: boundingDiameter,
            divisions: 16,
            position: new THREE.Vector3(center.x, min.y, center.z),
            color: saved?.groundPlane ? new THREE.Color(saved.groundPlane.r, saved.groundPlane.g, saved.groundPlane.b) : appleCrayonColorThreeJS('iron'),
            opacity: 0.25,
            isHidden: saved?.groundPlane ? !saved.groundPlane.visible : GroundPlane.setGroundPlaneHidden()
        }
        const groundPlane = new GroundPlane(groundPlaneConfig)
        this.scene.add(groundPlane)
        updateSwatch(document.querySelector(`div[data-colorpicker='groundplane']`), groundPlaneConfig.color)

        const gnomonConfig = {
            min,
            max,
            boundingDiameter,
            color: saved?.gnomon ? new THREE.Color(saved.gnomon.r, saved.gnomon.g, saved.gnomon.b) : appleCrayonColorThreeJS('iron'),
            isHidden: saved?.gnomon ? !saved.gnomon.visible : Gnomon.setGnomonHidden()
        }
        const gnomon = new Gnomon(gnomonConfig)
        gnomon.addToScene(this.scene)
        updateSwatch(document.querySelector(`div[data-colorpicker='gnomon']`), gnomonConfig.color)
    }

    dispose() {
        // HemisphereLight is removed by SceneManager.purgeScene's clearScene call.
        // GroundPlane and Gnomon need explicit dispose before that.
        const gnomonInstance = this.getGnomon()
        if (gnomonInstance) {
            gnomonInstance.dispose()
        }

        const groundPlaneInstance = this.getGroundPlane()
        if (groundPlaneInstance) {
            groundPlaneInstance.dispose()
        }
    }

    getHemisphereLight() {
        return this.scene.getObjectByName('hemisphereLight')
    }

    getGnomon() {
        return this.scene.getObjectByName('gnomon')
    }

    getGroundPlane() {
        return this.scene.getObjectByName('groundplane')
    }
}

function createHemisphereLight() {
    // Update due to r155 changes to illumination: Multiply light intensities by PI to get same brightness as previous threejs release.
    // See: https://discourse.threejs.org/t/updates-to-lighting-in-three-js-r155/53733
    const light = new THREE.HemisphereLight(appleCrayonColorThreeJS('snow'), appleCrayonColorThreeJS('tin'), Math.PI)
    light.name = 'hemisphereLight'
    return light
}

export default SceneFixtures
