import trackRegistry from './resources/tracks/trackRegistry.json'
const spacewalkConfig =
    {
        trackRegistry,
        isCircular: false,
        urlShortener: {
            provider: 'tinyURL',
            // The sw-shortlink worker (workers/sw-shortlink) shortens on t.3dg.io with the
            // account's key. The page sends no key: TinyURL's API no longer answers browser
            // origins. Every hostname the app is served on is on the worker's Origin allow-list.
            endpoint: 'https://spacewalk.aidenlab.org/shorten'
        }

    }

export { spacewalkConfig }
