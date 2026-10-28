import { describe, it, expect } from 'vitest'
import ViewerSettings, { viewerSettingsStore } from './viewerSettings.js'
import { appleCrayonColorThreeJS } from './utils/colorUtils.js'

const rgb = name => {
    const { r, g, b } = appleCrayonColorThreeJS(name)
    return { r, g, b }
}

describe('ViewerSettings', () => {

    it('starts from defaults when the store holds nothing', () => {
        const settings = new ViewerSettings()
        expect(settings.get()).toEqual({
            background: rgb('snow'),
            gnomon: { visible: false, ...rgb('iron') },
            groundPlane: { visible: false, ...rgb('iron') },
            referenceRuler: { visible: false, ...rgb('iron') },
        })
    })

    it('loads a record written by the full app before this owner existed, ignoring the ruler anchor', () => {
        const record = {
            background: { r: 0.1, g: 0.2, b: 0.3 },
            gnomon: { visible: true, r: 1, g: 0, b: 0 },
            groundPlane: { visible: true, r: 0, g: 1, b: 0 },
            referenceRuler: { visible: true, r: 0, g: 0, b: 1, anchor: { corner: 'top-left', dx: 5, dy: 6 } },
        }
        const settings = new ViewerSettings({ store: memoryStore(record) })
        expect(settings.get()).toEqual({
            background: { r: 0.1, g: 0.2, b: 0.3 },
            gnomon: { visible: true, r: 1, g: 0, b: 0 },
            groundPlane: { visible: true, r: 0, g: 1, b: 0 },
            referenceRuler: { visible: true, r: 0, g: 0, b: 1 },
        })
    })

    it('falls back to the default for each section a record lacks or garbles', () => {
        const record = {
            background: { r: 0.5, g: 0.5, b: 0.5 },
            gnomon: { visible: 'yes', r: 1, g: 0, b: 0 },
        }
        const settings = new ViewerSettings({ store: memoryStore(record) })
        expect(settings.get()).toEqual({
            background: { r: 0.5, g: 0.5, b: 0.5 },
            gnomon: { visible: false, ...rgb('iron') },
            groundPlane: { visible: false, ...rgb('iron') },
            referenceRuler: { visible: false, ...rgb('iron') },
        })
    })

    it('a local change reaches listeners and is written to the store, merged into its section', () => {
        const store = memoryStore()
        const settings = new ViewerSettings({ store })
        const heard = []
        settings.subscribe(values => heard.push(values))

        settings.update({ gnomon: { visible: true } })

        const expected = { visible: true, ...rgb('iron') }
        expect(heard.map(values => values.gnomon)).toEqual([ expected ])
        expect(store.record.gnomon).toEqual(expected)
        expect(new ViewerSettings({ store }).get()).toEqual(settings.get())
    })

    it('a change arriving from outside reaches listeners but is not written back to the store', () => {
        const store = memoryStore()
        const settings = new ViewerSettings({ store })
        const heard = []
        settings.subscribe(values => heard.push(values))

        settings.receive({ background: { r: 0, g: 0, b: 0 }, referenceRuler: { visible: true, r: 1, g: 1, b: 1, anchor: {} } })

        expect(heard).toEqual([ {
            background: { r: 0, g: 0, b: 0 },
            gnomon: { visible: false, ...rgb('iron') },
            groundPlane: { visible: false, ...rgb('iron') },
            referenceRuler: { visible: true, r: 1, g: 1, b: 1 },
        } ])
        expect(settings.get()).toEqual(heard[0])
        expect(store.writes).toBe(0)
    })

    it('persists to Web Storage under the full app\'s existing key, and survives a garbled entry', () => {
        const storage = memoryStorage({ 'spacewalk-settings': JSON.stringify({ gnomon: { visible: true, r: 1, g: 0, b: 0 } }) })

        const settings = new ViewerSettings({ store: viewerSettingsStore(storage) })
        expect(settings.get().gnomon).toEqual({ visible: true, r: 1, g: 0, b: 0 })

        settings.update({ groundPlane: { visible: true } })
        expect(JSON.parse(storage.getItem('spacewalk-settings')).groundPlane.visible).toBe(true)

        storage.setItem('spacewalk-settings', '{not json')
        expect(new ViewerSettings({ store: viewerSettingsStore(storage) }).get().gnomon.visible).toBe(false)
    })
})

function memoryStorage(items = {}) {
    const map = new Map(Object.entries(items))
    return {
        getItem: key => map.has(key) ? map.get(key) : null,
        setItem: (key, value) => map.set(key, String(value)),
    }
}

function memoryStore(record = null) {
    return {
        record,
        writes: 0,
        load() { return this.record },
        save(record) { this.record = record; this.writes++ },
    }
}
