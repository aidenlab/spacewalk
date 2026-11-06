/**
 * @typedef {object} RoomStatus What the Room indicator shows.
 * @property {'off'|'connecting'|'joined'|'ended'} indicator the dot: grey, amber, green or red
 * @property {string} text the status text beside it
 */

/** A page opened with no Room: a ?file= launch or a Snapshot URL. */
export const NOT_IN_A_ROOM = Object.freeze({ indicator: 'off', text: 'Not in a room' })

// What the page adds to the Remote's words for why the Room let it go (END_MESSAGES), by reason.
// Only a new Room helps when this one is gone; reloading is the fix for an out-of-date viewer.
const AFTER_END = {
    'room-expired': ' Ask Claude to open Spacewalk again.',
    'room-unknown': ' Ask Claude to open Spacewalk again.',
}

/**
 * Follows the Remote's statuses (attachRemote's Status) and says what the Room indicator shows for each.
 *
 * @param {string} room the Room id, from ?room=
 * @returns {(status: object) => RoomStatus}
 */
export function followRoom(room) {

    // The Remote reports 'connecting' before every retry too; once the connection has
    // dropped, each of those is still a reconnect until the Room answers.
    let dropped = false

    return status => {
        if ('open' === status.type) {
            dropped = false
            return { indicator: 'joined', text: `Joined room ${room}` }
        }
        if ('ended' === status.type) {
            return { indicator: 'ended', text: status.message + (AFTER_END[ status.reason ] ?? '') }
        }
        if ('closed' === status.type) dropped = true
        return { indicator: 'connecting', text: dropped ? 'Reconnecting…' : 'Connecting…' }
    }
}
