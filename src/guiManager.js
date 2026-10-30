import SpacewalkEventBus from './spacewalkEventBus.js'
import { StringUtils } from 'igv-utils'
import Ribbon from "./ribbon.js";
import BallAndStick from "./ballAndStick.js";
import { spacewalkConfig } from "./spacewalk-config.js";

class GUIManager {

    constructor ({ settingsButton, panel, sceneManager, ensembleManager, colorMapManager, onHandChange = () => {} }) {

        this.sceneManager = sceneManager
        this.ensembleManager = ensembleManager
        this.colorMapManager = colorMapManager

        // Told of each change made by hand at these controls (see viewer.js).
        this.onHandChange = onHandChange
        const didChangeAppearance = () => onHandChange({ type: 'structure-appearance' })

        this.panel = panel

        // settingsButton is the ☰'s container; aria-expanded belongs on the button itself
        this.panelToggle = settingsButton.querySelector('button')

        // Present/Dismiss Settings Panel via Settings Button
        settingsButton.addEventListener('click', (e) => {
            e.stopPropagation();
            this.setPanelPresented(!this.isPanelPresented())
        })

        // Dismiss Settings Panel by "clicking away"
        document.getElementById('spacewalk-root-container').addEventListener('click', (e) => {
            if (e.target === e.currentTarget){
                this.setPanelPresented(false)
            }
        })

        // panel.addEventListener('click', (e) => e.stopPropagation());
        // panel.addEventListener('mousemove', (e) => e.stopPropagation());

        configureRenderStyleControl(document.getElementById('spacewalk-render-style-ball-stick'), BallAndStick.renderStyle, sceneManager, onHandChange);

        configureRenderStyleControl(document.getElementById('spacewalk-render-style-ribbon'), Ribbon.renderStyle, sceneManager, onHandChange);

        // Ball radius
        const ballRadiusControl = document.getElementById('spacewalk-ball-radius-control');
        ballRadiusControl.querySelector('i.fa-minus-circle').addEventListener('click', () => { this.sceneManager.ballAndStick?.updateBallRadius(-1); didChangeAppearance() });
        ballRadiusControl.querySelector('i.fa-plus-circle').addEventListener('click', () => { this.sceneManager.ballAndStick?.updateBallRadius(1); didChangeAppearance() });

        // Stick radius
        const stickRadiusControl = document.getElementById('spacewalk-stick-radius-control');
        stickRadiusControl.querySelector('i.fa-minus-circle').addEventListener('click', () => { this.sceneManager.ballAndStick?.updateStickRadius(-1); didChangeAppearance() });
        stickRadiusControl.querySelector('i.fa-plus-circle').addEventListener('click', () => { this.sceneManager.ballAndStick?.updateStickRadius(1); didChangeAppearance() });

        // Stick visibility switch
        const stickVisibilitySwitch = document.getElementById('spacewalk-stick-visibility-switch');
        if (stickVisibilitySwitch) {
            stickVisibilitySwitch.addEventListener('change', (e) => {
                e.stopPropagation();
                console.log('Stick visibility toggled:', e.target.checked);
                this.sceneManager.setStickVisibility(e.target.checked);
                didChangeAppearance();
            });
        }

        // Circular geometry switch
        const circularSwitch = document.getElementById('spacewalk-circular-geometry-switch');
        if (circularSwitch) {
            circularSwitch.checked = spacewalkConfig.isCircular === true;
            circularSwitch.addEventListener('change', (e) => {
                e.stopPropagation();
                spacewalkConfig.isCircular = e.target.checked;
                this.sceneManager.rebuildTraceGeometry();
                didChangeAppearance();
            });
        }

        // Color ramp dropdown
        this.configureColorMapControl();

        // PointCloud Point Size
        const pointSizeControl = document.getElementById('spacewalk_ui_manager_pointcloud_point_size');
        pointSizeControl.querySelector('i.fa-minus-circle').addEventListener('click', () => { this.sceneManager.pointCloud?.updatePointSize(-1); didChangeAppearance() });
        pointSizeControl.querySelector('i.fa-plus-circle').addEventListener('click', () => { this.sceneManager.pointCloud?.updatePointSize(1); didChangeAppearance() });

        // PointCloud Point Transparency
        const pointTransparencyControl = document.getElementById('spacewalk_ui_manager_pointcloud_point_transparency');
        pointTransparencyControl.querySelector('i.fa-minus-circle').addEventListener('click', () => { this.sceneManager.pointCloud?.updatePointTransparency(-1); didChangeAppearance() });
        pointTransparencyControl.querySelector('i.fa-plus-circle').addEventListener('click', () => { this.sceneManager.pointCloud?.updatePointTransparency(1); didChangeAppearance() });

        SpacewalkEventBus.globalBus.subscribe('DidLoadEnsembleFile', this);
        SpacewalkEventBus.globalBus.subscribe('DidChangeColorMap', this);

    }

