import Picker from "vanilla-picker"
import { threeJSColorToRGB255, rgb255String, rgb255ToThreeJSColor } from "./colorUtils.js"

let picker = null

function ensurePicker() {
    if (!picker) {
        picker = new Picker({
            popup: 'left',
            editor: false,
            editorFormat: 'rgb',
            alpha: false,
            color: [128, 128, 128, 1]
        })
    }
    return picker
}

function register(container, initialColor, getColor, setColor) {

    // Set initial swatch color
    const rgb = threeJSColorToRGB255(initialColor)
    container.style.backgroundColor = rgb255String(rgb)

    container.addEventListener('click', (e) => {

        e.stopPropagation()

        const p = ensurePicker()

        const currentRGB = threeJSColorToRGB255(getColor())

        p.onChange = ({ rgbString }) => {

            container.style.backgroundColor = rgbString

            const [head, g, tail] = rgbString.split(',')
            const [, r] = head.split('(')
            const [b] = tail.split(')')

            setColor(rgb255ToThreeJSColor(parseInt(r), parseInt(g), parseInt(b)))

            document.dispatchEvent(new Event('spacewalk-settings-changed'))
        }

        p.movePopup({ parent: container, color: [currentRGB.r, currentRGB.g, currentRGB.b, 1] }, true)
    })
}

function updateSwatch(container, threeJSColor) {
    const rgb = threeJSColorToRGB255(threeJSColor)
    container.style.backgroundColor = rgb255String(rgb)
}

export { register, updateSwatch }
