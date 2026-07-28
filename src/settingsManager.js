const STORAGE_KEY = 'spacewalk-settings'

class SettingsManager {

    constructor({ scene, scaleBarService, referenceRuler, sceneFixtures }) {

        this.scene = scene
        this.scaleBarService = scaleBarService
        this.referenceRuler = referenceRuler
        this.sceneFixtures = sceneFixtures

        // Prevent dropdown from closing when clicking inside it
        document.getElementById('spacewalk-settings-dropdown').addEventListener('click', (e) => {
            e.stopPropagation()
        })

        // Ground Plane toggle
        document.getElementById('spacewalk_ui_manager_groundplane').addEventListener('change', e => {
            e.stopPropagation()
            this.sceneFixtures.getGroundPlane().toggle()
            this.save()
        })

        // Gnomon toggle
        document.getElementById('spacewalk_ui_manager_gnomon').addEventListener('change', e => {
            e.stopPropagation()
            this.sceneFixtures.getGnomon().toggle()
            this.save()
        })

        // Scale Bars toggle
        document.getElementById('spacewalk_ui_manager_scale_bars').addEventListener('change', e => {
            e.stopPropagation()
            this.scaleBarService.toggle()
            this.save()
        })

        // Reference Ruler toggle
        document.getElementById('spacewalk_ui_manager_reference_ruler').addEventListener('change', e => {
            e.stopPropagation()
            this.referenceRuler.toggle()
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
        if (this.scene && this.scene.background) {
            const { r, g, b } = this.scene.background
            settings.background = { r, g, b }
        }

        // Gnomon
        const gnomon = this.sceneFixtures.getGnomon()
        if (gnomon) {
            const { r, g, b } = gnomon.color
            settings.gnomon = { visible: gnomon.group.visible, r, g, b }
        }

        // Ground Plane
        const groundPlane = this.sceneFixtures.getGroundPlane()
        if (groundPlane) {
            const { r, g, b } = groundPlane.color
            settings.groundPlane = { visible: groundPlane.visible, r, g, b }
        }

        // Scale Bars
        if (this.scaleBarService) {
            const { r, g, b } = this.scaleBarService.color
            settings.scaleBars = { visible: this.scaleBarService.visible, r, g, b }
        }

        // Reference Ruler
        if (this.referenceRuler) {
            const { r, g, b } = this.referenceRuler.color
            settings.referenceRuler = { visible: this.referenceRuler.visible, r, g, b }
        }

        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    }

    static load() {
        const json = localStorage.getItem(STORAGE_KEY)
        return json ? JSON.parse(json) : null
    }
}

export default SettingsManager
