import SpacewalkEventBus from '../spacewalkEventBus.js'
import {clamp} from './mathUtils.js'

let dragData = undefined

function configureDrag(targetElement, dragHandleElement, container, options = {}) {

    const {
        topConstraint: providedTopConstraint,
        onDragStart,
        onDragEnd
    } = options

    let topConstraint = providedTopConstraint
    if (typeof providedTopConstraint === 'object' && providedTopConstraint !== null) {
        const { height } = providedTopConstraint.getBoundingClientRect()
        topConstraint = height
    }

    const target = targetElement

    const doDrag = event => {

        if(undefined === dragData) {
            return
        }

        const { left, top } = getConstrainedDragValue(target, container, topConstraint, event)
        target.style.left = left
        target.style.top  = top

    }

    const endDrag = event => {

        if(undefined === dragData) {
            return
        }

        const { left, top } = getConstrainedDragValue(target, container, topConstraint, event)
        target.style.left = left
        target.style.top  = top

        dragData.abortController.abort()
        dragData = undefined

        if (onDragEnd) {
            onDragEnd(event, { left, top })
        }

        SpacewalkEventBus.globalBus.post({ type: "DidEndRenderContainerDrag" })

    }

    dragHandleElement.addEventListener('mousedown', event => {

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
    const { width:w, height:h } = target.getBoundingClientRect()

    let left = dragData.dx + screenX
    left = clamp(left, x, width - w)

    let top = dragData.dy + screenY

    const yy = topConstraint || y
    top = clamp(top, yy, height - h)

    return { left: `${ left }px`, top: `${ top }px` }
}

export { configureDrag }
