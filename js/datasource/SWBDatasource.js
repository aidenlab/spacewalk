import * as THREE from 'three'
import {openH5File} from 'hdf5-indexed-reader'
import {FileUtils} from 'igv-utils'
import { igvPanel } from '../app.js'
import { SpacewalkGlobals } from '../spacewalkGlobals.js'
import DataSourceBase from './dataSourceBase.js'
import {hideGlobalSpinner, showGlobalSpinner} from "../utils/utils";
import {createBoundingBoxWithFlatXYZList, cullDuplicateXYZ} from "../utils/mathUtils.js"
import SpacewalkEventBus from "../spacewalkEventBus.js"
import { updateEnsembleGroupDisplay } from "../guiManager.js"

class SWBDatasource extends DataSourceBase {

    dispose() {
        this.hdf5 = undefined
        this.header = undefined
        this.ensembleGroupKeys = undefined
    }

    async load(path, ensembleGroupKey) {

        SpacewalkGlobals.url = false === FileUtils.isFilePath(path) ? path : undefined

        const hdf5 = await openH5File(FileUtils.isFilePath(path) ? { file:path } : { url: path })

        const { sample, genomeAssembly } = await this.initialize(hdf5, ensembleGroupKey)

        return { sample, genomeAssembly }
    }

    async initialize(hdf5, ensembleGroupKey) {

        showGlobalSpinner()

        this.hdf5 = hdf5
        const headerGroup = await hdf5.get('/Header')
        this.header = await headerGroup.attrs

        this.ensembleGroupKeys = await getEnsembleGroupKeys(hdf5)

        this.currentEnsembleGroupKey = ensembleGroupKey || this.ensembleGroupKeys[ 0 ]

        await this.updateWithEnsembleGroupKey(this.currentEnsembleGroupKey)

        hideGlobalSpinner()


        // Update the ensemble group select list with list of ensemble group keys, if more than one.
        if (this.ensembleGroupKeys.length > 1) {
            SpacewalkEventBus.globalBus.post({ type: 'DidLoadSWBEnsembleGroup', data: this.ensembleGroupKeys })
        }

        let genomeAssembly

        const hackedGenomeID = woollyMammothGenomeIDHack(this.header.genome)
        if (hackedGenomeID !== undefined && igvPanel.knownGenomes[ hackedGenomeID ] !== undefined) {
            genomeAssembly = hackedGenomeID
        } else {
            console.warn(`Warning: Unrecognized genome ${ this.header.genome || 'undefined' }`)
            genomeAssembly = 'hg19'
        }

        return { sample: 'Unspecified Sample', genomeAssembly }
    }

    async updateWithEnsembleGroupKey(ensembleGroupKey) {

        const genomicPositionGroup = await this.hdf5.get( `${ ensembleGroupKey }/genomic_position` )
        const dataset = await genomicPositionGroup.get('regions')
        const { chromosome, genomicExtentList } = await getGlobalGenomicExtentList(dataset)
        this.locus =
            {
                chr:chromosome,
                genomicStart:genomicExtentList[0].startBP,
                genomicEnd:genomicExtentList[genomicExtentList.length-1].endBP
            }

        console.log(`SWBDatasource - chromosome ${ this.locus.chr }`)

        this.globaleGenomicExtentList = genomicExtentList

        this.isPointCloud = ('multi_point' === this.header.point_type)
        this.vertexListCount = undefined

        updateEnsembleGroupDisplay(ensembleGroupKey)
    }

    async getVertexListCount(){

        if (undefined === this.vertexListCount) {
            const group = await this.hdf5.get( `${this.currentEnsembleGroupKey}/spatial_position` )
            const list = await group.keys
            this.vertexListCount = list.length
        }

        return this.vertexListCount
    }

    async createTrace(i) {

        showGlobalSpinner()

        let str = `createTrace() - retrieve dataset: ${ this.currentEnsembleGroupKey }/spatial_position/t_${i}`
        console.time(str)
        const traceDataset = await this.hdf5.get( `${ this.currentEnsembleGroupKey }/spatial_position/t_${i}` )
        const traceValues = await traceDataset.value
        console.timeEnd(str)

        this.currentTraceIndex = i

        str = `createTrace() - build ${ true === this.isPointCloud ? 'pointcloud' : 'ball & stick' } trace`
        console.time(str)

        let trace
        if (true === this.isPointCloud) {

            const { genomicExtentList, regionXYZDictionary, regionIndexStrings } = createGenomicExtentList(traceValues, this.globaleGenomicExtentList)

            this.currentGenomicExtentList = genomicExtentList

            trace = genomicExtentList.map((genomicExtent, index) => {
                const key = regionIndexStrings[ index ]
                return createPointCloudPayload(key, genomicExtent, regionXYZDictionary[ key ])
            })
        } else {

            this.currentGenomicExtentList = this.globaleGenomicExtentList

            const xyzList = createCleanFlatXYZList(traceValues)

            trace = xyzList.map((xyz, index) => {
                const { interpolant } = this.currentGenomicExtentList[ index ]
                return { interpolant, xyz, drawUsage: THREE.StaticDrawUsage}
            })

        }
        console.timeEnd(str)

        hideGlobalSpinner()

        return trace

    }

