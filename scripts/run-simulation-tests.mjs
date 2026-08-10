import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const HOST = '127.0.0.1'
const PORT = 4173
const BASE_URL = `http://${HOST}:${PORT}`
const OUTPUT_DIR = path.resolve('simulation-results/latest')

const scenarios = [
  {
    name: 'straight',
    label: 'STRAIGHT',
    timeoutMs: 20_000,
    expected: { plannedChecks: 19, speedPassed: 19, coursePassed: 19 },
  },
  {
    name: 'variable-speed',
    label: 'VARIABLE SPEED',
    timeoutMs: 25_000,
    expected: { plannedChecks: 39, speedPassed: 39, coursePassed: 39 },
  },
  {
    name: 'variable-course',
    label: 'VARIABLE COURSE',
    timeoutMs: 25_000,
    expected: { plannedChecks: 39, speedPassed: 39, coursePassed: 39 },
    stableCheckpoints: [9, 57, 117],
  },
]

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function prepareOutputDirectory() {
  await fs.rm(OUTPUT_DIR, { recursive: true, force: true })
  await fs.mkdir(OUTPUT_DIR, { recursive: true })
}

function startVite() {
  const server = spawn('npm', [
    'run',
    'dev:simulation',
    '--',
    '--host',
    HOST,
    '--port',
    String(PORT),
    '--strictPort',
  ], {
    stdio: 'pipe',
  })
  const output = []
  server.stdout.on('data', (chunk) => output.push(chunk.toString()))
  server.stderr.on('data', (chunk) => output.push(chunk.toString()))
  server.simulationOutput = output
  return server
}

async function waitForServer(server) {
  const timeoutAt = Date.now() + 10_000

  while (Date.now() < timeoutAt) {
    if (server.exitCode !== null) {
      throw new Error(`Vite stopped before becoming ready (exit code ${server.exitCode}):\n${server.simulationOutput.join('').trim()}`)
    }

    try {
      const response = await fetch(BASE_URL)
      if (response.ok) {
        return
      }
    } catch {
      // Vite has not started listening yet.
    }

    await sleep(100)
  }

  throw new Error(`Timed out waiting for Vite at ${BASE_URL}`)
}

