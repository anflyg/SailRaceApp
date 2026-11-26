// Synthetic integration of the real AppShell-owned hook; no sensor or storage writes.
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { chromium } from 'playwright'
const server = await createServer({ server: { host: '127.0.0.1', port: 5194, strictPort: true } })
let browser
try {
  await server.listen()
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto('http://127.0.0.1:5194/')
  await page.evaluate(async () => {
    const { default: React } = await import('/node_modules/.vite/deps/react.js')
    const { default: { createRoot } } = await import('/node_modules/.vite/deps/react-dom_client.js')
    const { useRaceVmgWind } = await import('/src/hooks/useRaceVmgWind.ts')
    const root = createRoot(document.body.appendChild(document.createElement('div')))
    const origin = { points: {}, windHeadingDegrees: 180, windMeasurement: {
      headingDegrees: 180, selectedHeadingDegrees: 180, selectedHeadingSource: 'back-vector-row',
      qualityModel: 'core-motion-v1', sampleCount: 40, referenceFrame: 'true-north', quality: 'good',
      accuracyDegrees: 2, spreadDegrees: 1, nativeDebug: null,
    } }
    let update
    function Harness() {
      const [input, setInput] = React.useState({ timestamp: Date.now(), hdg: 145, tab: 'race', alpha: 90 })
      update = setInput
      const gps = { timestamp: input.timestamp, courseReliable: true, courseDegrees: 190, speedKnots: 6 }
      const vmg = useRaceVmgWind('synthetic-race', origin, { degrees: input.hdg, timestamp: input.timestamp }, input.alpha, gps, true)
      window.hook = vmg
      return React.createElement('output', { id: 'vmg' }, String(vmg.value))
    }
    root.render(React.createElement(Harness))
    window.fixture = {
      begin: () => window.hook.begin('synthetic-race', Date.now(), origin),
      tick: (extra = {}) => update(s => ({ ...s, timestamp: Date.now(), ...extra })),
      background: () => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
        document.dispatchEvent(new Event('visibilitychange'))
      },
      foreground: () => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
        document.dispatchEvent(new Event('visibilitychange'))
      },
    }
  })
  await page.locator('#vmg').waitFor()
  await page.clock.install({ time: new Date('2026-11-26T12:00:00Z') })
  await page.evaluate(() => window.fixture.begin())
  const tick = async extra => {
    await page.clock.runFor(1000)
    await page.evaluate(extra => window.fixture.tick(extra), extra)
    await page.waitForTimeout(1)
  }
  for (let second = 0; second <= 36; second++) {
    await tick(second === 25 ? { tab: 'setup' } : {})
  }
  assert.equal(Number(await page.locator('#vmg').textContent()), 6, 'tab transition must preserve the 5+30 s window')
  await tick({ hdg: 155, tab: 'race' })
  assert.equal(Number(await page.locator('#vmg').textContent()), 6, 'steering cannot move accepted VMG')
  await tick({ alpha: 100 })
  assert.equal(Number(await page.locator('#vmg').textContent()), 6, 'alpha cannot rewrite accepted VMG')
  for (let i = 0; i < 25; i++) await tick({ hdg: 145 })
  await page.evaluate(() => window.fixture.background())
  await page.clock.fastForward(60000)
  await page.evaluate(() => window.fixture.foreground())
  for (let i = 0; i < 34; i++) await tick({ hdg: 145 })
  assert.equal(Number(await page.locator('#vmg').textContent()), 6, 'background must discard pending acquisition')
  for (let i = 0; i < 3; i++) await tick({ hdg: 145 })
  assert(Math.abs(Number(await page.locator('#vmg').textContent()) - 6 * Math.cos(5 * Math.PI / 180)) < 1e-9)
  await page.evaluate(() => window.hook.invalidate())
  await tick()
  assert.equal(await page.locator('#vmg').textContent(), 'null', 'Continue/End cannot infer a recovered reference')
  assert.deepEqual(errors, [])
  console.log('Passed: real hook acquisition, tabs, steering, alpha, background, foreground, recovery gate; no browser errors')
} finally {
  await browser?.close()
  await server.close()
}
