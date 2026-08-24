import { describe, it, expect } from 'vitest'
import { BGZip } from 'igv-utils'
import { wireFormatCorpus } from 'juicebox.js/test/data/wireFormatCorpus.js'
import { uncompressSessionURL, UnsupportedSessionStringError } from './sessionURLCodec.js'

/**
 * The seam this covers: the `session=` wire format has two readers — juicebox's
 * decoder and this one — and until aidenlab/juicebox.js#518 nobody could see
 * them drift. They had, in three places.
 *
 * The settled principle is that the **session string** is the contract and the
 * URL is not (juicebox.js ADR-0011): every juicebox host owes the same payload
 * set, and no host owes another its query string. So this file tests values,
 * never URLs, and the second half of it runs juicebox's own fixtures.
 */

const compress = object => BGZip.compressString(JSON.stringify(object))

describe('uncompressSessionURL', () => {

    const session = { browsers: [ { url: 'https://example.org/a.hic', name: 'A' } ] }

    it('reads the blob: spelling every Spacewalk share link carries', () => {
        expect(JSON.parse(uncompressSessionURL(`blob:${compress(session)}`))).toEqual(session)
    })

    /**
     * The row that used to mangle. `slice(5)` was written for `blob:` and was
     * right for `data:` only because both prefixes happen to be five characters
     * — a coincidence, not a rule, and the fixed number is what made it one.
     */
    it('reads the data: spelling juicebox also writes', () => {
        expect(JSON.parse(uncompressSessionURL(`data:${compress(session)}`))).toEqual(session)
    })

    it('reads a real gzip data URI', () => {
        const gzipDataURI = wireFormatCorpus.find(f => f.id === 'session-gzip-data-uri').payload
        expect(JSON.parse(uncompressSessionURL(gzipDataURI))).toEqual(session)
    })

    /**
     * The stated boundary. juicebox fetches a session URL and sniffs what comes
     * back; this app does not, and says so instead of slicing five characters
     * off a URL and handing `://example.org/s.json` to the decompressor.
     */
    describe('a value that is not a compressed session string', () => {

        const sessionURL = 'https://example.org/fixtures/session.json'

        it('is refused by name rather than mangled', () => {
            expect(() => uncompressSessionURL(sessionURL)).toThrow(UnsupportedSessionStringError)
        })

        it('is refused with the value it could not read', () => {
            try {
                uncompressSessionURL(sessionURL)
                expect.unreachable('a session URL must not decode')
            } catch (e) {
                expect(e.sessionURL).toBe(sessionURL)
                expect(e.message).toContain('cannot open this session')
            }
        })

        it('refuses a bare JSON document too — nothing writes one into a parameter', () => {
            expect(() => uncompressSessionURL('{"browsers":[]}'))
                .toThrow(UnsupportedSessionStringError)
        })
    })
})

/**
 * juicebox's fixture corpus, run against this decoder.
 *
 * Neither repo imports the other's codec — the shared thing is `BGZip`, and
 * `sessionBootstrapper` decodes Spacewalk's, igv's and juicebox's sessions in
 * one loop, so importing juicebox's decoder would have juicebox decoding igv
 * sessions. A shared *fixture* keeps the two honest without pointing the
 * dependency arrow anywhere (ADR-0011 decision 3).
 *
 * Each fixture's `payload` is the session string with the query parameter off,
 * which is exactly what this function is handed. `input` — the whole URL — is
 * deliberately not used here: it is juicebox's query string, and this app has
 * its own.
 *
 * **Outcome only**: decodes to a session document, or rejects. Not error type.
 * juicebox reports a `SessionDecodeError`; importing that taxonomy into an app
 * with its own would be the dependency arrow again in a smaller costume.
 */
describe('the shared payload rows', () => {

    const payloadRows = wireFormatCorpus.filter(f => f.payload !== undefined)

    it('the corpus is importable and carries payload rows', () => {
        expect(payloadRows.length).toBeGreaterThan(0)
    })

    for (const fixture of payloadRows) {

        // A `sessionUrl` payload is juicebox-only: it names a document to
        // fetch, and this app has no fetch arm by decision. Expected to be
        // *refused* here however juicebox reads it — the boundary, asserted
        // rather than assumed.
        const refused = fixture.format === 'sessionUrl' || fixture.outcome !== 'decodes'

        it(`${fixture.id} — ${refused ? 'rejects' : 'decodes'}`, () => {
            if (refused) {
                expect(() => uncompressSessionURL(fixture.payload)).toThrow()
                return
            }

            const decoded = JSON.parse(uncompressSessionURL(fixture.payload))
            expect(decoded).toBeTypeOf('object')
            expect(Array.isArray(decoded.browsers)).toBe(true)
        })
    }
})
