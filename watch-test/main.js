import { registerPlugin } from '@capacitor/core'

const bridge = registerPlugin('WatchFeasibility')
const status = document.querySelector('#status')
const button = document.querySelector('#toggle')
const sync = document.querySelector('#sync')
const minutes = document.querySelector('#minutes')
function showSync(value) {
  const seconds = Math.ceil((value.remainingMs ?? 0) / 1000)
  if (value.presetSeconds) minutes.value = String(value.presetSeconds / 60)
  const acknowledgment = value.reachable && value.watchAckRevision === value.revision ? 'Watch recently confirmed this revision' : 'Watch state unconfirmed'
  sync.textContent = `Phone: ${value.state} ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} · Watch ${value.reachable ? 'reachable' : 'unreachable'} · ${acknowledgment}`
}
async function refreshSync() {
  try { showSync(await bridge.syncStatus()) } catch { sync.textContent = 'Countdown bridge unavailable' }
}
minutes.addEventListener('change', async () => {
  try { showSync(await bridge.syncAction({ action: 'preset', seconds: Number(minutes.value) * 60 })) }
  catch { status.textContent = 'Preset change failed' }
})
for (const action of ['start', 'pause']) {
  document.querySelector(`#${action}`).addEventListener('click', async () => {
    try {
      const result = await bridge.syncAction({ action, seconds: Number(minutes.value) * 60 })
      showSync(result)
      if (!result.accepted) status.textContent = 'Countdown command rejected'
    } catch { status.textContent = 'Countdown command failed' }
  })
}
void bridge.addListener('syncChanged', showSync)
void refreshSync()
setInterval(() => { void refreshSync() }, 1000) // local UI refresh; no Watch messages
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
