import SpacewalkEventBus from './spacewalkEventBus.js'
import { StringUtils } from 'igv-utils'
import Ribbon from "./ribbon.js";
import BallAndStick from "./ballAndStick.js";
import { sceneManager, ensembleManager, colorMapManager } from "./app.js";
import Panel from "./panel.js";
import { spacewalkConfig } from "../spacewalk-config.js";

class GUIManager {

    constructor ({ settingsButton, panel }) {

        // Present/Dismiss Settings Panel via Settings Button
        settingsButton.addEventListener('click', (e) => {
            e.stopPropagation();
            panel.style.display = 'none' === panel.style.display ? 'block' : 'none'
        })

        // Dismiss Settings Panel by "clicking away"
        document.getElementById('spacewalk-root-container').addEventListener('click', (e) => {
            if (e.target === e.currentTarget){
                panel.style.display = 'none'
            }
        })

        // panel.addEventListener('click', (e) => e.stopPropagation());
        // panel.addEventListener('mousemove', (e) => e.stopPropagation());

        const checkboxDropdownMenu = document.querySelector('#spacewalk-viewers-dropdown-menu')

        for (const inputElement of checkboxDropdownMenu.querySelectorAll('input')) {

            inputElement.addEventListener('change', event => {
                event.stopPropagation()
                Panel.toggleById(inputElement.dataset.target)
            })

        }

        configureRenderStyleControl(document.getElementById('spacewalk-render-style-ball-stick'), BallAndStick.renderStyle);

        configureRenderStyleControl(document.getElementById('spacewalk-render-style-ribbon'), Ribbon.renderStyle);

        // Ball radius
        const ballRadiusControl = document.getElementById('spacewalk-ball-radius-control');
        ballRadiusControl.querySelector('i.fa-minus-circle').addEventListener('click', () => sceneManager.ballAndStick?.updateBallRadius(-1));
        ballRadiusControl.querySelector('i.fa-plus-circle').addEventListener('click', () => sceneManager.ballAndStick?.updateBallRadius(1));

        // Stick visibility switch
        const stickVisibilitySwitch = document.getElementById('spacewalk-stick-visibility-switch');
        if (stickVisibilitySwitch) {
            stickVisibilitySwitch.addEventListener('change', (e) => {
                e.stopPropagation();
                console.log('Stick visibility toggled:', e.target.checked);
                sceneManager.ballAndStick?.setStickVisibility(e.target.checked);
            });
        }

        // Circular geometry switch
        const circularSwitch = document.getElementById('spacewalk-circular-geometry-switch');
        if (circularSwitch) {
            circularSwitch.checked = spacewalkConfig.isCircular === true;
            circularSwitch.addEventListener('change', (e) => {
                e.stopPropagation();
                spacewalkConfig.isCircular = e.target.checked;
                sceneManager.rebuildTraceGeometry();
            });
        }

        // Color ramp dropdown
        this.configureColorMapControl();

        // PointCloud Point Size
        const pointSizeControl = document.getElementById('spacewalk_ui_manager_pointcloud_point_size');
        pointSizeControl.querySelector('i.fa-minus-circle').addEventListener('click', () => sceneManager.pointCloud?.updatePointSize(-1));
        pointSizeControl.querySelector('i.fa-plus-circle').addEventListener('click', () => sceneManager.pointCloud?.updatePointSize(1));

        // PointCloud Point Transparency
        const pointTransparencyControl = document.getElementById('spacewalk_ui_manager_pointcloud_point_transparency');
        pointTransparencyControl.querySelector('i.fa-minus-circle').addEventListener('click', () => sceneManager.pointCloud?.updatePointTransparency(-1));
        pointTransparencyControl.querySelector('i.fa-plus-circle').addEventListener('click', () => sceneManager.pointCloud?.updatePointTransparency(1));

        SpacewalkEventBus.globalBus.subscribe('DidLoadEnsembleFile', this);
        SpacewalkEventBus.globalBus.subscribe('DidChangeColorMap', this);

    }

