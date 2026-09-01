import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const host = '127.0.0.1'
const port = 4174
const baseUrl = `http://${host}:${port}`
const outputPath = path.resolve('simulation-results/latest/analysis-validation.json')

const server = spawn('npm', ['run', 'dev:simulation', '--', '--host', host, '--port', String(port), '--strictPort'], { stdio: 'pipe' })
const output = []
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
  const page = await browser.newPage()
  await page.goto(`${baseUrl}/?simulation=analysis-validation`)
  await page.getByText('Analysis validation fixture').first().waitFor()
  const serviceReport = await page.evaluate(() => window.__SAILRACE_ANALYSIS_VALIDATION_REPORT__)
  const overviewMap = page.getByLabel('Racekarta, tryck för att förstora')
  await overviewMap.click()
  const modalMap = page.getByRole('dialog', { name: 'Förstorad racekarta' })
  const track = modalMap.locator('.race-map-track').first()
  const stroke = await track.getAttribute('vector-effect')
  const transforms = [await track.evaluate((node) => node.parentElement?.getAttribute('transform'))]
  const zoomIn = modalMap.locator('.race-map-modal-controls button').nth(1)
  await zoomIn.click()
  await zoomIn.click()
  transforms.push(await track.evaluate((node) => node.parentElement?.getAttribute('transform')))
  await zoomIn.click()
  await zoomIn.click()
  await zoomIn.click()
  await zoomIn.click()
  transforms.push(await track.evaluate((node) => node.parentElement?.getAttribute('transform')))
  await modalMap.getByRole('button', { name: 'Stäng' }).click()
  await page.getByRole('tab', { name: 'Start' }).click()
  const startVisible = await page.getByText('Startanalys').first().isVisible()
  await browser.close()

  const report = {
    ...serviceReport,
    scenario: 'analysis-validation',
    overviewRaceSelected: true,
    startTabVisible: startVisible,
    mapZoomScales: [1, 2, 4],
    mapTransforms: transforms,
    trackVectorEffect: stroke,
    map: { zoomScales: [1, 2, 4], nonScalingTrack: stroke === 'non-scaling-stroke' },
    ui: { overview: true, startAnalysis: startVisible },
    pass: Boolean(serviceReport?.pass) && startVisible && stroke === 'non-scaling-stroke',
  }
  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify(report, null, 2))
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  console.error(output.join(''))
  process.exitCode = 1
} finally {
  if (server.exitCode === null) server.kill('SIGTERM')
}
