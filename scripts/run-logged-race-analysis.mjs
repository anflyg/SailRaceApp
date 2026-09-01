import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const host = '127.0.0.1'
const port = 4175
const baseUrl = `http://${host}:${port}`
const outputPath = path.resolve('simulation-results/latest/logged-race-analysis.json')
const server = spawn('npm', ['run', 'dev:simulation', '--', '--host', host, '--port', String(port), '--strictPort'], { stdio: 'pipe' })
const output = []
let page
server.stdout.on('data', (chunk) => output.push(chunk.toString()))
server.stderr.on('data', (chunk) => output.push(chunk.toString()))

try {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    try {
      if ((await fetch(baseUrl)).ok) break
    } catch { /* server is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  const browser = await chromium.launch({ headless: true })
  page = await browser.newPage()
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('console', (message) => output.push(`[browser:${message.type()}] ${message.text()}`))
  await page.goto(`${baseUrl}/?simulation=logged-race-analysis`)
  await page.getByText('Logged race analysis fixture').first().waitFor({ state: 'attached', timeout: 10_000 })
  const serviceReport = await page.evaluate(() => window.__SAILRACE_LOGGED_RACE_ANALYSIS_REPORT__)
  const map = page.getByLabel('Racekarta, tryck för att förstora')
  const mapVisible = await map.isVisible()
  const stroke = await map.locator('.race-map-track').first().getAttribute('vector-effect')
  await page.getByRole('tab', { name: 'Start' }).click()
  const startVisible = await page.getByText('Startanalys').first().isVisible()
  const report = {
    ...serviceReport,
    browser: { loggedRaceExists: true, overview: mapVisible, trackPresent: Boolean(stroke), startAnalysis: startVisible, nonScalingStroke: stroke === 'non-scaling-stroke' },
    pageErrors,
    pass: Boolean(serviceReport?.pass) && mapVisible && Boolean(stroke) && startVisible && stroke === 'non-scaling-stroke' && pageErrors.length === 0,
  }
  await browser.close()
  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify(report, null, 2))
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  if (page) {
    console.error((await page.locator('body').innerText().catch(() => '')))
    console.error(await page.evaluate(() => ({ storage: localStorage.getItem('aster-race:race-storage:v1'), report: window.__SAILRACE_LOGGED_RACE_ANALYSIS_REPORT__ })))
  }
  console.error(output.join(''))
  process.exitCode = 1
} finally {
  if (server.exitCode === null) server.kill('SIGTERM')
}
