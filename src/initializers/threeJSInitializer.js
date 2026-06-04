import * as THREE from "three"
import CameraLightingRig from "../cameraLightingRig.js"
import Picker from "../picker.js"
import SceneManager from "../sceneManager.js"
import SceneFixtures from "../sceneFixtures.js"
import { appleCrayonColorThreeJS } from "../utils/colorUtils.js"
import { register } from "../utils/sharedColorPicker.js"
import SettingsManager from "../settingsManager.js"
import { getMouseXY } from '../utils/utils.js'

/**
 * Initializer class responsible for setting up the Three.js scene, camera, renderer,
 * and SceneManager. Visualization objects (BallAndStick, PointCloud, Ribbon) are now
 * created transiently by SceneManager when a trace is loaded.
 */
class ThreeJSInitializer {
    constructor(container) {
        this.container = container;
        this.mouseX = null;
        this.mouseY = null;
    }

    /**
     * Initialize Three.js core objects and return them
     * @param {Object} colorRampMaterialProvider - The color ramp material provider
     * @returns {Object} Object containing all initialized Three.js objects
     */
    initialize({ colorRampMaterialProvider, ensembleManager }) {
        const threeJSObjects = {};

        threeJSObjects.picker = new Picker(new THREE.Raycaster());

        // Configure Three.js color management
        THREE.ColorManagement.enabled = true;

        // Create and configure renderer
        threeJSObjects.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        threeJSObjects.renderer.outputColorSpace = THREE.SRGBColorSpace;
        threeJSObjects.renderer.setPixelRatio(window.devicePixelRatio);

        const { width, height } = this.container.getBoundingClientRect();
        threeJSObjects.renderer.setSize(width, height);

        this.container.appendChild(threeJSObjects.renderer.domElement);

        // Pointer tracking for the raycast picker. The picker runs every render
        // frame, so coordinates must reflect ONLY the canvas: while the pointer is
        // over a 1D producer (navigator / IGV / Juicebox) it is not over the canvas
        // (none are descendants of this container), so mouseleave fires, the coords
        // go null, and Picker.intersect() no-ops — no stand-down flag needed.
        this.container.addEventListener('mousemove', event => {
            const { x, y } = getMouseXY(threeJSObjects.renderer.domElement, event);
            this.mouseX = (x / threeJSObjects.renderer.domElement.clientWidth) * 2 - 1;
            this.mouseY = -(y / threeJSObjects.renderer.domElement.clientHeight) * 2 + 1;
        });

        this.container.addEventListener('mouseleave', () => {
            this.mouseX = null;
            this.mouseY = null;
            threeJSObjects.picker.onPointerLeftCanvas();
        });

        // Create scene
        threeJSObjects.scene = new THREE.Scene();
        const savedSettings = SettingsManager.load()
        if (savedSettings?.background) {
            const { r, g, b } = savedSettings.background
            threeJSObjects.scene.background = new THREE.Color(r, g, b)
        } else {
            threeJSObjects.scene.background = appleCrayonColorThreeJS('snow')
        }

        // Create camera
        const fov = 35;
        const near = 1e2;
        const far = 3e3;
        const aspect = width / height;
        threeJSObjects.camera = new THREE.PerspectiveCamera(fov, aspect, near, far);

        // Create camera lighting rig
        threeJSObjects.cameraLightingRig = new CameraLightingRig(
            threeJSObjects.renderer.domElement,
            threeJSObjects.camera
        );

        // Set initial camera position
        const position = new THREE.Vector3(134820, 55968, 5715);
        const centroid = new THREE.Vector3(133394, 54542, 4288);
        threeJSObjects.cameraLightingRig.setPose(position, centroid);

        // Create scene fixtures (registers Gnomon + GroundPlane color pickers)
        threeJSObjects.sceneFixtures = new SceneFixtures(threeJSObjects.scene);

        // Create SceneManager last — depends on scene, ensembleManager,
        // cameraLightingRig, and sceneFixtures
        threeJSObjects.sceneManager = new SceneManager({
            colorRampMaterialProvider,
            scene: threeJSObjects.scene,
            ensembleManager,
            cameraLightingRig: threeJSObjects.cameraLightingRig,
            sceneFixtures: threeJSObjects.sceneFixtures
        });

        // Set up background color picker
        const backgroundContainer = document.querySelector(`div[data-colorpicker='background']`)
        register(
            backgroundContainer,
            threeJSObjects.scene.background,
            () => threeJSObjects.scene.background,
            color => {
                threeJSObjects.scene.background = new THREE.Color(color);
                threeJSObjects.renderer.render(threeJSObjects.scene, threeJSObjects.camera);
            }
        )

        return threeJSObjects;
    }

    getMouseCoordinates() {
        return { x: this.mouseX, y: this.mouseY };
    }
}

export default ThreeJSInitializer;
