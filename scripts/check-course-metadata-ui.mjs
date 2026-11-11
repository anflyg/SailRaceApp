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
    return code.slice(0, code.indexOf(signature)) + `${signature}
  const outcome = window.__WIND_TEST_OUTCOME__ ?? 'good'
  const measurement: WindHeadingMeasurementResult = {
    headingDegrees: 0, selectedHeadingDegrees: 0, selectedHeadingSource: 'back-vector-row',
    sampleCount: 40, referenceFrame: 'true-north',
    quality: outcome === 'poor' ? 'poor' : outcome === 'unstable' ? 'unstable' : 'good',
    accuracyDegrees: outcome === 'poor' ? 54.4 : 2,
    spreadDegrees: outcome === 'poor' || outcome === 'unstable' ? 0.62 : 1,
    nativeDebug: null,
  }
  if (outcome === 'failed') throw new WindHeadingMeasurementError('failed', 'wind_measurement_failed')
  if (outcome === 'unstable') throw new WindHeadingMeasurementError('unstable', 'wind_measurement_unstable', measurement)
  return measurement
}`
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
  await page.evaluate(() => { window.__WIND_TEST_OUTCOME__ = 'poor' })
  await page.locator('.wind-arrow-button').click()
  await page.waitForFunction(id => {
    const race = JSON.parse(localStorage.getItem('aster-race:race-storage:v1')).racesById[id]
    return race.course?.startLine && race.course?.windDirectionDegrees === 0 && race.windMeasurement?.quality === 'poor'
  }, id)
  state = await snapshot()
  assert.equal(state.logger.activeRaceId, id)
  assert.deepEqual(state.races[id].samples.slice(0, prior.length), prior)
  assert.match(await page.locator('.course-wind-feedback').innerText(), /EJ GODKÄND FÖR VMG/)
  assert.match(await page.locator('.course-wind-feedback').innerText(), /Rapporterad noggrannhet 54,4°/)
  await page.evaluate(() => { window.__WIND_TEST_OUTCOME__ = 'poor' })
  await page.getByRole('button', { name: 'Mät igen' }).click()
  await page.waitForFunction(id => JSON.parse(localStorage.getItem('aster-race:race-storage:v1')).racesById[id].windMeasurement?.quality === 'poor', id)
  assert.match(await page.locator('.course-wind-feedback').innerText(), /EJ GODKÄND FÖR VMG/)
  state = await snapshot()
  const afterPoorStart = state.races[id].samples.length
  await advance(6)
  state = await snapshot()
  assert.ok(state.races[id].samples.slice(afterPoorStart).length > 0)
  assert.ok(state.races[id].samples.slice(afterPoorStart).every(sample => sample.vmgWindKnots === undefined), 'poor wind never produces wind VMG')

  await page.evaluate(() => { window.__WIND_TEST_OUTCOME__ = 'good' })
  await page.getByRole('button', { name: 'Mät igen' }).click()
  await page.waitForFunction(id => JSON.parse(localStorage.getItem('aster-race:race-storage:v1')).racesById[id].windMeasurement?.quality === 'good', id)
  assert.match(await page.locator('.course-wind-feedback').innerText(), /GODKÄND FÖR VMG/)
  assert.equal(await page.getByRole('button', { name: 'Mät igen' }).count(), 0)
  state = await snapshot()
  assert.equal(state.logger.activeRaceId, id)
  assert.deepEqual(state.races[id].samples.slice(0, prior.length), prior)
  const afterGoodStart = state.races[id].samples.length
  await advance(6)
  state = await snapshot()
  assert.ok(state.races[id].samples.slice(afterGoodStart).some(sample => typeof sample.vmgWindKnots === 'number'), 'accepted wind and GPS produce wind VMG')

  await page.locator('.wind-arrow-button').click() // Clear approved wind to begin a new independent measurement attempt.
  await page.waitForFunction(id => {
    const race = JSON.parse(localStorage.getItem('aster-race:race-storage:v1')).racesById[id]
    return !race.windMeasurement && race.course?.windDirectionDegrees === undefined
  }, id)
  await page.evaluate(() => { window.__WIND_TEST_OUTCOME__ = 'poor' })
  await page.getByRole('button', { name: 'Mät vind' }).click()
  await page.waitForFunction(id => JSON.parse(localStorage.getItem('aster-race:race-storage:v1')).racesById[id].windMeasurement?.quality === 'poor', id)
  assert.match(await page.locator('.course-wind-feedback').innerText(), /EJ GODKÄND FÖR VMG/)
  state = await snapshot()
  const afterSecondPoorStart = state.races[id].samples.length
  await advance(6)
  state = await snapshot()
  assert.ok(state.races[id].samples.slice(afterSecondPoorStart).every(sample => sample.vmgWindKnots === undefined), 'remeasured poor wind never produces wind VMG')

  await page.evaluate(() => { window.__WIND_TEST_OUTCOME__ = 'unstable' })
  await page.getByRole('button', { name: 'Mät igen' }).click()
  await page.waitForFunction(id => JSON.parse(localStorage.getItem('aster-race:race-storage:v1')).racesById[id].windMeasurement?.quality === 'unstable', id)
  assert.match(await page.locator('.course-wind-feedback').innerText(), /EJ GODKÄND FÖR VMG/)
  state = await snapshot()
  const afterUnstableStart = state.races[id].samples.length
  await advance(6)
  state = await snapshot()
  assert.ok(state.races[id].samples.slice(afterUnstableStart).every(sample => sample.vmgWindKnots === undefined), 'unstable wind never produces wind VMG')
  const beforeFailedAttempt = structuredClone(state.races[id].windMeasurement)
  await page.evaluate(() => { window.__WIND_TEST_OUTCOME__ = 'failed' })
  await page.getByRole('button', { name: 'Mät igen' }).click()
  await page.getByText('Kunde inte mäta vind').waitFor()
  state = await snapshot()
  assert.deepEqual(state.races[id].windMeasurement, beforeFailedAttempt, 'failed attempt retains the last saved rejected measurement')
  assert.match(await page.locator('.course-wind-feedback').innerText(), /EJ GODKÄND FÖR VMG/)
  const afterFailureStart = state.races[id].samples.length
  await advance(6)
  state = await snapshot()
  assert.ok(state.races[id].samples.slice(afterFailureStart).every(sample => sample.vmgWindKnots === undefined), 'retained rejected wind never produces wind VMG')

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

  // Check the real Course view at the requested phone sizes and larger root text.
  await page.evaluate(() => { window.__WIND_TEST_OUTCOME__ = 'good' })
  await page.getByRole('button', { name: 'Mät vind' }).click()
  await page.locator('.course-wind-feedback.approved').waitFor()
  const inspectLayout = () => page.evaluate(() => {
    const section = document.querySelector('.course-view')
    const sectionRect = section.getBoundingClientRect()
    const selectors = ['.course-mark.start-a', '.course-mark.start-b', '.wind-arrow-button', '.course-wind-feedback', '.clear-button']
    const targets = Object.fromEntries(selectors.map(selector => {
      const element = document.querySelector(selector)
      const rect = element.getBoundingClientRect()
      return [selector, {
        visible: rect.width > 0 && rect.height > 0,
        insideCourse: rect.left >= sectionRect.left && rect.right <= sectionRect.right && rect.top >= sectionRect.top && rect.bottom <= sectionRect.bottom,
        left: Math.round(rect.left), right: Math.round(rect.right), top: Math.round(rect.top), bottom: Math.round(rect.bottom),
        width: Math.round(rect.width), height: Math.round(rect.height),
      }]
    }))
    const remeasure = document.querySelector('.wind-remeasure-button')
    if (remeasure) targets['.wind-remeasure-button'] = { visible: true, insideCourse: (() => {
      const rect = remeasure.getBoundingClientRect()
      return rect.left >= sectionRect.left && rect.right <= sectionRect.right && rect.top >= sectionRect.top && rect.bottom <= sectionRect.bottom
    })(), width: Math.round(remeasure.getBoundingClientRect().width), height: Math.round(remeasure.getBoundingClientRect().height) }
    return {
      viewport: { width: innerWidth, height: innerHeight, rootFontSize: getComputedStyle(document.documentElement).fontSize },
      course: { left: Math.round(sectionRect.left), right: Math.round(sectionRect.right), top: Math.round(sectionRect.top), bottom: Math.round(sectionRect.bottom), width: Math.round(sectionRect.width), height: Math.round(sectionRect.height), scrollHeight: section.scrollHeight, clientHeight: section.clientHeight },
      targets,
    }
  })
  const assertLayout = async (layout, requireRemeasure = false) => {
    const topTargets = ['.course-mark.start-a', '.course-mark.start-b', '.wind-arrow-button']
    for (const selector of topTargets) {
      const target = layout.targets[selector]
      assert.ok(target.visible && target.insideCourse, `${selector} must remain visible and inside Course: ${JSON.stringify(layout)}`)
    }
    if (requireRemeasure) {
      assert.ok(layout.course.scrollHeight > layout.course.clientHeight, 'large text uses vertical scrolling instead of clipping')
      const overflowY = await page.locator('.course-view').evaluate(element => getComputedStyle(element).overflowY)
      assert.equal(overflowY, 'auto')
      assert.ok(layout.targets['.wind-remeasure-button'].height >= 44, 'remeasure touch target remains at least 44px')
      for (const selector of ['.course-wind-feedback', '.wind-remeasure-button', '.clear-button']) {
        const element = page.locator(selector)
        await element.scrollIntoViewIfNeeded()
        const reachable = await element.evaluate(target => {
          const viewport = target.closest('.course-view').getBoundingClientRect()
          const rect = target.getBoundingClientRect()
          return rect.top >= viewport.top && rect.bottom <= viewport.bottom && rect.left >= viewport.left && rect.right <= viewport.right
        })
        assert.ok(reachable, `${selector} must be reachable by scrolling`)
      }
      await page.locator('.course-schematic').scrollIntoViewIfNeeded()
    } else {
      assert.ok(layout.course.scrollHeight <= layout.course.clientHeight + 1, `Course content must fit at normal text size: ${JSON.stringify(layout)}`)
    }
  }
  await page.setViewportSize({ width: 390, height: 844 })
  const standardLayout = await inspectLayout()
  await assertLayout(standardLayout)
  await page.screenshot({ path: '/private/tmp/SailRaceApp-wind-feedback-390x844.png', fullPage: true })

  await page.locator('.wind-arrow-button').click() // Begin another isolated synthetic attempt.
  await page.getByRole('button', { name: 'Mät vind' }).waitFor()
  await page.evaluate(() => { window.__WIND_TEST_OUTCOME__ = 'poor' })
  await page.getByRole('button', { name: 'Mät vind' }).click()
  await page.locator('.course-wind-feedback.rejected').waitFor()
  await page.setViewportSize({ width: 360, height: 780 })
  await page.addStyleTag({ content: 'html { font-size: 28px !important; }' }) // Simulate enlarged system text in the web UI.
  const largeTextLayout = await inspectLayout()
  await page.screenshot({ path: '/private/tmp/SailRaceApp-wind-feedback-360x780-large-text.png', fullPage: true })
  await assertLayout(largeTextLayout, true)
  assert.deepEqual(errors, [])
  console.log(`Course metadata UI: PASS (synthetic sensors; no external requests)\n${JSON.stringify({ standardLayout, largeTextLayout })}`)
} finally {
  if (browser) await browser.close()
  await server.close()
}
