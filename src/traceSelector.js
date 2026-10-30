import SpacewalkEventBus from "./spacewalkEventBus.js"
import {clamp} from "./utils/mathUtils.js"
import {StringUtils} from "igv-utils";

let numberForDisplay = undefined

class TraceSelector {

  constructor(inputElement, ensembleManager, onHandChange = () => {}) {

      this.ensembleManager = ensembleManager;
      this.onHandChange = onHandChange
      this.input = inputElement
      this.input.addEventListener('keyup', async e => {

          // enter (return) key pressed
          if (13 === e.keyCode) {
              const total = await this.ensembleManager.getTraceCount()
              const number = parseInt(this.input.value, 10)
              await this.selectByHand(getBroadcastValue(number, total, undefined), total)
          }

      })

      const button_minus = document.querySelector('#spacewalk_trace_select_button_minus')
      button_minus.addEventListener('click', async () => {
          const total = await this.ensembleManager.getTraceCount()
          await this.selectByHand(getBroadcastValue(numberForDisplay, total, '-'), total)
      })

      const button_plus = document.querySelector('#spacewalk_trace_select_button_plus')
      button_plus.addEventListener('click', async () => {
          const total = await this.ensembleManager.getTraceCount()
          await this.selectByHand(getBroadcastValue(numberForDisplay, total, '+'), total)
      });


      SpacewalkEventBus.globalBus.subscribe('DidLoadEnsembleFile', this)

  }

    async selectByHand(number, total) {
        if (numberForDisplay !== number) {
            await broadcastTraceSelection(this.input, number, total, this.ensembleManager)
            this.onHandChange({ type: 'trace', index: number - 1 })
        }
    }

    // Show a trace the Room chose. Rejects if the ensemble has no such trace.
    async selectTrace(index) {
        const total = await this.ensembleManager.getTraceCount()
        if (!(index >= 0 && index < total)) {
            throw new Error(`This ensemble has no trace ${ index }; it has ${ total }.`)
        }
        await broadcastTraceSelection(this.input, index + 1, total, this.ensembleManager)
    }

    receiveEvent({ type, data }) {
        if ("DidLoadEnsembleFile" === type) {

            (async () => {
                const total = await this.ensembleManager.getTraceCount()
                numberForDisplay = 1 + data.initialIndex
                this.input.value = getDisplayString(numberForDisplay, total)
            })()

        }
    }
}

function getDisplayString(number, total) {
    return `${ StringUtils.numberFormatter(number) } of ${ StringUtils.numberFormatter(total) }`
}

function getBroadcastValue(number, total, incrementOrDecrement) {

    if ('-' === incrementOrDecrement) {
        return clamp(number - 1, 1, total)
    } else if ('+' === incrementOrDecrement) {
        return clamp(number + 1, 1, total)
    } else {
        return clamp(number, 1, total)
    }

}
async function broadcastTraceSelection(input, number, total, ensembleManager) {

    if (numberForDisplay !== number) {
        console.log(`TraceSelect. Will change number from ${StringUtils.numberFormatter(numberForDisplay)} to ${StringUtils.numberFormatter(number)}`)

        numberForDisplay = number

        input.value = getDisplayString(numberForDisplay, total)

        const index = numberForDisplay - 1

        ensembleManager.currentTrace = await ensembleManager.createTrace(index)
        ensembleManager.currentIndex = index

        SpacewalkEventBus.globalBus.post({type: "DidSelectTrace", data: {trace: ensembleManager.currentTrace}})
    }
}

export default TraceSelector
