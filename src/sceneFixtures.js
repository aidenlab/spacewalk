import * as THREE from 'three'
import GroundPlane from './groundPlane.js'
import Gnomon from './gnomon.js'
import { appleCrayonColorThreeJS } from './utils/colorUtils.js'
import { register, updateSwatch } from './utils/sharedColorPicker.js'

/**
 * Owns the per-trace scene fixtures: HemisphereLight, GroundPlane, Gnomon.
 * Registers their color pickers once at construction; builds/disposes the
 * scene objects per trace via setupForBounds / dispose. Their colors and
 * visibility come from, and follow, the viewer settings.
 */
class SceneFixtures {

    constructor(scene, viewerSettings) {
        this.scene = scene
        this.viewerSettings = viewerSettings

        const { groundPlane, gnomon } = viewerSettings.get()

        register(
            groundPlaneSwatch(),
            colorOf(groundPlane),
            () => colorOf(viewerSettings.get().groundPlane),
            ({ r, g, b }) => viewerSettings.update({ groundPlane: { r, g, b } })
        )

        register(
            gnomonSwatch(),
            colorOf(gnomon),
            () => colorOf(viewerSettings.get().gnomon),
            ({ r, g, b }) => viewerSettings.update({ gnomon: { r, g, b } })
        )

        viewerSettings.subscribe(values => this.apply(values))
    }

    // Repaint the live fixtures (if a trace has built them) and their swatches
    apply({ groundPlane, gnomon }) {

        const groundPlaneInstance = this.getGroundPlane()
        if (groundPlaneInstance) {
            groundPlaneInstance.setColor(colorOf(groundPlane))
            groundPlaneInstance.setVisibility(groundPlane.visible ? 'visible' : 'hidden')
        }
        updateSwatch(groundPlaneSwatch(), colorOf(groundPlane))

        const gnomonInstance = this.getGnomon()
        if (gnomonInstance) {
            gnomonInstance.setColor(colorOf(gnomon))
            gnomonInstance.setVisibility(gnomon.visible ? 'visible' : 'hidden')
        }
        updateSwatch(gnomonSwatch(), colorOf(gnomon))
    }

    setupForBounds({ min, max, center, boundingDiameter }) {
        this.scene.add(createHemisphereLight())

        const settings = this.viewerSettings.get()

        const groundPlaneConfig = {
            size: boundingDiameter,
            divisions: 16,
            position: new THREE.Vector3(center.x, min.y, center.z),
            color: colorOf(settings.groundPlane),
            opacity: 0.25,
            isHidden: !settings.groundPlane.visible
        }
        this.scene.add(new GroundPlane(groundPlaneConfig))

        const gnomonConfig = {
            min,
            max,
            boundingDiameter,
            color: colorOf(settings.gnomon),
            isHidden: !settings.gnomon.visible
        }
        const gnomon = new Gnomon(gnomonConfig)
        gnomon.addToScene(this.scene)
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

function colorOf({ r, g, b }) {
    return new THREE.Color(r, g, b)
}

function groundPlaneSwatch() {
    return document.querySelector(`div[data-colorpicker='groundplane']`)
}

function gnomonSwatch() {
    return document.querySelector(`div[data-colorpicker='gnomon']`)
}

function createHemisphereLight() {
    // Update due to r155 changes to illumination: Multiply light intensities by PI to get same brightness as previous threejs release.
    // See: https://discourse.threejs.org/t/updates-to-lighting-in-three-js-r155/53733
    const light = new THREE.HemisphereLight(appleCrayonColorThreeJS('snow'), appleCrayonColorThreeJS('tin'), Math.PI)
    light.name = 'hemisphereLight'
    return light
}

export default SceneFixtures
