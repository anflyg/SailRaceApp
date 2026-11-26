// Synthetic presentation fixtures only; native motion/GPS requires device evidence.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createServer } from 'vite'
import { chromium } from 'playwright'
const out = process.env.PHASE1_SCREENSHOTS ?? '/private/tmp/phase1-screenshots'
await fs.mkdir(out, { recursive: true })
const server = await createServer({ server: { host: '127.0.0.1', port: 5193, strictPort: true } })
let browser
try {
  await server.listen()
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  for (const width of [320, 390, 430]) {
    for (const scale of [1, 1.4]) {
      await page.setViewportSize({ width, height: width === 320 ? 568 : 932 })
      await page.goto('http://127.0.0.1:5193/?manual=1&view=race')
      await page.locator('.speed-secondary-row').waitFor()
      await page.locator('.aster-race-splash').waitFor({ state: 'detached' })
      await page.evaluate(scale => { document.documentElement.style.fontSize = `${16 * scale}px` }, scale)
      const bounds = await page.evaluate(() => {
        const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height } }
        const style = getComputedStyle(document.querySelector('.speed-secondary-row'))
        return { roll: rect('.sailing-roll'), pitch: rect('.sailing-pitch'), caption: rect('.speed-caption'), speed: rect('.speed-with-attitude .metric-value'), dots: rect('.wind-tack-cues'), border: style.borderWidth, background: style.backgroundColor, scroll: document.documentElement.scrollWidth }
      })
      assert(bounds.roll.right <= bounds.caption.x && bounds.caption.right <= bounds.pitch.x)
      assert(bounds.roll.bottom <= bounds.speed.y && bounds.pitch.bottom <= bounds.speed.y)
      assert(bounds.speed.bottom <= bounds.dots.y)
      assert(bounds.roll.x >= 0 && bounds.pitch.right <= width && bounds.scroll <= width)
      assert.equal(bounds.border, '0px')
      assert.equal(bounds.background, 'rgba(0, 0, 0, 0)')
      await page.screenshot({ path: `${out}/sailing-${width}-${scale}.png`, fullPage: true })
    }
  }
  // Exercise actual Setup input validation/persistence and conservative capture.
  await page.goto('http://127.0.0.1:5193/')
  const distance = page.locator('.bow-distance-setting input')
  await distance.fill('4.2')
  await page.reload()
  await page.locator('.bow-distance-setting input').waitFor()
  assert.equal(await page.locator('.bow-distance-setting input').inputValue(), '4.2')
  await page.locator('.bow-distance-setting input').fill('16')
  await page.reload()
  assert.equal(await page.locator('.bow-distance-setting input').inputValue(), '4.2')
  assert(await page.locator('.setup-view > .course-status').evaluate(e => e.getBoundingClientRect().bottom <= e.nextElementSibling.getBoundingClientRect().top))
  await page.screenshot({ path: `${out}/setup-distance.png`, fullPage: true })
  // Mount Course and Start with fixed synthetic sensors to test input gates.
  await page.evaluate(async () => {
    const { default: React } = await import('/node_modules/.vite/deps/react.js')
    const { default: { createRoot } } = await import('/node_modules/.vite/deps/react-dom_client.js')
    const { CourseSetupView } = await import('/src/features/course/CourseSetupView.tsx')
    const { StartTimerView } = await import('/src/features/timer/StartTimerView.tsx')
    const { LanguageProvider } = await import('/src/i18n/LanguageContext.tsx')
    document.querySelector('#root').remove()
    const container = document.createElement('div'); container.className = 'app-shell'; document.body.append(container)
    const root = createRoot(container)
    const point = (x,y) => ({ latitude: y/111320, longitude: x/111320, quality: 'good', accuracyAtSet: 3 })
    const measurement = { qualityModel: 'core-motion-v1', headingDegrees: 0, selectedHeadingDegrees: 0, selectedHeadingSource: 'back-vector-row', sampleCount: 40, referenceFrame: 'true-north', quality: 'good', spreadDegrees: 1, nativeDebug: null }
    const course = { points: { startA: point(-10,20), startB: point(10,22), kryss1: null, lans1: null }, windHeadingDegrees: 0, windMeasurement: measurement }
    const gps = { status: 'watching', latitude: 0, longitude: 0, accuracyMeters: 3, timestamp: Date.now(), presentationTimestamp: Date.now(), courseReliable: true, courseDegrees: 0, speedKnots: 2 / .514444 }
    const noop = () => {}
    window.phase1 = (view, patch = {}) => root.render(React.createElement(LanguageProvider, { language: 'en', setLanguage: noop }, React.createElement('main', { className: 'app-panel' },
      view === 'course' ? React.createElement(CourseSetupView, { course: { ...course, ...patch }, gps, onToggleCoursePoint: noop, onWindHeadingChange: noop, onWindMeasurement: noop, onClearCourse: noop, gpsStatusMessage: null }) : React.createElement(StartTimerView, { course, gps, filteredGps: gps, heading: { degrees: 0, timestamp: Date.now() }, selectedMinutes: 1, onSelectedMinutesChange: noop, phoneToBowMeters: 4, ...patch }))))
    window.phase1('course')
  })
  await page.getByText('B end favored, 6°', { exact: false }).waitFor()
  await page.screenshot({ path: `${out}/course-advantage.png`, fullPage: true })
  await page.evaluate(() => window.phase1('course', { windHeadingDegrees: 90 }))
  assert.equal(await page.locator('.start-advantage').count(), 0)
  await page.evaluate(() => window.phase1('timer'))
  await page.locator('.timer-display').click()
  await page.locator('.start-metric-row').first().waitFor()
  assert.equal(await page.locator('.start-metric-row strong').first().textContent(), '9 s')
  await page.evaluate(() => window.phase1('timer', { heading: { degrees: null, timestamp: null } }))
  await page.waitForFunction(() => document.querySelector('.start-metric-row strong')?.textContent === '—')
  assert.equal(await page.locator('.start-metric-row strong').nth(1).textContent(), '—')
  await page.screenshot({ path: `${out}/start-heading-unavailable.png`, fullPage: true })
  assert.deepEqual(errors, [])
  console.log(`Race performance UI checks passed; screenshots: ${out}`)
} finally { await browser?.close(); await server.close() }