async function stopVite(server) {
  if (server.exitCode !== null) {
    return
  }

  const stopped = new Promise((resolve) => server.once('exit', resolve))
  server.kill('SIGTERM')
  const stoppedGracefully = await Promise.race([
    stopped.then(() => true),
    sleep(2_000).then(() => false),
  ])

  if (!stoppedGracefully && server.exitCode === null) {
    server.kill('SIGKILL')
    await stopped
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, received ${actual}`)
  }
}

function validateReport(report, scenario) {
  assertEqual(report.scenario, scenario.name, `${scenario.label} scenario`)
  assertEqual(report.plannedChecks, scenario.expected.plannedChecks, `${scenario.label} planned checks`)
  assertEqual(report.completedChecks, scenario.expected.plannedChecks, `${scenario.label} completed checks`)
  assertEqual(report.missingChecks, 0, `${scenario.label} missing checks`)
  assertEqual(report.speedChecks, scenario.expected.plannedChecks, `${scenario.label} speed checks`)
  assertEqual(report.speedPassed, scenario.expected.speedPassed, `${scenario.label} speed passed`)
  assertEqual(report.courseChecks, scenario.expected.plannedChecks, `${scenario.label} course checks`)
  assertEqual(report.coursePassed, scenario.expected.coursePassed, `${scenario.label} course passed`)

  const failedCheck = report.checks.find((check) => !check.overallPassed)
  if (failedCheck) {
    throw new Error(`${scenario.label} failed check: ${JSON.stringify({
      elapsedTimeSeconds: failedCheck.elapsedTimeSeconds,
      targetCourseDegrees: failedCheck.targetCourseDegrees,
      groundTruthCourseDegrees: failedCheck.groundTruthCourseDegrees,
      gpsReportedCourseDegrees: failedCheck.gpsReportedCourseDegrees,
      appCourseDegrees: failedCheck.appCourseDegrees,
      courseErrorDegrees: failedCheck.courseErrorDegrees,
      coursePassed: failedCheck.coursePassed,
    })}`)
  }

  assertEqual(report.overallPassed, true, `${scenario.label} overall result`)

  for (const elapsedTimeSeconds of scenario.stableCheckpoints ?? []) {
    const check = report.checks.find((candidate) => candidate.elapsedTimeSeconds === elapsedTimeSeconds)
    if (!check) {
      throw new Error(`${scenario.label} stable checkpoint t=${elapsedTimeSeconds}: check not found`)
    }

    if (check.courseErrorDegrees === null || check.courseErrorDegrees > 1) {
      throw new Error(`${scenario.label} stable checkpoint failed: ${JSON.stringify({
        elapsedTimeSeconds,
        targetCourseDegrees: check.targetCourseDegrees,
        groundTruthCourseDegrees: check.groundTruthCourseDegrees,
        gpsReportedCourseDegrees: check.gpsReportedCourseDegrees,
        appCourseDegrees: check.appCourseDegrees,
        courseErrorDegrees: check.courseErrorDegrees,
      })}`)
    }
  }
}

async function validateDashboard(page, scenario) {
  const speed = page.getByLabel('Fart').locator('.metric-value')
  const course = page.getByLabel('Riktning').locator('.metric-value')

  if (scenario.name === 'straight') {
    assertEqual(await speed.textContent(), '6,0', 'STRAIGHT dashboard speed')
  } else if (scenario.name === 'variable-course') {
    const speedText = (await speed.textContent())?.trim() ?? ''
    if (speedText === '--' || !/^\d+(,\d+)?$/.test(speedText)) {
      throw new Error(`VARIABLE COURSE dashboard speed: expected a numeric value, received ${JSON.stringify(speedText)}`)
    }
  } else {
    const speedText = (await speed.textContent())?.trim() ?? ''
    if (speedText === '--' || !/^\d+(,\d+)?$/.test(speedText)) {
      throw new Error(`VARIABLE SPEED dashboard speed: expected a numeric value, received ${JSON.stringify(speedText)}`)
    }
  }

  assertEqual(await course.textContent(), scenario.name === 'variable-course' ? '350°' : '000°', `${scenario.label} dashboard course`)
}

async function runScenario(browser, scenario) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await context.newPage()

  try {
    const startedAt = Date.now()
    await page.goto(`${BASE_URL}/?simulation=${scenario.name}&simulationRate=10`, { waitUntil: 'networkidle' })
    await page.getByLabel('Fart').waitFor({ state: 'visible', timeout: 10_000 })
    await page.waitForFunction(
      () => {
        const report = window.__SAILRACE_SIMULATION_REPORT__
        return report !== undefined && report.completedChecks === report.plannedChecks
      },
      undefined,
      { timeout: scenario.timeoutMs },
    )

    const report = await page.evaluate(() => window.__SAILRACE_SIMULATION_REPORT__)
    validateReport(report, scenario)
    await validateDashboard(page, scenario)
    await fs.writeFile(path.join(OUTPUT_DIR, `${scenario.name}.json`), `${JSON.stringify(report, null, 2)}\n`)
    return { report, durationMs: Date.now() - startedAt }
  } catch (error) {
    await page.screenshot({ path: path.join(OUTPUT_DIR, `${scenario.name}-failure.png`), fullPage: true })
    throw error
  } finally {
    await context.close()
  }
}

function printScenarioSummary(scenario, report, durationMs) {
  console.log(`\n${scenario.label}`)
  console.log(`Speed:   ${report.speedPassed}/${report.speedChecks} PASS`)
  console.log(`Course:  ${report.coursePassed}/${report.courseChecks} PASS`)
  console.log(`Speed error:  mean ${report.meanSpeedErrorKnots?.toFixed(4) ?? '--'}, max ${report.maxSpeedErrorKnots?.toFixed(4) ?? '--'} kn`)
  console.log(`Course error: mean ${report.meanCourseErrorDegrees?.toFixed(4) ?? '--'}, max ${report.maxCourseErrorDegrees?.toFixed(4) ?? '--'}°`)
  console.log(`Wall-clock: ${(durationMs / 1_000).toFixed(2)} s`)
  console.log('Result:  PASS')
}

async function run() {
  await prepareOutputDirectory()
  const vite = startVite()
  let browser

  try {
    await waitForServer(vite)
    browser = await chromium.launch({ headless: true })
    const results = []

    for (const scenario of scenarios) {
      const result = await runScenario(browser, scenario)
      results.push(result)
      printScenarioSummary(scenario, result.report, result.durationMs)
    }

    const summary = {
      overallPassed: results.every(({ report }) => report.overallPassed),
      scenarios: results.map(({ report, durationMs }) => ({
        scenario: report.scenario,
        plannedChecks: report.plannedChecks,
        completedChecks: report.completedChecks,
        speedPassed: report.speedPassed,
        coursePassed: report.coursePassed,
        overallPassed: report.overallPassed,
        wallClockDurationMs: durationMs,
      })),
    }
    await fs.writeFile(path.join(OUTPUT_DIR, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`)
    console.log('\nSIMULATION SUITE: PASS')
  } finally {
    await browser?.close()
    await stopVite(vite)
  }
}

run().catch((error) => {
  console.error(`\nSIMULATION SUITE: FAIL\n${error instanceof Error ? error.message : error}`)
  process.exitCode = 1
})
