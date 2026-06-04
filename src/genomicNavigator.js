import SpacewalkEventBus from './spacewalkEventBus.js'
import {fitToContainer, getMouseXY} from "./utils/utils"
import {appleCrayonColorRGB255, rgb255, rgb255String, threeJSColorToRGB255} from "./utils/colorUtils"

let rgbTexture;
let alphaTexture;

class GenomicNavigator {

    constructor(canvasContainer, highlightColor, ensembleManager, sceneManager, colorRampMaterialProvider) {

        this.ensembleManager = ensembleManager;
        this.sceneManager = sceneManager;
        this.colorRampMaterialProvider = colorRampMaterialProvider;
        this.igvPanel = null;
        this.canvasContainer = canvasContainer

        let canvas

        // highlight canvas
        canvas = canvasContainer.querySelector('#spacewalk_color_ramp_canvas_highlight')
        fitToContainer(canvas)
        this.highlight_ctx = canvas.getContext('2d')

        // color ramp canvas
        canvas = canvasContainer.querySelector('#spacewalk_color_ramp_canvas_rgb')
        fitToContainer(canvas)
        this.rgb_ctx = canvas.getContext('2d')

        canvasContainer.addEventListener('mousemove', event => {
            event.stopPropagation()
            this.onCanvasMouseMove(canvas, event)
        });

        canvasContainer.addEventListener('mouseenter', event => {
            event.stopPropagation()
            SpacewalkEventBus.globalBus.post({ type: 'DidEnterGenomicNavigator', data: 'DidEnterGenomicNavigator' })
        });

        canvasContainer.addEventListener('mouseleave', event => {
            event.stopPropagation()
            this.repaint()
            SpacewalkEventBus.globalBus.post({ type: 'DidLeaveGenomicNavigator', data: 'DidLeaveGenomicNavigator' })
        });

        const { r, g, b } = highlightColor
        this.highlightColor = rgb255String( rgb255(r*255, g*255, b*255) )

        this.header = canvasContainer.querySelector('#spacewalk-trace-navigator-header')
        this.footer = canvasContainer.querySelector('#spacewalk-trace-navigator-footer')

        SpacewalkEventBus.globalBus.subscribe('DidSelectTrace', this);
        SpacewalkEventBus.globalBus.subscribe('DidLoadEnsembleFile', this);
        SpacewalkEventBus.globalBus.subscribe('DidChangeColorMap', this);
    }

    wireDependencies({ igvPanel }) {
        this.igvPanel = igvPanel
    }

    receiveEvent({ type, data }) {

        if ("DidSelectTrace" === type) {
            this.repaint()
        } else if ("DidLoadEnsembleFile" === type) {

            const { genomicStart, genomicEnd } = data

            this.footer.innerText = `${ Math.round(genomicStart / 1e6) }Mb`
            this.header.innerText = `${ Math.round(genomicEnd / 1e6) }Mb`

            this.igvPanel.materialProvider = this.colorRampMaterialProvider;
            this.repaint()
        } else if ("DidChangeColorMap" === type) {
            this.repaint()
        }

    }

    onCanvasMouseMove(canvas, event) {

        if (this.ensembleManager.currentTrace) {

            let { yNormalized } = getMouseXY(canvas, event)
            const interpolantList = [ 1.0 - yNormalized ];

            const interpolantWindowList = this.ensembleManager.getGenomicInterpolantWindowList(interpolantList)

            if (interpolantWindowList) {
                this.sceneManager.highlightController.set(interpolantWindowList.map(({ index }) => index), 'navigator')
            } else {
                this.sceneManager.highlightController.clear('navigator')
            }

        }

    }

    resize(sceneManagerContainer) {
        const { height } = sceneManagerContainer.getBoundingClientRect()

        this.canvasContainer.style.height = `${ height }px`

        fitToContainer(this.highlight_ctx.canvas)
        fitToContainer(this.rgb_ctx.canvas)

        this.repaint()

    }

    /**
     * Render the highlight strip from the shared selection (region indices).
     * Registered with HighlightController; called on every selection change.
     * Maps each index to its genomic extent and skips indices with no extent
     * (gaps in the genomic extent). An empty selection clears the strip.
     */
    renderHighlight(selection) {
        const genomicExtentList = this.ensembleManager.getCurrentGenomicExtentList()
        if (!genomicExtentList) {
            this.paintWithInterpolantWindowList([])
            return
        }
        const windowList = selection.map(index => genomicExtentList[ index ]).filter(Boolean)
        this.paintWithInterpolantWindowList(windowList)
    }

    paintWithInterpolantWindowList(interpolantWindowList) {

        this.highlight_ctx.clearRect(0, 0, this.highlight_ctx.canvas.width, this.highlight_ctx.canvas.height);

        if (interpolantWindowList) {

            this.highlight_ctx.fillStyle = this.highlightColor;

            for (let { start, end } of interpolantWindowList) {

                const h = Math.round((end - start) * this.highlight_ctx.canvas.height);
                const y = Math.round(start * this.highlight_ctx.canvas.height);

                const yy = this.highlight_ctx.canvas.height - (h + y);

                const h_rendered = Math.max(1, h);
                this.highlight_ctx.fillRect(0, yy, this.highlight_ctx.canvas.width, h_rendered);

            }

        }

    }

    repaint() {

        if (undefined === this.ensembleManager.currentTrace) {
            return;
        }

        // repaint color ramp
        this.rgb_ctx.fillStyle = rgb255String( appleCrayonColorRGB255('snow') );
        this.rgb_ctx.fillRect(0, 0, this.rgb_ctx.canvas.width, this.rgb_ctx.canvas.height);

        const genomicExtentList = this.ensembleManager.getCurrentGenomicExtentList()
        for (let { interpolant, start, end } of genomicExtentList) {

            const rgb = this.igvPanel.materialProvider.colorForInterpolant(interpolant)
            const rgb255 = threeJSColorToRGB255(rgb)
            this.rgb_ctx.fillStyle = rgb255String(rgb255)

            const h = Math.ceil((end - start) * this.rgb_ctx.canvas.height);
            const y = Math.round(start * (this.rgb_ctx.canvas.height));

            const yy = Math.max(0, this.rgb_ctx.canvas.height - (h + y));

            this.rgb_ctx.fillRect(0, yy, this.rgb_ctx.canvas.width, h);
        }

        // clear highlight canvas
        this.highlight_ctx.clearRect(0, 0, this.highlight_ctx.canvas.width, this.highlight_ctx.canvas.height);

    }

    renderLoopHelper () {

        if (rgbTexture) {
            rgbTexture.needsUpdate = true;
        }

        if (alphaTexture) {
            alphaTexture.needsUpdate = true;
        }

    }

    show() {
        this.highlight_ctx.canvas.style.display = 'block';
        this.rgb_ctx.canvas.style.display = 'block';
    }

    hide() {
        this.highlight_ctx.canvas.style.display = 'none';
        this.rgb_ctx.canvas.style.display = 'none';
    }

}

export default GenomicNavigator