    isPanelPresented() {
        return 'none' !== this.panel.style.display
    }

    setPanelPresented(presented) {
        this.panel.style.display = presented ? 'block' : 'none'
        this.panelToggle.setAttribute('aria-expanded', String(presented))
    }

    // A color-ramp menu is open over the panel
    isPanelMenuOpen() {
        return null !== this.panel.querySelector('.dropdown-menu.show')
    }

    configureColorMapControl() {

        if (!this.colorMapManager) return

        const controls = [
            { buttonId: 'spacewalk-color-map-button',    menuId: 'spacewalk-color-map-menu' },
            { buttonId: 'spacewalk-pc-color-map-button', menuId: 'spacewalk-pc-color-map-menu' },
        ]

        const maps = this.colorMapManager.listColorMaps()

        for (const { menuId } of controls) {
            const menu = document.getElementById(menuId)
            if (!menu) continue

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
                    this.colorMapManager.setActiveColorMapName(id)
                    this.onHandChange({ type: 'structure-appearance' })
                })

                li.appendChild(item)
                menu.appendChild(li)
            }
        }

        this.updateColorMapButton(this.colorMapManager.getActiveColorMapName())
    }

    updateColorMapButton(activeId) {
        if (!this.colorMapManager) return

        const match = this.colorMapManager.listColorMaps().find(({ id }) => id === activeId)
        if (!match) return

        for (const buttonId of ['spacewalk-color-map-button', 'spacewalk-pc-color-map-button']) {
            const button = document.getElementById(buttonId)
            if (!button) continue
            const img = button.querySelector('img.spacewalk-color-map-swatch')
            if (!img) continue
            img.src = match.swatchDataURL
            img.alt = match.displayName
            button.title = match.displayName
        }
    }

    receiveEvent({ type, data }) {

        if ('DidLoadEnsembleFile' === type) {

            let str;

            const { sample, genomeAssembly, chr, genomicStart, genomicEnd } = data;

            document.getElementById('spacewalk_info_panel_genome').textContent = genomeAssembly;

            str = `${chr} : ${StringUtils.numberFormatter(genomicStart)} - ${StringUtils.numberFormatter(genomicEnd)}`;
            document.getElementById('spacewalk_info_panel_locus').textContent = str;

            document.getElementById('spacewalk_info_panel').style.display = 'flex';

            if (this.ensembleManager.isPointCloud === true) {
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

    // The two structure-appearance switches; the radius and point controls are
    // steppers with no state of their own, and the color ramp follows DidChangeColorMap.
    static updateStructureAppearanceWidgetState({ sticksVisible, isCircular }) {
        const stickVisibilitySwitch = document.getElementById('spacewalk-stick-visibility-switch');
        if (stickVisibilitySwitch) {
            stickVisibilitySwitch.checked = sticksVisible;
        }
        const circularSwitch = document.getElementById('spacewalk-circular-geometry-switch');
        if (circularSwitch) {
            circularSwitch.checked = isCircular;
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

function configureRenderStyleControl(input, renderStyle, sceneManager, onHandChange) {

    input.value = renderStyle;

    input.addEventListener('change', (e) => {
        e.preventDefault();
        sceneManager.configureRenderStyle(e.target.value)
        onHandChange({ type: 'render-style', style: e.target.value })
    });

}

function updateEnsembleGroupDisplay(ensembleGroupKey) {
    const el = document.getElementById('spacewalk_info_panel_ensemble_group');
    el.innerText = ensembleGroupKey;
    el.style.display = 'block';
}

export { updateEnsembleGroupDisplay }
export default GUIManager;
