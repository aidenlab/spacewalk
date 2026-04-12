import trackRegistry from '/src/resources/tracks/trackRegistry.json'
const spacewalkConfig =
    {
        trackRegistry,
        urlShortener: {
            provider: 'tinyURL',
            apiKey: process.env.TINYURL_API_KEY || 'YOUR_TINYURL_API_KEY',
            domain: 't.3dg.io',
            endpoint: 'https://api.tinyurl.com/create',
            tags: ['spacewalk']
        }

    }

export { spacewalkConfig }
