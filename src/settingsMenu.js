// The settings dropdown's visibility checkboxes. They write to the viewer settings and
// follow them, so a change from anywhere shows here.
class SettingsMenu {

    constructor(viewerSettings) {

        // Prevent dropdown from closing when clicking inside it
        document.getElementById('spacewalk-settings-dropdown').addEventListener('click', (e) => {
            e.stopPropagation()
        })

        this.checkboxes = {
            gnomon: document.getElementById('spacewalk_ui_manager_gnomon'),
            groundPlane: document.getElementById('spacewalk_ui_manager_groundplane'),
            referenceRuler: document.getElementById('spacewalk_ui_manager_reference_ruler'),
        }

        for (const [ key, input ] of Object.entries(this.checkboxes)) {
            input.addEventListener('change', e => {
                e.stopPropagation()
                viewerSettings.update({ [key]: { visible: input.checked } })
            })
        }

        this.apply(viewerSettings.get())
        viewerSettings.subscribe(values => this.apply(values))
    }

    apply(values) {
        for (const [ key, input ] of Object.entries(this.checkboxes)) {
            input.checked = values[key].visible
        }
    }
}

export default SettingsMenu
