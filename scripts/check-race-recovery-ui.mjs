// Synthetic GPS only; no external requests or real race data.
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { chromium } from 'playwright'

const server = await createServer({ server: { host: '127.0.0.1', port: 5190, strictPort: true } })
let browser
try {
  await server.listen()
  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort())
  await context.addInitScript(() => {
    const initial = Date.now()
    const position = () => ({ timestamp: Date.now(), coords: { latitude: (Date.now() - initial) / 1000 * 3 / 111320,
      longitude: 0, accuracy: 2, speed: 3, heading: 0, altitude: null, altitudeAccuracy: null } })
    Object.defineProperty(navigator, 'geolocation', { value: {
      getCurrentPosition: success => success(position()),
      watchPosition: success => { success(position()); return setInterval(() => success(position()), 1000) },
      clearWatch: id => clearInterval(id),
    } })
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.clock.install({ time: new Date('2026-01-01T12:00:00Z') })
  const advance = seconds => page.clock.runFor(seconds * 1000)
  const navigate = name => page.getByRole('button', { name, exact: true }).click()
  const timer = page.locator('.timer-display')
  const stop = page.locator('.recording-stop-button')
  const endDialog = page.getByRole('dialog', { name: 'Avsluta race' })
  const recovery = page.getByRole('dialog', { name: 'Tidigare inspelning' })
  const finish = async () => { await stop.click(); await endDialog.getByRole('button', { name: 'Avsluta race' }).click() }
  const snapshot = () => page.evaluate(() => ({
    logger: JSON.parse(localStorage.getItem('aster-race:race-logger:v1') || '{"activeRaceId":null}'),
    races: JSON.parse(localStorage.getItem('aster-race:race-storage:v1') || '{"racesById":{}}').racesById,
  }))
  const reopen = async () => { await page.reload(); await advance(2); await page.locator('.aster-race-splash').waitFor({ state: 'detached' }); await recovery.waitFor({ state: 'visible' }) }

  await page.goto('http://127.0.0.1:5190/')
  await advance(12)
  let state = await snapshot()
  assert.equal(state.logger.activeRaceId, null)
  assert.equal(Object.keys(state.races).length, 0, 'GPS before countdown does not create a race')
  await navigate('Start')
  await timer.click()
  await advance(12)
  state = await snapshot()
  const first = state.logger.activeRaceId
  assert.ok(first)
  assert.equal(Object.keys(state.races).length, 1)
  const samplesBeforeRestart = state.races[first].samples.length
  assert.ok(samplesBeforeRestart > 0)
  // Synthetic saved setup mimics a course measured after recording began.
  await page.evaluate(id => {
    const key = 'aster-race:race-storage:v1'
    const storage = JSON.parse(localStorage.getItem(key))
    storage.racesById[id].course = { startLine: { port: { latitude: 0, longitude: 0 }, starboard: { latitude: 0, longitude: 0.001 } }, windDirectionDegrees: 0 }
    storage.racesById[id].windMeasurement = { headingDegrees: 0, selectedHeadingDegrees: 0, selectedHeadingSource: 'back-vector-row', sampleCount: 40, referenceFrame: 'true-north', quality: 'good', accuracyDegrees: 2, spreadDegrees: 1, nativeDebug: null }
    localStorage.setItem(key, JSON.stringify(storage))
  }, first)
  await reopen()
  await advance(20)
  state = await snapshot()
  assert.equal(state.logger.activeRaceId, first)
  assert.equal(state.races[first].samples.length, samplesBeforeRestart, 'recovery choice does not record GPS')
  assert.equal(state.logger.scheduledStartTime, undefined)
  const resumedAt = await page.evaluate(() => Date.now())
  await recovery.getByRole('button', { name: 'Fortsätt inspelning' }).click()
  await advance(6)
  state = await snapshot()
  assert.equal(state.logger.activeRaceId, first)
  assert.ok(state.races[first].samples.length > samplesBeforeRestart)
  assert.equal(state.races[first].course.windDirectionDegrees, 0)
  assert.equal(state.races[first].windMeasurement.quality, 'good')
  assert.ok(state.races[first].samples.slice(samplesBeforeRestart).some(sample => typeof sample.vmgWindKnots === 'number'), 'continued recording restores valid wind metadata')
  assert.ok(Date.parse(state.races[first].samples[samplesBeforeRestart].timestamp) > resumedAt, 'only GPS fixes after the recovery decision are recorded')
  await navigate('Start')
  assert.equal(await stop.count(), 1, 'stopped timer offers End race')
  await timer.click()
  assert.equal((await snapshot()).logger.activeRaceId, first)
  await advance(5)
  await timer.click()
  await page.locator('.duration-button').filter({ hasText: '4' }).click()
  await timer.click()
  assert.equal((await snapshot()).logger.activeRaceId, first, 'resynchronization retains race')
  await timer.click()
  assert.equal(await stop.count(), 1, 'paused timer offers End race')
  await navigate('Segling')
  assert.equal(await stop.count(), 1)
  for (const viewport of [{ width: 390, height: 844 }, { width: 360, height: 780 }]) {
    await page.setViewportSize(viewport)
    const box = await stop.boundingBox()
    assert.ok(box && box.height >= 44 && box.y >= 0 && box.y + box.height <= viewport.height, 'Sailing stop action fits the viewport')
  }
  await page.setViewportSize({ width: 390, height: 844 })
  const sailingCount = (await snapshot()).races[first].samples.length
  await advance(6)
  assert.ok((await snapshot()).races[first].samples.length > sailingCount, 'recording continues after switching to Sailing')
  await stop.click()
  await endDialog.getByRole('button', { name: 'Avbryt' }).click()
  assert.equal((await snapshot()).logger.activeRaceId, first)
  await finish()
  state = await snapshot()
  assert.equal(state.logger.activeRaceId, null)
  assert.ok(state.races[first].endTime)
  assert.ok(state.races[first].samples.length >= samplesBeforeRestart)
  await navigate('Start')
  await page.locator('.duration-button').filter({ hasText: '1' }).click()
  await timer.click()
  state = await snapshot()
  const second = state.logger.activeRaceId
  assert.notEqual(second, first)
  await advance(60)
  state = await snapshot()
  const gun = state.races[second].startGunTime
  assert.ok(gun)
  await page.evaluate(([id, source]) => {
    const key = 'aster-race:race-storage:v1'
    const storage = JSON.parse(localStorage.getItem(key))
    storage.racesById[id].course = storage.racesById[source].course
    storage.racesById[id].windMeasurement = storage.racesById[source].windMeasurement
    localStorage.setItem(key, JSON.stringify(storage))
  }, [second, first])
  const secondCount = state.races[second].samples.length
  await reopen()
  await advance(10)
  assert.equal((await snapshot()).races[second].samples.length, secondCount, 'post-gun recovery also waits')
  await recovery.getByRole('button', { name: 'Fortsätt inspelning' }).click()
  await advance(6)
  state = await snapshot()
  assert.equal(state.logger.activeRaceId, second, 'post-gun continuation keeps the race')
  assert.equal(state.races[second].startGunTime, gun)
  assert.equal(state.races[second].course.windDirectionDegrees, 0)
  assert.ok(state.races[second].samples.slice(secondCount).some(sample => typeof sample.vmgWindKnots === 'number'), 'post-gun continuation restores the saved wind reference')
  const continuedCount = state.races[second].samples.length
  assert.ok(continuedCount > secondCount)
  await reopen()
  await advance(10)
  assert.equal((await snapshot()).races[second].samples.length, continuedCount)
  await recovery.getByRole('button', { name: 'Avsluta och spara' }).click()
  await endDialog.getByRole('button', { name: 'Avbryt' }).click()
  assert.equal(await recovery.isVisible(), true, 'cancel returns to recovery decision')
  await recovery.getByRole('button', { name: 'Avsluta och spara' }).click()
  await endDialog.getByRole('button', { name: 'Avsluta race' }).click()
  state = await snapshot()
  assert.equal(state.logger.activeRaceId, null)
  assert.equal(state.races[second].startGunTime, gun)
  assert.equal(state.races[second].samples.length, continuedCount)
  assert.ok(state.races[second].endTime)
  await navigate('Start')
  await timer.click()
  await advance(6)
  state = await snapshot()
  const third = state.logger.activeRaceId
  assert.ok(third && third !== second)
  await timer.click()
  await navigate('Analys')
  const analysisCount = (await snapshot()).races[third].samples.length
  await advance(6)
  assert.ok((await snapshot()).races[third].samples.length > analysisCount, 'recording continues in Analysis')
  await finish()
  assert.equal((await snapshot()).logger.activeRaceId, null)
  assert.deepEqual(errors, [])
  console.log('Race recovery UI: PASS (synthetic GPS; no external requests)')
  await context.close()
} finally {
  await browser?.close()
  await server.close()
}
