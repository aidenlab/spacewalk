import { describe, it, expect } from 'vitest'
import { followRoom, NOT_IN_A_ROOM } from './roomStatus.js'

describe('followRoom', () => {

    it('reads Connecting… while first connecting', () => {
        const show = followRoom('abc123')
        expect(show({ type: 'connecting' })).toEqual({ indicator: 'connecting', text: 'Connecting…' })
    })
    it('reads Joined room <id> once open', () => {
        const show = followRoom('abc123')
        show({ type: 'connecting' })
        expect(show({ type: 'open' })).toEqual({ indicator: 'joined', text: 'Joined room abc123' })
    })
    it('reads Reconnecting… on every retry after the connection drops', () => {
        const show = followRoom('abc123')
        show({ type: 'connecting' })
        show({ type: 'open' })
        expect(show({ type: 'closed' })).toEqual({ indicator: 'connecting', text: 'Reconnecting…' })
        expect(show({ type: 'connecting' })).toEqual({ indicator: 'connecting', text: 'Reconnecting…' })
        expect(show({ type: 'closed' })).toEqual({ indicator: 'connecting', text: 'Reconnecting…' })
        expect(show({ type: 'connecting' })).toEqual({ indicator: 'connecting', text: 'Reconnecting…' })
    })

    it('reads Joined again once back, and Reconnecting… on the next drop', () => {
        const show = followRoom('abc123')
        show({ type: 'connecting' })
        show({ type: 'open' })
        show({ type: 'closed' })
        show({ type: 'connecting' })
        expect(show({ type: 'open' })).toEqual({ indicator: 'joined', text: 'Joined room abc123' })
        show({ type: 'closed' })
        expect(show({ type: 'connecting' })).toEqual({ indicator: 'connecting', text: 'Reconnecting…' })
    })

    it('reads Reconnecting… when the first attempt fails before the Room answers', () => {
        const show = followRoom('abc123')
        show({ type: 'connecting' })
        show({ type: 'closed' })
        expect(show({ type: 'connecting' })).toEqual({ indicator: 'connecting', text: 'Reconnecting…' })
    })
    // The messages are END_MESSAGES' words, written out: the page adds to them, never rewrites them.
    it('asks for Claude again when the Room has expired', () => {
        const show = followRoom('abc123')
        show({ type: 'open' })
        expect(show({ type: 'ended', reason: 'room-expired', message: 'This Room has expired.' }))
            .toEqual({ indicator: 'ended', text: 'This Room has expired. Ask Claude to open Spacewalk again.' })
    })

    it('asks for Claude again when there is no such Room', () => {
        const show = followRoom('nope')
        show({ type: 'connecting' })
        expect(show({ type: 'ended', reason: 'room-unknown', message: 'There is no such Room.' }))
            .toEqual({ indicator: 'ended', text: 'There is no such Room. Ask Claude to open Spacewalk again.' })
    })

    it('says only to reload when the viewer is out of date', () => {
        const show = followRoom('abc123')
        show({ type: 'connecting' })
        expect(show({ type: 'ended', reason: 'protocol-mismatch', message: 'This viewer is out of date: reload the viewer.' }))
            .toEqual({ indicator: 'ended', text: 'This viewer is out of date: reload the viewer.' })
    })
})

describe('NOT_IN_A_ROOM', () => {

    it('is the grey dot and Not in a room, for a page opened with no Room', () => {
        expect(NOT_IN_A_ROOM).toEqual({ indicator: 'off', text: 'Not in a room' })
    })
})
