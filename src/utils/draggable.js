import {clamp} from './mathUtils.js'

let dragData = undefined

const TOP_CONSTRAINT_BUFFER_PX = 8

// options.contain — the target is a child of container (container is its offsetParent).
// Keeps the target's full bounding box inside the container, and emits left/top in the
// container's coordinate space rather than the viewport's. Without it the target is
// positioned in viewport coordinates, which only coincides with CSS left/top when the
// offsetParent sits at the viewport origin.
function configureDrag(targetElement, dragHandleElement, container, options = {}) {

    const {
        topConstraint: providedTopConstraint,
        excludeSelector,
        contain,
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

        const { left, top } = getConstrainedDragValue(target, container, resolveTopConstraint(), contain, event)
        target.style.left = left
        target.style.top  = top

    }

    const endDrag = event => {

        if(undefined === dragData) {
            return
        }

        const { left, top } = getConstrainedDragValue(target, container, resolveTopConstraint(), contain, event)
        target.style.left = left
        target.style.top  = top

        dragData.abortController.abort()
        dragData = undefined

        if (onDragEnd) {
            onDragEnd(event, { left, top })
        }

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

        // clientX/clientY are viewport CSS pixels — the same space getBoundingClientRect
        // reports in. screenX/screenY are screen pixels, which diverge from CSS pixels under
        // browser zoom or a scaled display, making the target outrun the cursor.
        dragData =
            {
                dx: x - event.clientX,
                dy: y - event.clientY,
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

function getConstrainedDragValue(target, container, topConstraint, contain, { clientX, clientY }) {

    const { x, y, width, height } = container.getBoundingClientRect()
    const { width:w, height:h } = target.getBoundingClientRect()

    // x is a viewport coordinate and (width - w) is a size, so the max must be re-based
    // onto x. Existing callers pass a container at x ~ 0, where this is a no-op.
    let left = clamp(dragData.dx + clientX, x, x + width - w)

    let top = dragData.dy + clientY

    if (contain) {
        top = clamp(top, topConstraint || y, y + height - h)
    } else {
        top = Math.max(top, topConstraint || y)
    }

    // Express the result in the container's space when the target is parented to it
    const originX = contain ? x : 0
    const originY = contain ? y : 0

    return { left: `${ left - originX }px`, top: `${ top - originY }px` }
}

export { configureDrag }
