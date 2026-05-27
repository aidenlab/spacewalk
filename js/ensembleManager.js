import * as THREE from "three"
import {FileUtils} from "igv-utils"
import { includes } from "./utils/mathUtils.js"
import {hideGlobalSpinner, showGlobalSpinner} from "./utils/utils.js"
import SWBDatasource from "./datasource/SWBDatasource.js"

class EnsembleManager {

    constructor () {
    }

    async loadURL(url, traceKey, ensembleGroupKey) {

        const extension = FileUtils.getExtension(url)
        if ('sw' === extension) {
            await this.loadDatasource(url, new SWBDatasource(), parseInt(traceKey), ensembleGroupKey)
        } else if ('swt' === extension) {
            const message = 'Spacewalk no longer reads .swt files. Please convert your file to the .sw HDF5 format using swt2sw (https://github.com/turner/swt2sw) and try again.'
            console.warn(message)
            alert(message)
            const err = new Error(message)
            err.userNotified = true
            throw err
        }

    }

    async loadEnsembleGroup(ensembleGroupKey) {

        showGlobalSpinner()

        let str = `loadEnsembleGroup(${ ensembleGroupKey })`
        console.time(str)

        this.datasource.currentEnsembleGroupKey = ensembleGroupKey
        await this.datasource.updateWithEnsembleGroupKey(ensembleGroupKey)
        this.currentIndex = 0
        this.currentTrace = await this.createTrace(this.currentIndex)

        console.timeEnd(str)

        hideGlobalSpinner()
    }

    async loadDatasource(path, datasource, index, ensembleGroupKey) {

        showGlobalSpinner()
        const { sample, genomeAssembly } = await datasource.load(path, ensembleGroupKey)
        hideGlobalSpinner()

        this.sample = sample
        this.genomeAssembly = genomeAssembly

        if (this.datasource) {
            this.datasource.dispose()
        }
        this.datasource = datasource

        const initialIndex = index || 0
        this.currentTrace = await this.createTrace(initialIndex)
        this.currentIndex = initialIndex

    }

    createEventBusPayload() {

        // const { genomicStart, genomicEnd } = this.datasource.getGenomicExtentWithIndex(this.currentIndex)
        const { chr, genomicStart, genomicEnd } = this.datasource.locus

        const payload =
            {
                sample: this.sample,
                genomeAssembly: this.genomeAssembly,
                chr,
                genomicStart,
                genomicEnd,
                genomicExtentList : this.getCurrentGenomicExtentList(),
                initialIndex: this.currentIndex,
                trace: this.currentTrace
            };

        return payload
    }

    async createTrace(i) {
        return await this.datasource.createTrace(i)
    }

    async getTraceCount() {
        if (!this.datasource) {
            return 0
        }
        return await this.datasource.getVertexListCount()
    }

    getCurrentGenomicExtentList() {
        return this.datasource.currentGenomicExtentList
    }

    getGenomicInterpolantWindowList(interpolantList) {

        if (undefined === interpolantList) {
            console.error('Error: no interpolant list')
        }

        const interpolantWindowList = [];

        const genomicExtentList = this.getCurrentGenomicExtentList()

        for (const genomicExtent of genomicExtentList) {

            let { start:a, end:b } = genomicExtent

            for (const interpolant of interpolantList) {
                if ( includes({ a, b, value: interpolant }) ) {
                    interpolantWindowList.push({ genomicExtent, index: genomicExtentList.indexOf(genomicExtent) })
                }
            }
        }

        return 0 === interpolantWindowList.length ? undefined : interpolantWindowList;
    }

    getLiveMapTraceLength() {
        if (this.datasource instanceof SWBDatasource && true === this.isPointCloud) {
            return this.datasource.globaleGenomicExtentList.length
        } else {
            return this.currentTrace.length
        }
    }

    get isPointCloud(){
        return this.datasource.isPointCloud
    }

    get locus(){
        if (this.datasource) {
            return this.datasource.locus
        } else {
            return undefined
        }
    }

    static getTraceBounds(trace){

        const boundingBox = new THREE.Box3()

        const probe = new THREE.Vector3()
        for (let { xyz } of trace) {

            if (Array.isArray(xyz)) {

                for (let i = 0; i < xyz.length; i += 3) {
                    probe.set(xyz[ i ], xyz[ i + 1 ], xyz[ i + 2])
                    boundingBox.expandByPoint(probe)
                }
            } else {
                probe.set(xyz.x, xyz.y, xyz.z)
                boundingBox.expandByPoint(probe)
            }

        }

        const { min, max } = boundingBox;

        const boundingSphere = new THREE.Sphere();
        boundingBox.getBoundingSphere(boundingSphere);
        const { center, radius } = boundingSphere;

        return { min, max, center, radius }
    }

    static getSingleCentroidVertices(trace, doFilterMissingData) {

        let list
        if (true === doFilterMissingData) {
            list = trace.filter(({ xyz }) => undefined === xyz.isMissingData)
        } else {
            list = trace
        }

        return list.map(({ xyz }) => new THREE.Vector3(xyz.x, xyz.y, xyz.z))

    }

}

export default EnsembleManager
