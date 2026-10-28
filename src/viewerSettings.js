import { appleCrayonColorThreeJS } from './utils/colorUtils.js'
import { jsonStorageStore, noStore } from './utils/jsonStorageStore.js'

// The full app's record. Nothing else reads or writes this key.
const STORAGE_KEY = 'spacewalk-settings'

function rgbOf(name) {
    return pickColor(appleCrayonColorThreeJS(name))
}

function defaults() {
    return {
        background: rgbOf('snow'),
        gnomon: { visible: false, ...rgbOf('iron') },
        groundPlane: { visible: false, ...rgbOf('iron') },
        referenceRuler: { visible: false, ...rgbOf('iron') },
    }
}

// A stored record is read section by section; a section missing or malformed falls
// back to its default. Anything else in it (an old ruler anchor) is dropped.
function fromRecord(record) {
    const values = defaults()
    if (!record) return values

    if (isColor(record.background)) values.background = pickColor(record.background)
    for (const key of [ 'gnomon', 'groundPlane', 'referenceRuler' ]) {
        const section = record[key]
        if (isColor(section) && 'boolean' === typeof section.visible) {
            values[key] = { visible: section.visible, ...pickColor(section) }
        }
    }
    return values
}

function isColor(value) {
    return !!value && [ value.r, value.g, value.b ].every(Number.isFinite)
}

function pickColor({ r, g, b }) {
    return { r, g, b }
}

/**
 * The one owner of the viewer settings (see CONTEXT.md): background color, axes
 * (gnomon), ground plane, reference ruler visibility and color. Built by the viewer
 * assembly and injected into everything that shows or changes them.
 *
 * The store is plugged in: localStorage in the full app, none on the viewer-only
 * page, the Room in M1. Changes go out through update() (apply, then persist) and
 * come in through receive() (apply only).
 */
class ViewerSettings {

    constructor({ store = noStore } = {}) {
        this.store = store
        this.values = fromRecord(store.load())
        this.listeners = []
    }

    // Listeners apply the values to the scene and its controls. Each hears every change,
    // whether it was made here or arrived from outside.
    subscribe(listener) {
        this.listeners.push(listener)
    }

    // A change made on this page: apply it, then persist it.
    // patch is a partial record, e.g. { gnomon: { visible: true } }.
    update(patch) {
        for (const [ key, section ] of Object.entries(patch)) {
            this.values[key] = { ...this.values[key], ...section }
        }
        this.notify()
        this.store.save(this.get())
    }

    // A whole record arriving from outside (in M1, the Room): apply it, but don't write
    // it back — it came from the store's side. It replaces, not merges: a section the
    // record lacks returns to its default.
    receive(record) {
        this.values = fromRecord(record)
        this.notify()
    }

    notify() {
        for (const listener of this.listeners) listener(this.get())
    }

    get() {
        return structuredClone(this.values)
    }
}

function viewerSettingsStore(storage) {
    return jsonStorageStore(storage, STORAGE_KEY)
}

export { viewerSettingsStore }
export default ViewerSettings
