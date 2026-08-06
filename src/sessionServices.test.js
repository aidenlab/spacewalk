import { describe, it, expect, beforeEach, vi } from 'vitest'

// The seam this covers: whether a loaded contact map is included in the saved
// session and the shared session URL. A *live* contact map is derived from the
// ensemble in the viewer — it has no URL to restore from — so it must never be
// serialized. That guard sat inert for eighteen months (issue #84) because it
// tested a juicebox.js property that no longer exists, and nothing exercised it.

vi.mock('juicebox.js', () => ({
    default: {
        toJSON: () => ({ url: 'map.hic' }),
        compressedSession: () => 'session=JUICEBOXBLOB'
    }
}))

vi.mock('igv-utils', () => ({
    BGZip: { compressString: () => 'SPACEWALKBLOB' }
}))

vi.mock('./panel.js', () => ({
    default: { toJSON: () => ({}), setState: () => {} }
}))

vi.mock('./guiManager.js', () => ({
    default: { updateRenderStyleWidgetState: () => {} }
}))

vi.mock('./share/shareHelper.js', () => ({
    shortenURL: async url => url
}))

vi.mock('./widgets/presentResourceError.js', () => ({
    presentResourceError: () => {},
    presentResourceErrors: () => {}
}))

const { SessionService } = await import('./sessionServices.js')
const { SpacewalkGlobals } = await import('./spacewalkGlobals.js')

// dataset === undefined models "no map loaded"; the two flavors below are the
// only shapes juicebox.js produces once one is.
const hicDataset = { url: 'map.hic', isLive: false }
const liveDataset = { isLive: true }

const createService = dataset => new SessionService({
    ensembleManager: {
        locus: { chr: 'chr1', genomicStart: 0, genomicEnd: 1000 },
        currentIndex: 0,
        datasource: { currentEnsembleGroupKey: 'group' }
    },
    sceneManager: { renderStyle: 'render-style-ball-stick' },
    igvPanel: {
        getSessionState: () => 'none',
        browser: { toJSON: () => ({ tracks: [] }), compressedSession: () => 'IGVBLOB' }
    },
    juiceboxPanel: { browser: { dataset } },
    trackMaterialProvider: {},
    cameraLightingRig: { getState: () => ({}) },
    ensembleIngestionController: {}
})

beforeEach(() => {
    SpacewalkGlobals.url = 'ensemble.sw'
    vi.stubGlobal('window', { location: { href: 'https://spacewalk.app/index.html' } })
})

describe('SessionService.toJSON', () => {

    it('includes the juicebox payload when a Hi-C map is loaded', () => {
        expect(createService(hicDataset).toJSON().juicebox).toEqual({ url: 'map.hic' })
    })

    it('omits the juicebox payload when a live contact map is loaded', () => {
        expect(createService(liveDataset).toJSON()).not.toHaveProperty('juicebox')
    })

    it('omits the juicebox payload when no map is loaded', () => {
        expect(createService(undefined).toJSON()).not.toHaveProperty('juicebox')
    })

})

describe('SessionService.getShareURL', () => {

    it('includes the juicebox session param when a Hi-C map is loaded', async () => {
        const url = await createService(hicDataset).getShareURL()
        expect(url).toContain('session=JUICEBOXBLOB')
    })

    it('omits the juicebox session param when a live contact map is loaded', async () => {
        const url = await createService(liveDataset).getShareURL()
        expect(url).not.toContain('JUICEBOXBLOB')
        expect(url).toContain('spacewalkSessionURL=')
    })

    it('omits the juicebox session param when no map is loaded', async () => {
        const url = await createService(undefined).getShareURL()
        expect(url).not.toContain('JUICEBOXBLOB')
    })

})
