// Exercises the real UI and local logger with a fake clock and synthetic GPS.
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { chromium } from 'playwright'

const server = await createServer({ server: { host: '127.0.0.1', port: 5189, strictPort: true } })
let browser
try {
  await server.listen()
  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort())
  await context.addInitScript(() => {
    const initial = Date.now()
    const position = () => ({ timestamp: Date.now(), coords: {
      latitude: (Date.now() - initial) / 1000 * 3 / 111320, longitude: 0,
      accuracy: 2, speed: 3, heading: 0, altitude: null, altitudeAccuracy: null,
    } })
    Object.defineProperty(navigator, 'geolocation', { value: {
      getCurrentPosition: success => success(position()),
      watchPosition: success => { success(position()); return setInterval(() => success(position()), 1000) },
      clearWatch: id => clearInterval(id),
    } })
  })
  const page = await context.newPage()
  page.setDefaultTimeout(8000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.clock.install({ time: new Date('2026-01-01T12:00:00Z') })
  await page.goto('http://127.0.0.1:5189/')
  await page.clock.runFor(2000)
  await page.locator('.aster-race-splash').waitFor({ state: 'detached' })
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  const timer = page.locator('.timer-display')
  const start = () => timer.click()
  const choose = minutes => page.locator('.duration-button').filter({ hasText: String(minutes) }).click()
  const advance = seconds => page.clock.runFor(seconds * 1000)
  const stopButton = page.locator('.recording-stop-button')
  const recordingStatus = page.getByRole('status').filter({ hasText: 'Inspelning pågår' })
  assert.equal(await stopButton.count(), 0, 'stopped Start timer hides recording control')
  assert.equal(await recordingStatus.count(), 0, 'Start never shows recording status')
  const snapshot = () => page.evaluate(() => ({
    logger: JSON.parse(localStorage.getItem('aster-race:race-logger:v1')),
    races: JSON.parse(localStorage.getItem('aster-race:race-storage:v1')).racesById,
  }))

  await start()
  assert.equal(await stopButton.count(), 1, 'running countdown shows stop control')
  assert.equal(await recordingStatus.count(), 0, 'running Start shows no recording status')
  await advance(14)
  await start()
  assert.equal(await timer.innerText(), '4:46')
  assert.equal(await stopButton.count(), 0, 'paused countdown hides stop control')
  let state = await snapshot()
  const race1 = state.logger.activeRaceId
  const token1 = state.logger.countdownRevision
  assert.equal(state.logger.scheduledStartTime, undefined)
  const sampleCount = state.races[race1].samples.length
  assert.ok(sampleCount > 0)

  await start()
  assert.equal(await stopButton.count(), 1, 'resumed countdown shows stop control again')
  assert.equal(await recordingStatus.count(), 0, 'resumed Start still shows no recording status')
  state = await snapshot()
  assert.equal(state.logger.activeRaceId, race1)
  assert.ok(state.logger.countdownRevision > token1)
  await advance(5)
  await start()
  assert.equal(await stopButton.count(), 0, 'pausing again hides the stop control')
  assert.equal(await timer.innerText(), '4:41')
  await choose(4)
  assert.equal(await timer.innerText(), '4:00')
  await start()
  state = await snapshot()
  assert.equal(state.logger.activeRaceId, race1)
  assert.ok(state.races[race1].samples.length >= sampleCount)
  assert.equal(await page.locator('.countdown-blocked-status').count(), 0)
  await advance(2)
  await start()
  await choose(3)
  await start()
  assert.equal((await snapshot()).logger.activeRaceId, race1)
  await advance(2)
  await start()
  await choose(1)
  await start()
  await advance(60)
  state = await snapshot()
  assert.ok(state.races[race1].startGunTime)
  const gun1 = state.races[race1].startGunTime
  await start()
  await start()
  await advance(2)
  await start()
  state = await snapshot()
  assert.equal(state.logger.activeRaceId, race1)
  assert.equal(state.races[race1].startGunTime, gun1)
  await choose(1)
  await start()
  state = await snapshot()
  const race2 = state.logger.activeRaceId
  assert.notEqual(race2, race1)
  assert.ok(state.races[race1].endTime)
  assert.equal(Object.keys(state.races).length, 2)

  await timer.dispatchEvent('pointerdown')
  await page.clock.runFor(600)
  await timer.dispatchEvent('pointerup')
  await timer.dispatchEvent('click')
  state = await snapshot()
  assert.equal(await timer.innerText(), '1:00')
  assert.equal(state.logger.activeRaceId, race2)
  assert.equal(state.logger.scheduledStartTime, undefined)
  assert.equal(state.races[race2].endTime, undefined)
  await start()
  assert.equal((await snapshot()).logger.activeRaceId, race2)
  await advance(2)
  await start()
  assert.equal(await stopButton.count(), 0, 'paused countdown hides stop action')
  await start()
  assert.equal(await stopButton.count(), 1, 'resuming countdown restores stop action')
  page.once('dialog', dialog => dialog.dismiss())
  await page.locator('.recording-stop-button').click()
  assert.equal((await snapshot()).logger.activeRaceId, race2)
  page.once('dialog', dialog => dialog.accept())
  await page.locator('.recording-stop-button').click()
  state = await snapshot()
  assert.equal(state.logger.activeRaceId, null)
  assert.ok(state.races[race2].endTime)
  await start()
  await start()
  state = await snapshot()
  assert.notEqual(state.logger.activeRaceId, race2)
  assert.equal(Object.keys(state.races).length, 3)
  await start()
  assert.equal(await stopButton.count(), 0, 'pausing hides the Start control while recording remains active')
  await page.getByRole('button', { name: 'Analys', exact: true }).click()
  assert.equal(await page.locator('.recording-stop-button').count(), 1, 'Analysis keeps stop control while timer is paused')
  assert.equal(await page.getByRole('status').filter({ hasText: 'Inspelning pågår' }).count(), 1, 'Analysis keeps recording status')
  assert.deepEqual(errors, [])
  console.log('Start resynchronization UI: PASS (synthetic GPS; no external requests)')
  await context.close()
} finally {
  await browser?.close()
  await server.close()
}