    // Build per-trace vertex lists for a pointcloud ensemble by collapsing each
    // trace's flat [region_id, x, y, z] quadruples into per-region centroids.
    // Ball-and-stick ensembles bypass this path: liveContactMapService hands
    // the raw HDF5 handle to hic-straw, which reads the bake or t_* datasets
    // directly. Pointcloud bake is future work; until then this remains here.
    async buildPointCloudLiveMapTraces() {
        const traces = []
        const count = await this.getVertexListCount()
        for (let i = 0; i < count; i++) {
            const ds = await this.hdf5.get(`${this.currentEnsembleGroupKey}/spatial_position/t_${i}`)
            const traceValues = await ds.value

            const { genomicExtentList, regionXYZDictionary, regionIndexStrings } =
                createGenomicExtentList(traceValues, this.globaleGenomicExtentList)

            const centroids = genomicExtentList
                .map((ge, index) => {
                    const key = regionIndexStrings[index]
                    return createPointCloudPayload(key, ge, regionXYZDictionary[key])
                })
                .map(({ centroid }) => ({ x: centroid[0], y: centroid[1], z: centroid[2] }))

            const present = new Set(regionIndexStrings)
            const shimmed = []
            for (let r = 0; r < this.globaleGenomicExtentList.length; r++) {
                const key = `${r}`
                if (present.has(key)) {
                    shimmed.push(centroids[regionIndexStrings.indexOf(key)])
                } else {
                    shimmed.push({ isMissingData: true })
                }
            }
            traces.push(shimmed)
        }
        return traces
    }

}

function createPointCloudPayload(key, genomicExtent, rawXYZ) {

    const { interpolant } = genomicExtent
    const xyz = cullDuplicateXYZ(rawXYZ)
    const { centroid } = createBoundingBoxWithFlatXYZList(xyz)

    console.warn(`Pointcloud: Did cull points from ${ rawXYZ.length } to ${ xyz.length }`)

    return { interpolant, xyz, centroid, drawUsage: THREE.DynamicDrawUsage }

}

function createGenomicExtentList(traceValues, globalGenomicExtentList) {

    const makeRegionXYZStack = regionXYZList => {

        const nby4 = []
        for (let i = 0; i < regionXYZList.length; i += 4) {
            let row = regionXYZList.slice(i, i + 4);
            nby4.push(row);
        }

        return nby4
    }

    // Convert flat (one-dimensional array) to two-dimensional matrix. Each row is: region-id | x | y | z
    // The result is a stack of sub-matrices each corresponding to a specific region-id
    const regionXYZStack = makeRegionXYZStack(traceValues)

    // Convert stacked sub-matrices to dictionary.
    // key: region-id
    // value: sub-matrix
    const regionXYZDictionary = convertRegionXYZStackToDictionary(regionXYZStack)
    const regionIndexStrings = Object.keys(regionXYZDictionary).sort((aString, bString) => parseInt(aString, 10) - parseInt(bString, 10))
    const genomicExtentList = []
    for (const index of regionIndexStrings) {
        genomicExtentList.push(globalGenomicExtentList[ index ])
    }

    return { genomicExtentList, regionXYZDictionary, regionIndexStrings }
}

function convertRegionXYZStackToDictionary(regionXYZStack) {
    const regionXYZDictionary = {}
    let currentSubMatrix = [];
    let currentValue = regionXYZStack[0][0];

    for (let row of regionXYZStack) {
        if (row[0] === currentValue) {
            currentSubMatrix.push(row);
        } else {
            regionXYZDictionary[currentValue.toString()] = currentSubMatrix;
            currentSubMatrix = [row];
            currentValue = row[0];
        }
    }
    // Push the last group
    regionXYZDictionary[currentValue.toString()] = currentSubMatrix;

    // discard first column
    for (let matrix of Object.values(regionXYZDictionary)) {
        matrix.map(row => row.shift())
    }

    // flatten matrices into one-dimensional array
    for (const [ key, value ] of Object.entries(regionXYZDictionary)) {
        regionXYZDictionary[key] = value.flat()
    }

    return regionXYZDictionary
}

async function getGlobalGenomicExtentList(dataset) {

    const strings = await dataset.value

    let chromosome
    const genomicExtentList = []
    for (let i = 0; i < strings.length; i += 3) {
        let [ chr, startBP, endBP ] = strings.slice(i, i + 3)
        if (undefined === chromosome) {
            chromosome = chr
        }
        startBP = Math.max(1, parseInt(startBP))
        endBP = parseInt(endBP)
        genomicExtentList.push({ startBP, endBP, centroidBP: Math.floor((endBP+startBP)/2), sizeBP: (endBP-startBP) })
    }

    const interpolantStepSize = 1/(genomicExtentList.length)
    for (let i = 0; i < genomicExtentList.length; i++) {
        genomicExtentList[ i ].start = (i * interpolantStepSize)
        genomicExtentList[ i ].interpolant = (i * interpolantStepSize) + interpolantStepSize / 2
        genomicExtentList[ i ].end = ((i + 1) * interpolantStepSize)
    }

    return { chromosome, genomicExtentList }
}

function woollyMammothGenomeIDHack(str) {
    return 'woolly mammoth' === str ? 'Loxafr3.0_HiC' : str
}
function createCleanFlatXYZList(numbers) {

    const bbox = createBoundingBoxWithFlatXYZList(numbers)
    const isMissingData = { x: bbox.centroid[ 0 ], y: bbox.centroid[ 1 ], z: bbox.centroid[ 2 ], isMissingData: true }

    const list = []
    for (let v = 0; v < numbers.length; v += 3) {

        const [ x, y, z ] = numbers.slice(v, v + 3)

        if ( [ x, y, z ].some(isNaN) ) {
            // console.warn('is missing xyz value. will replace with centroid')
            list.push(isMissingData)
        } else {
            list.push({ x, y, z, isMissingData: undefined })
        }

    }

    return list
}

async function getEnsembleGroupKeys(hdf5) {

    let scratch = await hdf5.keys

    // discard Header key
    scratch = scratch.filter(item => 'Header' !== item)

    // if present, discard _index key
    if (new Set(scratch).has('_index')) {
        scratch.shift()
    }

    return scratch
}

export default SWBDatasource
