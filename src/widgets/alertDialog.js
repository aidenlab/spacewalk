import * as DOMUtils from "./utils/dom-utils.js"
import makeDraggable from "./utils/draggable.js"

const httpMessages =
    {
        "401": "Access unauthorized",
        "403": "Access forbidden",
        "404": "Not found"
    }


class AlertDialog {
    constructor(parent) {

        // container
        this.container = DOMUtils.div({class: "igv-widgets-alert-dialog-container"})
        parent.appendChild(this.container)
        this.container.setAttribute('tabIndex', '-1')
        // alertDialog.js was vendored into this repo without its stylesheet, so the
        // bundled CSS has no rules for these classes. Style the dialog inline here
        // so it renders correctly wherever it's mounted. display is left to
        // DOMUtils.show/hide (flex when shown, none when hidden).
        this.container.style.cssText = `
            position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
            z-index: 4096; flex-direction: column; min-width: 360px; max-width: 520px;
            max-height: 70vh; background: #fff; color: #444; border: 1px solid #bbb;
            border-radius: 6px; box-shadow: 0 8px 32px rgba(0,0,0,0.35);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
            font-size: 14px; overflow: hidden;`

        // header
        const header = DOMUtils.div()
        this.container.appendChild(header)
        header.style.cssText = `
            padding: 10px 14px; background: #f3f3f3; border-bottom: 1px solid #ddd;
            cursor: move; font-weight: 600; user-select: none;`

        this.errorHeadline = DOMUtils.div()
        header.appendChild(this.errorHeadline)
        this.errorHeadline.textContent = ''

        // body container
        let bodyContainer = DOMUtils.div({id: 'igv-widgets-alert-dialog-body'})
        this.container.appendChild(bodyContainer)
        bodyContainer.style.cssText = `padding: 16px 14px; overflow-y: auto; flex: 1 1 auto; line-height: 1.45;`

        // body copy
        this.body = DOMUtils.div({id: 'igv-widgets-alert-dialog-body-copy'})
        bodyContainer.appendChild(this.body)
        this.body.style.cssText = `word-break: break-word;`

        // ok container
        let ok_container = DOMUtils.div()
        this.container.appendChild(ok_container)
        ok_container.style.cssText = `padding: 10px 14px; border-top: 1px solid #eee; text-align: right;`

        // ok
        this.ok = DOMUtils.div()
        ok_container.appendChild(this.ok)
        this.ok.textContent = 'OK'
        this.ok.style.cssText = `
            display: inline-block; min-width: 64px; padding: 6px 16px; cursor: pointer;
            background: #2a7de1; color: #fff; border-radius: 4px; text-align: center; user-select: none;`

        const okHandler = () => {

            if (typeof this.callback === 'function') {
                this.callback("OK")
                this.callback = undefined
            }
            this.body.innerHTML = ''
            DOMUtils.hide(this.container)
        }

        this.ok.addEventListener('click', event => {

            event.stopPropagation()

            okHandler()
        })

        this.container.addEventListener('keypress', event => {

            event.stopPropagation()

            if ('Enter' === event.key) {
                okHandler()
            }
        })

        makeDraggable(this.container, header)

        DOMUtils.hide(this.container)
    }

    present(alert, callback) {

        this.errorHeadline.textContent = alert.message ? 'ERROR' : ''
        let string = alert.message || alert

        if (httpMessages.hasOwnProperty(string)) {
            string = httpMessages[string]
        }

        this.body.innerHTML = string
        this.callback = callback
        DOMUtils.show(this.container, "flex")
        this.container.focus()
    }
}

export default AlertDialog
