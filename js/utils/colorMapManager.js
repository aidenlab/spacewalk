
import SpacewalkEventBus from '../spacewalkEventBus.js'
import { rgb255ToThreeJSColor, hsvToThreeJSColor } from "./colorUtils.js";
import { createImage, readFileAsDataURL } from './utils.js';

import peter_kovesi from '/src/resources/colormaps/peter_kovesi/peter_kovesi.json'
import bintu_et_al from '/resources/colormaps/bintu_et_al/bintu_et_al.png'
import juicebox_default from '/resources/colormaps/juicebox_default/juicebox_default.png'
import parula from '/resources/colormaps/parula/parula.png'
import cool from '/resources/colormaps/cool/cool.png'
import sky from '/resources/colormaps/sky/sky.png'
import nebula from '/resources/colormaps/nebula/nebula.png'
import jet from '/resources/colormaps/jet/jet.png'

const defaultColormapName = 'peter_kovesi_rainbow_bgyr_35_85_c72_n256';

const hsvSampleCount = 512

function generateHSVRamp(sampleCount) {
    const list = []
    for (let i = 0; i < sampleCount; i++) {
        const h = i / sampleCount
        list.push(hsvToThreeJSColor(h, 1, 1))
    }
    return list
}

const colorMapRegistry = [
    {
        id: defaultColormapName,
        displayName: 'Peter Kovesi Rainbow',
        source: { kind: 'rgbArray', data: peter_kovesi.colors }
    },
    {
        id: 'bintu_et_al',
        displayName: 'Bintu et al.',
        source: { kind: 'png', url: bintu_et_al }
    },
    {
        id: 'juicebox_default',
        displayName: 'Juicebox Default',
        source: { kind: 'png', url: juicebox_default }
    },
    {
        id: 'hsv',
        displayName: 'HSV',
        source: { kind: 'generator', generate: () => generateHSVRamp(hsvSampleCount) }
    },
    {
        id: 'parula',
        displayName: 'Parula',
        source: { kind: 'png', url: parula }
    },
    {
        id: 'cool',
        displayName: 'Cool',
        source: { kind: 'png', url: cool }
    },
    {
        id: 'sky',
        displayName: 'Sky',
        source: { kind: 'png', url: sky }
    },
    {
        id: 'nebula',
        displayName: 'Nebula',
        source: { kind: 'png', url: nebula }
    },
    {
        id: 'jet',
        displayName: 'Jet',
        source: { kind: 'png', url: jet }
    }
]

class ColorMapManager {

    constructor () {
        this.dictionary = {}
        this.swatches = {}
        this.activeColorMapName = defaultColormapName
    }

    async configure () {

        for (const descriptor of colorMapRegistry) {
            try {
                await this.addMap(descriptor);
                if (this.dictionary[ descriptor.id ]) {
                    this.swatches[ descriptor.id ] = renderSwatchDataURL(this.dictionary[ descriptor.id ])
                }
            } catch (e) {
                console.warn(e.message);
            }
        }

    }

    async addMap({ id, source }) {

        if ('rgbArray' === source.kind) {
            this.dictionary[ id ] = source.data.map(([ r, g, b ]) => rgb255ToThreeJSColor(r, g, b))
            return
        }

        if ('generator' === source.kind) {
            this.dictionary[ id ] = source.generate()
            return
        }

        if ('png' === source.kind) {
            let response;
            try {
                response = await fetch(source.url);
            } catch (error) {
                console.warn(error.message);
                return;
            }

            if (200 !== response.status) {
                console.log('ERROR: bad response status');
            }

            let blob = undefined;
            try {
                blob = await response.blob();
            } catch (e) {
                console.warn(e.message);
            }

            let imageSource = undefined;
            try {
                imageSource = await readFileAsDataURL(blob);
            } catch (e) {
                console.warn(e.message);
            }

            let image = undefined;
            try {
                image = await createImage(imageSource);
            } catch (e) {
                console.warn(e.message);
            }

            this.dictionary[ id ] = rgbListWithImage(image);
            return
        }

        console.error(`Unknown color map source kind: ${ source.kind }`)
    }

    listColorMaps() {
        return colorMapRegistry
            .filter(({ id }) => this.dictionary[ id ])
            .map(({ id, displayName }) => ({ id, displayName, swatchDataURL: this.swatches[ id ] }))
    }

    getActiveColorMapName() {
        return this.activeColorMapName
    }

    setActiveColorMapName(name) {
        if (!this.dictionary[ name ]) {
            console.warn(`ColorMapManager.setActiveColorMapName: unknown color map "${ name }"`)
            return
        }
        if (name === this.activeColorMapName) {
            return
        }
        this.activeColorMapName = name
        SpacewalkEventBus.globalBus.post({ type: 'DidChangeColorMap', data: { name } })
    }

    retrieveRGBThreeJS(colorMapName, interpolant) {
        return retrieveRGB(this.dictionary[colorMapName], interpolant);
    }

}

function retrieveRGB(rgbList, interpolant) {

    const t = interpolant * (rgbList.length - 1)
    const a = Math.floor(t)
    const b = Math.ceil(t)
    const frac = t - a

    return rgbList[ a ].clone().lerp(rgbList[ b ], frac)
}

const swatchWidth = 160
const swatchHeight = 12

function renderSwatchDataURL(rgbList) {
    const canvas = document.createElement('canvas')
    canvas.width = swatchWidth
    canvas.height = swatchHeight
    const ctx = canvas.getContext('2d')

    for (let x = 0; x < swatchWidth; x++) {
        const interpolant = swatchWidth === 1 ? 0 : x / (swatchWidth - 1)
        const color = retrieveRGB(rgbList, interpolant)
        const r = Math.round(color.r * 255)
        const g = Math.round(color.g * 255)
        const b = Math.round(color.b * 255)
        ctx.fillStyle = `rgb(${ r }, ${ g }, ${ b })`
        ctx.fillRect(x, 0, 1, swatchHeight)
    }

    return canvas.toDataURL('image/png')
}

function rgbListWithImage(image) {

    let canvas = document.createElement('canvas');
    let ctx = canvas.getContext('2d');

    ctx.canvas.width = image.width;
    ctx.canvas.height = 1;

    ctx.drawImage(image, 0, 0, ctx.canvas.width, ctx.canvas.height);

    const imageDataAsRGBAList = ctx.getImageData(0,0, ctx.canvas.width, ctx.canvas.height).data;

    const rgbList = []

    for (let i = 0; i < imageDataAsRGBAList.length; i += 4) {
        // grab r g b channels. ignore alpha channel.
        const [ r, g, b ] = [ imageDataAsRGBAList[ i ], imageDataAsRGBAList[ i+1 ], imageDataAsRGBAList[ i+2 ] ];
        rgbList.push( rgb255ToThreeJSColor(r, g, b) );
    }

    return rgbList;

}

export { defaultColormapName }

export default ColorMapManager;
