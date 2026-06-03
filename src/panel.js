import SpacewalkEventBus from './spacewalkEventBus.js'
import {configureDrag} from "./utils/draggable.js"

const zIndexPanelSelected = 1124;
const zIndexPanelUnselected = 1024;
const NAVBAR_BUFFER_PX = 8;

const panelDictionary = {}

class Panel {

    constructor({ container, panel, isHidden, xFunction, yFunction, dragSurface, dragOptions }) {

        this.container = container

        this.panel = panel

        this.isHidden = isHidden

        this.xFunction = xFunction
        this.yFunction = yFunction

        const dragHandle = panel.querySelector('.spacewalk_card_drag_container')
        const dragTarget = dragSurface || dragHandle

        configureDrag(panel, dragTarget, container, {
            topConstraint: document.querySelector('.navbar'),
            ...(dragOptions || {}),
            // Re-derive this panel's top/left percentages once its own drag ends.
            // Per-panel callback replaces the former global DidEndDrag broadcast +
            // id-filter — each panel only ever cared about its own drag.
            onDragEnd: () => this.setTopLeftPercentages(true)
        })

        dragHandle.addEventListener(`mousedown`, (event) => {
            event.preventDefault();
            SpacewalkEventBus.globalBus.post({ type: "DidSelectPanel", data: this.getClassName() });
        });

        const closer = dragHandle.querySelector('.fa-times-circle');
        closer.addEventListener('click', (event) => {
            event.stopPropagation();
            event.preventDefault();
            this.dismiss();
        });

        SpacewalkEventBus.globalBus.subscribe('DidSelectPanel', this)
    }

    receiveEvent({ type, data }) {

        if ('DidSelectPanel' === type) {
            this.panel.style.zIndex = this.getClassName() === data ? zIndexPanelSelected : zIndexPanelUnselected;
        }
    }

    getClassName(){ return 'Panel' }

    setTopLeftPercentages(isInitialized) {

        const { width, height } = this.container.getBoundingClientRect();
        let { left: leftPanel, top: topPanel, width: widthPanel, height: heightPanel } = this.panel.getBoundingClientRect();

        if (!isInitialized) {
            leftPanel = this.xFunction(width,   widthPanel);
            topPanel = this.yFunction(height, heightPanel);
        }

        this.leftPercent = leftPanel / width;
        this.topPercent = topPanel / height;

    }

    getOffset() {
        const { width, height } = this.container.getBoundingClientRect();

        if (undefined === this.leftPercent && undefined === this.topPercent) {
            this.setTopLeftPercentages(false);
        }
        const left = Math.floor(this.leftPercent * width);
        const navbar = document.querySelector('.navbar');
        const navbarHeight = navbar ? navbar.getBoundingClientRect().height : 0;
        const top = Math.max(navbarHeight + NAVBAR_BUFFER_PX, Math.floor(this.topPercent * height));
        return { top, left };
    }

    dismiss() {

        this.isHidden = true;
        this.panel.style.left = '-1000px';
        this.panel.style.top = '-1000px';

        const id = this.panel.getAttribute('id');
        const selection = document.querySelector(`input[data-target='${id}']`);
        if (selection) {
            selection.checked = false;
        }
    }

    present() {

        if (this.isHidden) {
            const offset = this.getOffset();
            this.panel.style.left = `${offset.left}px`;
            this.panel.style.top = `${offset.top}px`;
            this.isHidden = false;
        }

        const id = this.panel.getAttribute('id');
        const selection = document.querySelector(`input[data-target='${id}']`);
        if (selection) {
            selection.checked = true;
        }
    }

    static setPanelDictionary(panels) {
        for (let panel of panels) {
            panelDictionary[ panel.getClassName() ] = panel
        }
    }

    static toggleById(panelId) {
        for (const panel of Object.values(panelDictionary)) {
            if (panel.panel.getAttribute('id') === panelId) {
                panel.isHidden ? panel.present() : panel.dismiss()
                return
            }
        }
    }

    static setState(panelVisibility) {

        for (let [key, value] of Object.entries( panelDictionary )) {

            if ('visible' === panelVisibility[ key ]) {
                value.present();
            } else {
                value.dismiss();
            }

        }

    }

    static toJSON() {

        const json = {}
        for (let [key, value] of Object.entries( panelDictionary )) {
            json[ key ] = true === value.isHidden ? 'hidden' : 'visible'
        }

        return json
    }
}

function doInspectPanelVisibilityCheckbox(panelID) {
    const selection = document.querySelector(`input[data-target='${panelID}']`);
    return !(selection && selection.checked);
}

export { doInspectPanelVisibilityCheckbox }
export default Panel;
