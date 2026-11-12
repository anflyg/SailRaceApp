// Exercise the shared instrument hook across view changes using synthetic samples.
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { chromium } from 'playwright'

const server = await createServer({ server: { host: '127.0.0.1', port: 5191, strictPort: true } })
let browser
try {
  await server.listen()
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  await page.clock.install({ time: new Date('2026-01-01T12:00:00Z') })
  await page.goto('http://127.0.0.1:5191/')
  await page.evaluate(async () => {
    const { default: React } = await import('/node_modules/.vite/deps/react.js')
    const { default: { createRoot } } = await import('/node_modules/.vite/deps/react-dom_client.js')
    const { useWindShiftInstrumentOutput } = await import('/src/features/race/WindShiftInstruments.tsx')
    const measurement = () => ({ headingDegrees: 180, selectedHeadingDegrees: 180, selectedHeadingSource: 'back-vector-row', sampleCount: 40, referenceFrame: 'true-north', quality: 'good', accuracyDegrees: 2, spreadDegrees: 1, nativeDebug: null })
    let props = { visible: true, raceId: 'race-1', gun: null, heading: 135, measurement: measurement() }
    const container = document.createElement('div')
    container.id = 'wind-test'
    document.body.append(container)
    const root = createRoot(container)
    function App(p) {
      const now = Date.now()
      const course = { points: { startA: null, startB: null, kryss1: null, lans1: null }, windHeadingDegrees: 180, windMeasurement: p.measurement }
      const gps = { courseReliable: true, speedKnots: 6, displayCourseDegrees: p.heading, timestamp: now, presentationTimestamp: now }
      const result = useWindShiftInstrumentOutput(course, gps, 90, p.gun, p.raceId)
      return React.createElement('div', { 'data-output': JSON.stringify({ position: result.scalePositionDegrees, phase: result.state.phase, referenced: result.isReferenced, lift: result.liftDots }) }, p.visible ? 'Sailing' : 'Course')
    }
    window.windTest = {
      update: patch => { props = { ...props, ...patch }; root.render(React.createElement(App, props)) },
      remeasure: () => { props = { ...props, measurement: measurement() }; root.render(React.createElement(App, props)) },
    }
    window.windTest.update({})
  })
  const output = async () => JSON.parse(await page.locator('#wind-test [data-output]').getAttribute('data-output'))
  const update = patch => page.evaluate(value => window.windTest.update(value), patch)
  const tick = async () => { await page.clock.runFor(1000); await update({}) }
  await page.waitForFunction(() => JSON.parse(document.querySelector('#wind-test [data-output]').dataset.output).position === 0)
  for (let i = 0; i < 10; i++) await tick()
  assert.equal((await output()).phase, 'seeking')
  await update({ gun: await page.evaluate(() => Date.now()) })
  for (let i = 0; i < 15; i++) await tick()
  await update({ visible: false })
  for (let i = 0; i < 22; i++) await tick()
  await update({ visible: true })
  assert.equal((await output()).referenced, true, 'view change must not restart reference acquisition')
  await update({ heading: 145 })
  await tick()
  await page.waitForFunction(() => JSON.parse(document.querySelector('#wind-test [data-output]').dataset.output).position === 10)
  await update({ visible: false })
  await tick()
  await update({ visible: true })
  assert.equal((await output()).position, 10, 'view changes retain the marker')
  assert.equal((await output()).referenced, true, 'view changes retain the reference')
  await page.evaluate(() => window.windTest.remeasure())
  await page.waitForFunction(() => JSON.parse(document.querySelector('#wind-test [data-output]').dataset.output).position === 0)
  assert.equal((await output()).referenced, false, 'new measurement resets the reference')
  await update({ raceId: 'race-2', gun: null })
  for (let i = 0; i < 6; i++) await tick()
  assert.equal((await output()).position, 0, 'a new race starts at the measured wind')
  assert.equal((await output()).referenced, false, 'a new race waits for its gun')
  await update({ gun: await page.evaluate(() => Date.now() - 60_000), heading: 135 })
  for (let i = 0; i < 37; i++) await tick()
  assert.equal((await output()).referenced, true, 'resuming a race with a recorded gun reacquires its reference')
  await update({ gun: null })
  await tick()
  assert.equal((await output()).referenced, false, 'ending the race stops updates')
  console.log('Wind instrument cross-view and remeasurement checks passed')
} finally {
  await browser?.close()
  await server.close()
}
