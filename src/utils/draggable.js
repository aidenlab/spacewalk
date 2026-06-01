import SpacewalkEventBus from '../spacewalkEventBus.js'
import {clamp} from './mathUtils.js'

let dragData = undefined

const TOP_CONSTRAINT_BUFFER_PX = 8

function configureDrag(targetElement, dragHandleElement, container, options = {}) {

    const {
        topConstraint: providedTopConstraint,
        excludeSelector,
        onDragStart,
        onDragEnd
    } = options

    const resolveTopConstraint = () => {
        if (typeof providedTopConstraint === 'object' && providedTopConstraint !== null) {
            return providedTopConstraint.getBoundingClientRect().height + TOP_CONSTRAINT_BUFFER_PX
        }
        return providedTopConstraint
    }

    const target = targetElement

    const doDrag = event => {

        if(undefined === dragData) {
            return
        }

        const { left, top } = getConstrainedDragValue(target, container, resolveTopConstraint(), event)
        target.style.left = left
        target.style.top  = top

    }

    const endDrag = event => {

        if(undefined === dragData) {
            return
        }

        const { left, top } = getConstrainedDragValue(target, container, resolveTopConstraint(), event)
        target.style.left = left
        target.style.top  = top

        dragData.abortController.abort()
        dragData = undefined

        if (onDragEnd) {
            onDragEnd(event, { left, top })
        }

        SpacewalkEventBus.globalBus.post({ type: "DidEndDrag", data: target.getAttribute('id') })

    }

    dragHandleElement.addEventListener('mousedown', event => {

        if (excludeSelector && event.target.closest(excludeSelector)) {
            return
        }

        event.stopPropagation()

        const { x, y } = target.getBoundingClientRect()

        // Defensive cleanup: abort previous drag session if still active
        if (dragData && dragData.abortController) {
            dragData.abortController.abort()
        }

        const abortController = new AbortController()
        const { signal } = abortController

        dragData =
            {
                dx: x - event.screenX,
                dy: y - event.screenY,
                abortController
            }

        if (onDragStart) {
            onDragStart(event, { x, y })
        }

        document.addEventListener('mousemove', event => {
            event.stopPropagation()
            doDrag(event)
        }, { signal })

        document.addEventListener('mouseup', event => {
            event.stopPropagation()
            endDrag(event)
        }, { signal })

        document.addEventListener('mouseleave', event => {
            event.stopPropagation()
            endDrag(event)
        }, { signal })

    })

}

function getConstrainedDragValue(target, container, topConstraint, { screenX, screenY }) {

    const { x, y, width, height } = container.getBoundingClientRect()
    const { width:w } = target.getBoundingClientRect()

    let left = dragData.dx + screenX
    left = clamp(left, x, width - w)

    let top = dragData.dy + screenY

    const yy = topConstraint || y
    top = Math.max(top, yy)

    return { left: `${ left }px`, top: `${ top }px` }
}

export { configureDrag }
