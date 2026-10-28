// A store holding one JSON value under one key of a Web Storage object (localStorage).
// An entry that won't parse reads as absent, so a corrupt value costs a reset, not a launch.
function jsonStorageStore(storage, key) {
    return {
        load() {
            try {
                const json = storage.getItem(key)
                return json ? JSON.parse(json) : null
            } catch (error) {
                console.warn(`Ignoring unreadable '${ key }' in storage`, error)
                return null
            }
        },
        save(value) {
            storage.setItem(key, JSON.stringify(value))
        }
    }
}

// Persists nothing: every load starts from defaults (the viewer-only page)
const noStore = { load: () => null, save: () => {} }

export { jsonStorageStore, noStore }
