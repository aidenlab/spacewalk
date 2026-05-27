import { scene, scaleBarService, sceneFixtures } from './app.js'

const STORAGE_KEY = 'spacewalk-settings'

class SettingsManager {

    constructor() {

        // Prevent dropdown from closing when clicking inside it
        document.getElementById('spacewalk-settings-dropdown').addEventListener('click', (e) => {
            e.stopPropagation()
        })

        // Ground Plane toggle
        document.getElementById('spacewalk_ui_manager_groundplane').addEventListener('change', e => {
            e.stopPropagation()
            sceneFixtures.getGroundPlane().toggle()
            this.save()
        })

        // Gnomon toggle
        document.getElementById('spacewalk_ui_manager_gnomon').addEventListener('change', e => {
            e.stopPropagation()
            sceneFixtures.getGnomon().toggle()
            this.save()
        })

        // Scale Bars toggle
        document.getElementById('spacewalk_ui_manager_scale_bars').addEventListener('change', e => {
            e.stopPropagation()
            scaleBarService.toggle()
            this.save()
        })

        // Reference Ruler toggle
        document.getElementById('spacewalk_ui_manager_reference_ruler').addEventListener('change', e => {
            e.stopPropagation()
            scaleBarService.toggleReferenceRuler()
            this.save()
        })

        // Apply saved settings to checkboxes
        const saved = SettingsManager.load()
        if (saved) {
            document.getElementById('spacewalk_ui_manager_gnomon').checked = saved.gnomon.visible
            document.getElementById('spacewalk_ui_manager_groundplane').checked = saved.groundPlane.visible
            document.getElementById('spacewalk_ui_manager_scale_bars').checked = saved.scaleBars.visible
            if (saved.referenceRuler) {
                document.getElementById('spacewalk_ui_manager_reference_ruler').checked = saved.referenceRuler.visible
            }
        }

        // Save settings when any color picker changes
        document.addEventListener('spacewalk-settings-changed', () => this.save())
    }

    save() {
        const settings = {}

        // Background color from scene
        if (scene && scene.background) {
            const { r, g, b } = scene.background
            settings.background = { r, g, b }
        }

        // Gnomon
        const gnomon = sceneFixtures.getGnomon()
        if (gnomon) {
            const { r, g, b } = gnomon.color
            settings.gnomon = { visible: gnomon.group.visible, r, g, b }
        }

        // Ground Plane
        const groundPlane = sceneFixtures.getGroundPlane()
        if (groundPlane) {
            const { r, g, b } = groundPlane.color
            settings.groundPlane = { visible: groundPlane.visible, r, g, b }
        }

        // Scale Bars
        if (scaleBarService) {
            const { r, g, b } = scaleBarService.color
            settings.scaleBars = { visible: scaleBarService.visible, r, g, b }

            const refColor = scaleBarService.referenceRulerColor
            settings.referenceRuler = { visible: scaleBarService.referenceRulerVisible, r: refColor.r, g: refColor.g, b: refColor.b }
        }

        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    }

    static load() {
        const json = localStorage.getItem(STORAGE_KEY)
        return json ? JSON.parse(json) : null
    }
}

export default SettingsManager
