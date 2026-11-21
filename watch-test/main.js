import { registerPlugin } from '@capacitor/core'

const bridge = registerPlugin('WatchFeasibility')
const status = document.querySelector('#status')
const button = document.querySelector('#toggle')
let listener
async function setListening(enabled) {
  if (listener) { await listener.remove(); listener = undefined }
  if (enabled) {
    listener = await bridge.addListener('watchTest', async ({ id }) => {
      status.textContent = 'JavaScript callback ran'
      try { await bridge.confirm({ id }); status.textContent = 'JavaScript confirmed' }
      catch { status.textContent = 'Confirmation failed' }
    })
    status.textContent = 'Waiting for Watch test'
  } else status.textContent = 'Listener disabled'
  button.textContent = enabled ? 'Disable listener' : 'Enable listener'
}
button.addEventListener('click', () => { void setListening(!listener) })
void setListening(true).catch(() => { status.textContent = 'Test bridge unavailable' })
