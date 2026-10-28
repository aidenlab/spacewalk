// The settings overlay floats under the toolbar's ⚙, which presents and dismisses it.
class SettingsOverlay {

    constructor({ toggle, overlay }) {
        this.toggle = toggle
        this.overlay = overlay
        toggle.addEventListener('click', () => this.setPresented(!this.isPresented()))
    }

    isPresented() {
        return 'none' !== this.overlay.style.display
    }

    setPresented(presented) {
        this.overlay.style.display = presented ? 'block' : 'none'
        this.toggle.setAttribute('aria-expanded', String(presented))
    }
}

export default SettingsOverlay
