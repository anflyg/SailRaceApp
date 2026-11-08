// Real AppShell and storage, with synthetic GPS and an injected test-only wind sensor.
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { chromium } from 'playwright'

const server = await createServer({
  server: { host: '127.0.0.1', port: 5191, strictPort: true },
  plugins: [{ name: 'synthetic-wind-test', enforce: 'pre', transform(code, id) {
    if (!id.endsWith('/src/services/sensors/windHeadingService.ts')) return
    const signature = 'export async function measureWindHeading(): Promise<WindHeadingMeasurementResult | null> {'
    assert.ok(code.includes(signature), 'wind test double targets the actual sensor entry point')
    return code.replace(signature, `${signature}\n  return { headingDegrees: 0, selectedHeadingDegrees: 0, selectedHeadingSource: 'back-vector-row', sampleCount: 40, referenceFrame: 'true-north', quality: 'good', accuracyDegrees: 2, spreadDegrees: 1, nativeDebug: null }`)
  } }],
})
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
  const nav = name => page.getByRole('button', { name, exact: true }).click()
  const snapshot = () => page.evaluate(() => ({
    logger: JSON.parse(localStorage.getItem('aster-race:race-logger:v1')),
    races: JSON.parse(localStorage.getItem('aster-race:race-storage:v1')).racesById,
  }))
  await page.goto('http://127.0.0.1:5191/')
  await advance(3)
  await page.locator('.aster-race-splash').waitFor({ state: 'detached' })
  await nav('Start')
  const timer = page.locator('.timer-display')
  await timer.click()
  await advance(12)
  await timer.click() // Pause so navigation is available; recording stays active.
  let state = await snapshot()
  const id = state.logger.activeRaceId
  const prior = state.races[id].samples
  assert.ok(prior.length > 0)
  assert.equal(state.races[id].course, undefined)
  await nav('Bana')
  await page.getByRole('button', { name: 'A', exact: true }).click()
  await advance(2)
  await page.getByRole('button', { name: 'B', exact: true }).click()
  await page.locator('.wind-arrow-button').click()
  await page.waitForFunction(id => {
    const race = JSON.parse(localStorage.getItem('aster-race:race-storage:v1')).racesById[id]
    return race.course?.startLine && race.course?.windDirectionDegrees === 0 && race.windMeasurement?.quality === 'good'
  }, id)
  state = await snapshot()
  assert.equal(state.logger.activeRaceId, id)
  assert.deepEqual(state.races[id].samples.slice(0, prior.length), prior)
  await advance(6)
  state = await snapshot()
  assert.ok(state.races[id].samples.slice(prior.length).some(sample => typeof sample.vmgWindKnots === 'number'), 'valid wind and GPS produce stored VMG')
  const lockedCourse = state.races[id].course
  const lockedWind = state.races[id].windMeasurement
  await nav('Start')
  await page.locator('.duration-button').filter({ hasText: '1' }).click()
  await timer.click()
  assert.equal((await snapshot()).logger.activeRaceId, id)
  await advance(60)
  state = await snapshot()
  assert.ok(state.races[id].startGunTime)
  await nav('Bana')
  await page.locator('.wind-arrow-button').click() // Clear after gun must not change saved reference.
  await page.waitForTimeout(100)
  state = await snapshot()
  assert.deepEqual(state.races[id].course, lockedCourse)
  assert.deepEqual(state.races[id].windMeasurement, lockedWind)
  assert.equal(state.logger.activeRaceId, id)
  assert.deepEqual(errors, [])
  console.log('Course metadata UI: PASS (synthetic sensors; no external requests)')
} finally {
  if (browser) await browser.close()
  await server.close()
}
