const MODIFIERS = [ 'connecting', 'joined', 'ended' ].map(state => `room-indicator--${ state }`)

/**
 * The Room indicator in the Viewer page's trace bar (viewer.html): a dot and a line of
 * status text. The text may be cut short by a narrow window; the whole of it is the title.
 *
 * @param {HTMLElement} element the .room-indicator
 * @returns {(status: import('../roomStatus.js').RoomStatus) => void} shows a RoomStatus
 */
export function roomIndicator(element) {

    const textElement = element.querySelector('.room-indicator__text')

    return ({ indicator, text }) => {
        element.classList.remove(...MODIFIERS)
        // The grey dot is the block's own colour: no Room has no modifier.
        if ('off' !== indicator) element.classList.add(`room-indicator--${ indicator }`)
        textElement.textContent = text
        element.title = text
    }
}