    configureColorMapControl() {

        if (!colorMapManager) return

        const button = document.getElementById('spacewalk-color-map-button')
        const menu = document.getElementById('spacewalk-color-map-menu')
        if (!button || !menu) return

        const maps = colorMapManager.listColorMaps()

        menu.replaceChildren()
        for (const { id, displayName, swatchDataURL } of maps) {
            const li = document.createElement('li')
            const item = document.createElement('button')
            item.type = 'button'
            item.className = 'dropdown-item spacewalk-color-map-item'
            item.dataset.colorMapId = id

            const img = document.createElement('img')
            img.className = 'spacewalk-color-map-swatch'
            img.src = swatchDataURL
            img.alt = displayName

            const label = document.createElement('span')
            label.className = 'spacewalk-color-map-label'
            label.textContent = displayName

            item.append(img, label)
            item.addEventListener('click', (e) => {
                e.stopPropagation()
                colorMapManager.setActiveColorMapName(id)
            })

            li.appendChild(item)
            menu.appendChild(li)
        }

        this.updateColorMapButton(colorMapManager.getActiveColorMapName())
    }

    updateColorMapButton(activeId) {
        const button = document.getElementById('spacewalk-color-map-button')
        if (!button || !colorMapManager) return

        const img = button.querySelector('img.spacewalk-color-map-swatch')
        const match = colorMapManager.listColorMaps().find(({ id }) => id === activeId)
        if (!match || !img) return

        img.src = match.swatchDataURL
        img.alt = match.displayName
        button.title = match.displayName
    }

    receiveEvent({ type, data }) {

        if ('DidLoadEnsembleFile' === type) {

            let str;

            const { sample, genomeAssembly, chr, genomicStart, genomicEnd } = data;

            document.getElementById('spacewalk_info_panel_genome').textContent = genomeAssembly;

            str = `${chr} : ${StringUtils.numberFormatter(genomicStart)} - ${StringUtils.numberFormatter(genomicEnd)}`;
            document.getElementById('spacewalk_info_panel_locus').textContent = str;

            document.getElementById('spacewalk_info_panel').style.display = 'flex';

            if (ensembleManager.isPointCloud === true) {
                document.getElementById('spacewalk_ui_manager_render_styles').style.display = 'none';
                document.getElementById('spacewalk_ui_manager_pointcloud_render_style').style.display = 'block';
            } else {
                document.getElementById('spacewalk_ui_manager_pointcloud_render_style').style.display = 'none';
                document.getElementById('spacewalk_ui_manager_render_styles').style.display = 'block';
            }

        } else if ('DidChangeColorMap' === type) {
            this.updateColorMapButton(data.name);
        }
    }

    static updateRenderStyleWidgetState(renderStyle) {

        if (renderStyle === Ribbon.renderStyle) {
            const ribbonRadio = document.getElementById('spacewalk-render-style-ribbon');
            if (ribbonRadio) {
                ribbonRadio.checked = true;
            }
        } else if (renderStyle === BallAndStick.renderStyle) {
            const ballStickRadio = document.getElementById('spacewalk-render-style-ball-stick');
            if (ballStickRadio) {
                ballStickRadio.checked = true;
            }
        }
    }

    static getRenderStyleWidgetState() {
        const uiManagerPanel = document.getElementById('spacewalk_ui_manager_panel');
        const checkedInput = uiManagerPanel.querySelector("input[name='spacewalk-render-style']:checked");
        const id = checkedInput ? checkedInput.id : null;

        if (null === id) {
            console.warn(`Spacewalk Render Style Widget - No render style is selected. Will default to ${ BallAndStick.renderStyle }`)
            return BallAndStick.renderStyle
        }

        return id === 'spacewalk-render-style-ball-stick' ? BallAndStick.renderStyle : Ribbon.renderStyle;
    }

}

function configureRenderStyleControl(input, renderStyle) {

    input.value = renderStyle;

    input.addEventListener('change', (e) => {
        e.preventDefault();
        sceneManager.configureRenderStyle(e.target.value)
    });

}

function updateEnsembleGroupDisplay(ensembleGroupKey) {
    const el = document.getElementById('spacewalk_info_panel_ensemble_group');
    el.innerText = ensembleGroupKey;
    el.style.display = 'block';
}

export { updateEnsembleGroupDisplay }
export default GUIManager;
