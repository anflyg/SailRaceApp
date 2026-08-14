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
  {
    name: 'tack-course',
    label: 'TACK COURSE',
    timeoutMs: 20_000,
    expected: { plannedChecks: 19, speedPassed: 19 },
    measurementOnly: true,
  },
  {
    name: 'course-noise',
    label: 'COURSE NOISE',
    timeoutMs: 20_000,
    expected: { plannedChecks: 19, speedPassed: 19 },
    measurementOnly: true,
    measurement: 'course-noise',
  },
  {
    name: 'wind-vmg',
    label: 'WIND VMG',
    timeoutMs: 20_000,
    expected: { plannedChecks: 19, speedPassed: 19, coursePassed: 19, vmgPassed: 19 },
    vmgReferenceHeadingDegrees: 0,
  },
  {
    name: 'layline-candidate',
    label: 'LAYLINE CANDIDATE',
    timeoutMs: 15_000,
    expected: { plannedChecks: 7, speedPassed: 7, coursePassed: 7, laylinePassed: 7 },
    laylineCandidate: true,
  },
  {
    name: 'layline-warning',
    label: 'LAYLINE WARNING',
    timeoutMs: 55_000,
    simulationRate: 1,
    expected: { plannedChecks: 7, speedPassed: 7, coursePassed: 7 },
    laylineWarning: true,
  },
  {
    name: 'layline-reactive-tack',
    label: 'LAYLINE REACTIVE TACK',
    timeoutMs: 55_000,
    simulationRate: 1,
    expected: { plannedChecks: 13, speedPassed: 13, coursePassed: 13 },
    reactiveTack: true,
  },
  {
    name: 'upwind-to-k1',
    label: 'UPWIND TO K1',
    timeoutMs: 60_000,
    simulationRate: 1,
    expected: { plannedChecks: 15, speedPassed: 15, coursePassed: 15 },
    upwindToK1: true,
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

function getCourseErrorDegrees(expectedDegrees, actualDegrees) {
  const difference = ((actualDegrees - expectedDegrees + 540) % 360) - 180
  return Math.abs(difference)
}

function analyzeTackCourseReport(report) {
  const findCheck = (elapsedTimeSeconds) => report.checks.find((check) => check.elapsedTimeSeconds === elapsedTimeSeconds)
  const courseError = (check) => (
    check?.groundTruthCourseDegrees === null || check?.appCourseDegrees === null
      ? null
      : getCourseErrorDegrees(check.groundTruthCourseDegrees, check.appCourseDegrees)
  )
  const preTackCheck = findCheck(12)
  const finalCheck = findCheck(60)
  const postTackChecks = report.checks.filter((check) => check.elapsedTimeSeconds >= 21)
  const postTackErrors = postTackChecks.map(courseError).filter((error) => error !== null)
  const firstWithin = (maximumErrorDegrees) => postTackChecks.find((check) => {
    const error = courseError(check)
    return error !== null && error <= maximumErrorDegrees
  })
  const firstWithin5Degrees = firstWithin(5)
  const firstWithin2Degrees = firstWithin(2)
  const hasLongWayCourseError = report.checks
    .filter((check) => check.elapsedTimeSeconds >= 15)
    .some((check) => (
      check.appCourseDegrees !== null &&
      getCourseErrorDegrees(check.targetCourseDegrees, check.appCourseDegrees) > 90
    ))
  const preTackCourseErrorDegrees = courseError(preTackCheck)
  const finalCourseErrorDegrees = courseError(finalCheck)

  return {
    tackStartSeconds: 15,
    tackEndSeconds: 21,
    preTackCourseErrorDegrees,
    maxCourseErrorAfterTackDegrees: postTackErrors.length === 0 ? null : Math.max(...postTackErrors),
    firstWithin5DegreesSeconds: firstWithin5Degrees?.elapsedTimeSeconds ?? null,
    firstWithin5DegreesAfterTackSeconds: firstWithin5Degrees ? firstWithin5Degrees.elapsedTimeSeconds - 21 : null,
    firstWithin2DegreesSeconds: firstWithin2Degrees?.elapsedTimeSeconds ?? null,
    firstWithin2DegreesAfterTackSeconds: firstWithin2Degrees ? firstWithin2Degrees.elapsedTimeSeconds - 21 : null,
    finalCourseErrorDegrees,
    hasLongWayCourseError,
    measurementPassed:
      report.plannedChecks === 19 &&
      report.completedChecks === 19 &&
      report.missingChecks === 0 &&
      report.speedPassed === 19 &&
      report.checks.every((check) => check.appCourseDegrees !== null) &&
      preTackCourseErrorDegrees !== null && preTackCourseErrorDegrees <= 1 &&
      finalCourseErrorDegrees !== null && finalCourseErrorDegrees <= 1 &&
      firstWithin5Degrees !== undefined && firstWithin5Degrees.elapsedTimeSeconds - 21 <= 9 &&
      firstWithin2Degrees !== undefined && firstWithin2Degrees.elapsedTimeSeconds - 21 <= 12 &&
      !hasLongWayCourseError,
  }
}

function average(values) {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length
}

function maximum(values) {
  return values.length === 0 ? null : Math.max(...values)
}

function analyzeCourseNoiseReport(report) {
  const validChecks = report.checks.filter((check) => (
    check.groundTruthCourseDegrees !== null && check.appCourseDegrees !== null
  ))
  const rawGpsErrors = validChecks.map((check) => (
    getCourseErrorDegrees(check.groundTruthCourseDegrees, check.gpsReportedCourseDegrees)
  ))
  const appErrors = validChecks.map((check) => (
    getCourseErrorDegrees(check.groundTruthCourseDegrees, check.appCourseDegrees)
  ))
  const stepChanges = (values) => values.slice(1).map((value, index) => getCourseErrorDegrees(values[index], value))
  const rawGpsStepChanges = stepChanges(validChecks.map((check) => check.gpsReportedCourseDegrees))
  const appStepChanges = stepChanges(validChecks.map((check) => check.appCourseDegrees))
  const rawGpsMeanAbsoluteCourseErrorDegrees = average(rawGpsErrors)
  const appMeanAbsoluteCourseErrorDegrees = average(appErrors)
  const rawGpsMeanStepChangeDegrees = average(rawGpsStepChanges)
  const appMeanStepChangeDegrees = average(appStepChanges)
  const finalCourseErrorDegrees = appErrors.at(-1) ?? null
  const noisyGpsCheckCount = rawGpsErrors.filter((error) => error > Number.EPSILON).length

  const measurementPassed =
    report.plannedChecks === 19 &&
    report.completedChecks === 19 &&
    report.missingChecks === 0 &&
    report.speedPassed === 19 &&
    validChecks.length === 19 &&
    noisyGpsCheckCount >= 3 &&
    (maximum(rawGpsErrors) ?? Infinity) <= 5 &&
    finalCourseErrorDegrees !== null && finalCourseErrorDegrees <= 2

  return {
    rawGpsMeanAbsoluteCourseErrorDegrees,
    rawGpsMaxCourseErrorDegrees: maximum(rawGpsErrors),
    appMeanAbsoluteCourseErrorDegrees,
    appMaxCourseErrorDegrees: maximum(appErrors),
    rawGpsMeanStepChangeDegrees,
    rawGpsMaxStepChangeDegrees: maximum(rawGpsStepChanges),
    appMeanStepChangeDegrees,
    appMaxStepChangeDegrees: maximum(appStepChanges),
    meanErrorReductionRatio:
      rawGpsMeanAbsoluteCourseErrorDegrees && appMeanAbsoluteCourseErrorDegrees !== null
        ? appMeanAbsoluteCourseErrorDegrees / rawGpsMeanAbsoluteCourseErrorDegrees
        : null,
    meanJitterReductionRatio:
      rawGpsMeanStepChangeDegrees && appMeanStepChangeDegrees !== null
        ? appMeanStepChangeDegrees / rawGpsMeanStepChangeDegrees
        : null,
    finalCourseErrorDegrees,
    noisyGpsCheckCount,
    measurementPassed,
    regressionPassed:
      measurementPassed &&
      (appMeanAbsoluteCourseErrorDegrees ?? Infinity) <= 0.6 &&
      (maximum(appErrors) ?? Infinity) <= 1.3 &&
      (appMeanStepChangeDegrees ?? Infinity) <= 0.35 &&
      (maximum(appStepChanges) ?? Infinity) <= 0.9 &&
      (rawGpsMeanAbsoluteCourseErrorDegrees ?? 0) > 0 &&
      (appMeanAbsoluteCourseErrorDegrees ?? Infinity) / rawGpsMeanAbsoluteCourseErrorDegrees <= 0.2 &&
      (rawGpsMeanStepChangeDegrees ?? 0) > 0 &&
      (appMeanStepChangeDegrees ?? Infinity) / rawGpsMeanStepChangeDegrees <= 0.08 &&
      finalCourseErrorDegrees !== null && finalCourseErrorDegrees <= 1,
  }
}

function analyzeLaylineWarningEvents(events) {
  const normalized = events.filter((event, index) => index === 0 || event.label !== events[index - 1].label || event.value !== events[index - 1].value)
  const laylineEvents = normalized.filter((event) => event.label === 'LAYLINE')
  const countdownValues = laylineEvents.map((event) => event.value)
  const expected = ['10', '9', '8', '7', '6', '5', '4', '3', '2', '1', '0', '-1', '-2', '-3', '-4', '-5']
  const first = (value) => laylineEvents.find((event) => event.value === value)
  const first10 = first('10')
  const zero = first('0')
  const minus5 = first('-5')
  const cleared = normalized.find((event) => event.observedAtMs > (minus5?.observedAtMs ?? Infinity) && event.label === 'VMG Bana')
  const activationCount = normalized.reduce((count, event, index) => (
    event.label === 'LAYLINE' && normalized[index - 1]?.label !== 'LAYLINE' ? count + 1 : count
  ), 0)
  const secondsBetween = (start, end) => start && end ? (end.observedAtMs - start.observedAtMs) / 1000 : null
  const tenToMinus5Seconds = secondsBetween(first10, minus5)

  return {
    countdownValues,
    activationCount,
    first10ObservedAtMs: first10?.observedAtMs ?? null,
    zeroObservedAtMs: zero?.observedAtMs ?? null,
    minus5ObservedAtMs: minus5?.observedAtMs ?? null,
    clearedObservedAtMs: cleared?.observedAtMs ?? null,
    tenToZeroSeconds: secondsBetween(first10, zero),
    zeroToMinus5Seconds: secondsBetween(zero, minus5),
    tenToMinus5Seconds,
    minus5ToClearedSeconds: secondsBetween(minus5, cleared),
    clearedAfterMinus5: cleared !== undefined,
    warningPassed: JSON.stringify(countdownValues) === JSON.stringify(expected) &&
      activationCount === 1 &&
      cleared !== undefined &&
      tenToMinus5Seconds !== null && tenToMinus5Seconds >= 12 && tenToMinus5Seconds <= 17,
  }
}

function getCircularCourseError(expected, actual) {
  const difference = ((actual - expected + 540) % 360) - 180
  return Math.abs(difference)
}

function analyzeUpwindToK1({ report, reactiveTack, samples, events }) {
  const commandSample = reactiveTack?.sample ?? null
  const postTackChecks = report.checks.filter((check) => check.elapsedTimeSeconds >= (commandSample?.elapsedTimeSeconds ?? Infinity))
  const firstPhysicalPostTack = samples.find((sample) => sample.elapsedTimeSeconds > (commandSample?.elapsedTimeSeconds ?? Infinity) && getCircularCourseError(45, sample.groundTruthCourseDegrees) <= 1)
  const recovery5 = samples.find((sample) => sample.elapsedTimeSeconds >= (firstPhysicalPostTack?.elapsedTimeSeconds ?? Infinity) && sample.appCourseDegrees !== null && getCircularCourseError(45, sample.appCourseDegrees) <= 5)
  const recovery2 = samples.find((sample) => sample.elapsedTimeSeconds >= (firstPhysicalPostTack?.elapsedTimeSeconds ?? Infinity) && sample.appCourseDegrees !== null && getCircularCourseError(45, sample.appCourseDegrees) <= 2)
  const finalCheck = report.checks.at(-1)
  const distances = samples.map((sample) => ({ ...sample, distanceToK1Meters: Math.hypot(sample.localXmeters, sample.localYmeters - 89.6) }))
  const postCommand = distances.filter((sample) => sample.timestamp >= (commandSample?.timestamp ?? Infinity))
  const closest = postCommand.reduce((best, sample) => sample.distanceToK1Meters < best.distanceToK1Meters ? sample : best, postCommand[0])
  const laterPass = postCommand.some((sample) => sample.elapsedTimeSeconds > closest.elapsedTimeSeconds && sample.distanceToK1Meters > closest.distanceToK1Meters + 3)
  const warningClearedIndex = events.findIndex((event) => event.label === 'VMG Bana' && event.observedAtMs > (reactiveTack?.zeroObservedAtMs ?? 0))
  const warningRetriggered = warningClearedIndex >= 0 && events.slice(warningClearedIndex + 1).some((event) => event.label === 'LAYLINE')
  const analysis = {
    zeroObserved: events.some((event) => event.label === 'LAYLINE' && event.value === '0'),
    tackCommandCount: reactiveTack ? 1 : 0,
    reactionLatencyMs: reactiveTack ? reactiveTack.tackCommandIssuedAtMs - reactiveTack.zeroObservedAtMs : null,
    simulationElapsedSecondsAtCommand: commandSample?.elapsedTimeSeconds ?? null,
    localXmetersAtCommand: commandSample?.localXmeters ?? null,
    localYmetersAtCommand: commandSample?.localYmeters ?? null,
    distanceAtTackCommandMeters: commandSample ? Math.hypot(commandSample.localXmeters, commandSample.localYmeters - 89.6) : null,
    firstPhysicalPostTackElapsedSeconds: firstPhysicalPostTack?.elapsedTimeSeconds ?? null,
    firstWithin5DegreesAfterPhysicalTackSeconds: recovery5 && firstPhysicalPostTack ? recovery5.elapsedTimeSeconds - firstPhysicalPostTack.elapsedTimeSeconds : null,
    firstWithin2DegreesAfterPhysicalTackSeconds: recovery2 && firstPhysicalPostTack ? recovery2.elapsedTimeSeconds - firstPhysicalPostTack.elapsedTimeSeconds : null,
    finalCourseErrorDegrees: finalCheck?.appCourseDegrees === null || finalCheck?.appCourseDegrees === undefined ? null : getCircularCourseError(45, finalCheck.appCourseDegrees),
    hasLongWayCourseError: postTackChecks.some((check) => check.appCourseDegrees !== null && getCircularCourseError(45, check.appCourseDegrees) > 120),
    firstWithin6MetersElapsedSeconds: distances.find((sample) => sample.timestamp >= (commandSample?.timestamp ?? Infinity) && sample.distanceToK1Meters <= 6)?.elapsedTimeSeconds ?? null,
    closestApproachMeters: closest?.distanceToK1Meters ?? null,
    closestApproachElapsedSeconds: closest?.elapsedTimeSeconds ?? null,
    closestApproachLocalXmeters: closest?.localXmeters ?? null,
    closestApproachLocalYmeters: closest?.localYmeters ?? null,
    distanceAtEndMeters: distances.at(-1)?.distanceToK1Meters ?? null,
    warningCleared: warningClearedIndex >= 0,
    returnedToVmgBana: warningClearedIndex >= 0,
    warningRetriggered,
  }
  analysis.k1Reached = analysis.closestApproachMeters <= 6 && analysis.firstWithin6MetersElapsedSeconds !== null &&
    analysis.distanceAtTackCommandMeters - analysis.closestApproachMeters >= 30 && laterPass
  analysis.behaviorPassed = analysis.zeroObserved && analysis.tackCommandCount === 1 && analysis.reactionLatencyMs <= 150 &&
    analysis.firstPhysicalPostTackElapsedSeconds !== null && analysis.firstWithin5DegreesAfterPhysicalTackSeconds <= 9 &&
    analysis.firstWithin2DegreesAfterPhysicalTackSeconds <= 12 && analysis.finalCourseErrorDegrees <= 1 &&
    !analysis.hasLongWayCourseError && analysis.warningCleared && !analysis.warningRetriggered && analysis.k1Reached
  return analysis
}

function validateReport(report, scenario) {
  assertEqual(report.scenario, scenario.name, `${scenario.label} scenario`)
  assertEqual(report.plannedChecks, scenario.expected.plannedChecks, `${scenario.label} planned checks`)
  assertEqual(report.completedChecks, scenario.expected.plannedChecks, `${scenario.label} completed checks`)
  assertEqual(report.missingChecks, 0, `${scenario.label} missing checks`)
  assertEqual(report.speedChecks, scenario.expected.plannedChecks, `${scenario.label} speed checks`)
  assertEqual(report.speedPassed, scenario.expected.speedPassed, `${scenario.label} speed passed`)
  assertEqual(report.courseChecks, scenario.expected.plannedChecks, `${scenario.label} course checks`)

  if (scenario.vmgReferenceHeadingDegrees !== undefined) {
    assertEqual(report.vmgChecks, scenario.expected.plannedChecks, `${scenario.label} VMG checks`)
    assertEqual(report.vmgPassed, scenario.expected.vmgPassed, `${scenario.label} VMG passed`)
  }

  if (scenario.laylineCandidate) {
    assertEqual(report.laylineChecks, scenario.expected.plannedChecks, `${scenario.label} layline checks`)
    assertEqual(report.laylinePassed, scenario.expected.laylinePassed, `${scenario.label} layline passed`)
  }

  if (scenario.measurementOnly) {
    const analysis = scenario.measurement === 'course-noise'
      ? analyzeCourseNoiseReport(report)
      : analyzeTackCourseReport(report)
    const passed = scenario.measurement === 'course-noise'
      ? analysis.regressionPassed
      : analysis.measurementPassed
    if (!passed) {
      throw new Error(`${scenario.label} measurement failed: ${JSON.stringify(analysis)}`)
    }
    return analysis
  }

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

  if (scenario.laylineCandidate) {
    const checkAt15 = report.checks.find((check) => check.elapsedTimeSeconds === 15)
    if (!checkAt15 ||
      checkAt15.groundTruthTimeToTackSeconds === null ||
      checkAt15.appTimeToTackSeconds === null ||
      checkAt15.laylineTimeErrorSeconds === null ||
      checkAt15.groundTruthTimeToTackSeconds < 9.8 ||
      checkAt15.groundTruthTimeToTackSeconds > 10.6 ||
      checkAt15.appTimeToTackSeconds < 9.8 ||
      checkAt15.appTimeToTackSeconds > 10.6 ||
      checkAt15.laylineTimeErrorSeconds > 0.30) {
      throw new Error(`${scenario.label} t=15 check failed: ${JSON.stringify(checkAt15)}`)
    }
  }

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

  const speedText = await speed.textContent()
  const courseText = await course.textContent()

  if (scenario.name === 'straight' || scenario.name === 'tack-course' || scenario.name === 'course-noise' || scenario.name === 'wind-vmg' || scenario.name === 'layline-candidate' || scenario.name === 'layline-reactive-tack' || scenario.name === 'upwind-to-k1') {
    assertEqual(speedText, '6,0', `${scenario.label} dashboard speed`)
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

  if (scenario.name === 'course-noise') {
    const displayedCourseText = courseText?.trim() ?? ''
    const match = /^(\d{3})°$/.exec(displayedCourseText)
    if (!match || getCourseErrorDegrees(315, Number(match[1])) > 2) {
      throw new Error(`COURSE NOISE dashboard course: expected within 2° of 315°, received ${JSON.stringify(displayedCourseText)}`)
    }
    return { speed: speedText, course: courseText, velocity: null }
  }

  const expectedCourse = scenario.name === 'variable-course'
    ? '350°'
    : scenario.name === 'tack-course'
      ? '045°'
      : scenario.name === 'wind-vmg'
        ? '315°'
      : scenario.name === 'layline-candidate'
        ? '315°'
      : scenario.name === 'layline-warning'
        ? '315°'
      : scenario.name === 'layline-reactive-tack'
        ? '045°'
      : scenario.name === 'upwind-to-k1'
        ? '045°'
      : '000°'
  if (scenario.name === 'layline-reactive-tack' || scenario.name === 'upwind-to-k1') {
    const match = /^(\d{3})°$/.exec(courseText ?? '')
    if (!match || getCourseErrorDegrees(45, Number(match[1])) > 1) {
      throw new Error(`LAYLINE REACTIVE TACK dashboard course: expected within 1° of 045°, received ${JSON.stringify(courseText)}`)
    }
    return { speed: speedText, course: courseText, velocity: null }
  }
  assertEqual(courseText, expectedCourse, `${scenario.label} dashboard course`)

  if (scenario.name === 'wind-vmg') {
    const velocity = await page.getByLabel('VMG Vind').locator('.metric-value').textContent()
    assertEqual(velocity, '4,2', 'WIND VMG dashboard value')
    return { speed: speedText, course: courseText, velocity }
  }

  return { speed: speedText, course: courseText, velocity: null }
}

async function runScenario(browser, scenario) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await context.newPage()

  try {
    const startedAt = Date.now()
    await page.goto(`${BASE_URL}/?simulation=${scenario.name}&simulationRate=${scenario.simulationRate ?? 10}`, { waitUntil: 'networkidle' })
    await page.getByLabel('Fart').waitFor({ state: 'visible', timeout: 10_000 })
    if (scenario.laylineWarning || scenario.reactiveTack || scenario.upwindToK1) {
      await page.evaluate(() => {
        const box = document.querySelector('.velocity-made-good')
        const events = []
        let commanded = false
        const samples = new Map()
        const collectSample = () => {
          const sample = window.__SAILRACE_SIMULATION_CONTROL__?.currentSample()
          if (sample) {
            const courseText = document.querySelector('[aria-label="Riktning"] .metric-value')?.textContent?.trim() ?? ''
            const match = /^(\d{3})°$/.exec(courseText)
            samples.set(sample.timestamp, { ...sample, appCourseDegrees: match ? Number(match[1]) : null })
          }
        }
        collectSample()
        window.__SAILRACE_SIMULATION_SAMPLES__ = samples
        window.__SAILRACE_SIMULATION_SAMPLE_TIMER__ = setInterval(collectSample, 50)
        const record = () => {
          const event = {
          label: box?.getAttribute('aria-label') ?? '',
          value: box?.querySelector('.metric-value')?.textContent?.trim() ?? '',
          observedAtMs: performance.now(),
          }
          events.push(event)
          if (!commanded && event.label === 'LAYLINE' && event.value === '0' && window.__SAILRACE_SIMULATION_CONTROL__) {
            commanded = true
            window.__SAILRACE_SIMULATION_REACTIVE_TACK__ = { zeroObservedAtMs: event.observedAtMs, tackCommandIssuedAtMs: performance.now(), sample: window.__SAILRACE_SIMULATION_CONTROL__.currentSample() }
            if (window.__SAILRACE_SIMULATION_SCENARIO__ === 'layline-reactive-tack' || window.__SAILRACE_SIMULATION_SCENARIO__ === 'upwind-to-k1') {
              window.__SAILRACE_SIMULATION_CONTROL__.setCommandedCourseDegrees(45)
            }
          }
        }
        record()
        new MutationObserver(record).observe(box, { attributes: true, attributeFilter: ['aria-label'], childList: true, subtree: true, characterData: true })
        window.__SAILRACE_LAYLINE_UI_EVENTS__ = events
        window.__SAILRACE_SIMULATION_SCENARIO__ = location.search.includes('upwind-to-k1') ? 'upwind-to-k1' : 'layline-reactive-tack'
      })
    }
    await page.waitForFunction(
      () => {
        const report = window.__SAILRACE_SIMULATION_REPORT__
        return report !== undefined && report.completedChecks === report.plannedChecks
      },
      undefined,
      { timeout: scenario.timeoutMs },
    )

    let laylineWarningAnalysis = null
    if (scenario.laylineWarning) {
      await page.waitForFunction(() => window.__SAILRACE_LAYLINE_UI_EVENTS__?.some((event) => event.label === 'LAYLINE' && event.value === '-5'), undefined, { timeout: scenario.timeoutMs })
      await page.waitForFunction(() => {
        const events = window.__SAILRACE_LAYLINE_UI_EVENTS__ ?? []
        const minus5 = events.find((event) => event.label === 'LAYLINE' && event.value === '-5')
        return minus5 && document.querySelector('.velocity-made-good')?.getAttribute('aria-label') === 'VMG Bana'
      }, undefined, { timeout: 2_500 })
      await page.waitForTimeout(1_500)
      const events = await page.evaluate(() => window.__SAILRACE_LAYLINE_UI_EVENTS__)
      laylineWarningAnalysis = analyzeLaylineWarningEvents(events)
      if (!laylineWarningAnalysis.warningPassed) {
        throw new Error(`${scenario.label} DOM timeline failed: ${JSON.stringify(laylineWarningAnalysis)}`)
      }
    }
    if (scenario.reactiveTack || scenario.upwindToK1) {
      await page.waitForFunction(() => window.__SAILRACE_SIMULATION_REACTIVE_TACK__ !== undefined, undefined, { timeout: scenario.timeoutMs })
    }
    const report = await page.evaluate(() => window.__SAILRACE_SIMULATION_REPORT__)
    const measurementAnalysis = validateReport(report, scenario)
    const dashboard = await validateDashboard(page, scenario)
    await fs.writeFile(path.join(OUTPUT_DIR, `${scenario.name}.json`), `${JSON.stringify(report, null, 2)}\n`)
    const reactiveTack = scenario.reactiveTack || scenario.upwindToK1 ? await page.evaluate(() => window.__SAILRACE_SIMULATION_REACTIVE_TACK__) : null
    const samples = scenario.upwindToK1 ? await page.evaluate(() => [...(window.__SAILRACE_SIMULATION_SAMPLES__?.values() ?? [])]) : []
    const events = scenario.upwindToK1 ? await page.evaluate(() => window.__SAILRACE_LAYLINE_UI_EVENTS__ ?? []) : []
    const upwindToK1Analysis = scenario.upwindToK1 ? analyzeUpwindToK1({ report, reactiveTack, samples, events }) : null
    if (scenario.upwindToK1 && !upwindToK1Analysis.behaviorPassed) {
      throw new Error(`${scenario.label} behavior failed: ${JSON.stringify(upwindToK1Analysis)}`)
    }
    return { report, measurementAnalysis, laylineWarningAnalysis, reactiveTack, upwindToK1Analysis, dashboard, durationMs: Date.now() - startedAt }
  } catch (error) {
    await page.screenshot({ path: path.join(OUTPUT_DIR, `${scenario.name}-failure.png`), fullPage: true })
    throw error
  } finally {
    await context.close()
  }
}

function printScenarioSummary(scenario, report, durationMs, dashboard) {
  if (scenario.name === 'tack-course') {
    const analysis = analyzeTackCourseReport(report)
    console.log(`\n${scenario.label}`)
    console.log(`Speed:   ${report.speedPassed}/${report.speedChecks} PASS`)
    console.log(`Pre-tack error: ${analysis.preTackCourseErrorDegrees?.toFixed(4) ?? '--'}°`)
    console.log(`Max course error: ${analysis.maxCourseErrorAfterTackDegrees?.toFixed(4) ?? '--'}°`)
    console.log(`Within 5°: t=${analysis.firstWithin5DegreesSeconds ?? '--'} (${analysis.firstWithin5DegreesAfterTackSeconds ?? '--'} s after tack)`)
    console.log(`Within 2°: t=${analysis.firstWithin2DegreesSeconds ?? '--'} (${analysis.firstWithin2DegreesAfterTackSeconds ?? '--'} s after tack)`)
    console.log(`Final error: ${analysis.finalCourseErrorDegrees?.toFixed(4) ?? '--'}°`)
    console.log(`Wall-clock: ${(durationMs / 1_000).toFixed(2)} s`)
    console.log('Result:  PASS')
    return
  }

  if (scenario.name === 'course-noise') {
    const analysis = analyzeCourseNoiseReport(report)
    console.log(`\n${scenario.label}`)
    console.log(`Speed:   ${report.speedPassed}/${report.speedChecks} PASS`)
    console.log(`Raw GPS: mean error ${analysis.rawGpsMeanAbsoluteCourseErrorDegrees?.toFixed(4) ?? '--'}°, max ${analysis.rawGpsMaxCourseErrorDegrees?.toFixed(4) ?? '--'}°, mean step ${analysis.rawGpsMeanStepChangeDegrees?.toFixed(4) ?? '--'}°, max step ${analysis.rawGpsMaxStepChangeDegrees?.toFixed(4) ?? '--'}°`)
    console.log(`App display: mean error ${analysis.appMeanAbsoluteCourseErrorDegrees?.toFixed(4) ?? '--'}°, max ${analysis.appMaxCourseErrorDegrees?.toFixed(4) ?? '--'}°, mean step ${analysis.appMeanStepChangeDegrees?.toFixed(4) ?? '--'}°, max step ${analysis.appMaxStepChangeDegrees?.toFixed(4) ?? '--'}°`)
    console.log(`Error reduction ratio: ${analysis.meanErrorReductionRatio?.toFixed(4) ?? '--'}`)
    console.log(`Jitter reduction ratio: ${analysis.meanJitterReductionRatio?.toFixed(4) ?? '--'}`)
    console.log(`Final course error: ${analysis.finalCourseErrorDegrees?.toFixed(4) ?? '--'}°`)
    console.log(`Wall-clock: ${(durationMs / 1_000).toFixed(2)} s`)
    console.log('Result:  PASS')
    return
  }

  if (scenario.name === 'wind-vmg') {
    console.log(`\n${scenario.label}`)
    console.log(`Speed:   ${report.speedPassed}/${report.speedChecks} PASS`)
    console.log(`Course:  ${report.coursePassed}/${report.courseChecks} PASS`)
    console.log(`VMG:     ${report.vmgPassed}/${report.vmgChecks} PASS`)
    console.log(`Ground truth VMG: ${report.checks[0]?.groundTruthVmgKnots?.toFixed(4) ?? '--'} kn`)
    console.log(`VMG error: mean ${report.meanVmgErrorKnots?.toFixed(4) ?? '--'}, max ${report.maxVmgErrorKnots?.toFixed(4) ?? '--'} kn`)
    console.log(`DOM: Fart: ${dashboard.speed}, Riktning: ${dashboard.course}, VMG Vind: ${dashboard.velocity}`)
    console.log(`Wall-clock: ${(durationMs / 1_000).toFixed(2)} s`)
    console.log('Result:  PASS')
    return
  }

  if (scenario.name === 'layline-candidate') {
    const checkAt15 = report.checks.find((check) => check.elapsedTimeSeconds === 15)
    console.log(`\n${scenario.label}`)
    console.log(`Speed:    ${report.speedPassed}/${report.speedChecks} PASS`)
    console.log(`Course:   ${report.coursePassed}/${report.courseChecks} PASS`)
    console.log(`Layline:  ${report.laylinePassed}/${report.laylineChecks} PASS`)
    console.log(`Reference: ${report.checks[0]?.appLaylineReferenceSource ?? '--'} / ${(report.checks[0]?.appLaylineReferenceHeadingDegrees ?? 0).toFixed(0).padStart(3, '0')}°`)
    console.log(`t=15: Truth time ${checkAt15?.groundTruthTimeToTackSeconds?.toFixed(4) ?? '--'} s, App time ${checkAt15?.appTimeToTackSeconds?.toFixed(4) ?? '--'} s, Error ${checkAt15?.laylineTimeErrorSeconds?.toFixed(4) ?? '--'} s`)
    console.log(`Max time error: ${report.maxLaylineTimeErrorSeconds?.toFixed(4) ?? '--'} s`)
    console.log(`Max distance error: ${report.maxLaylineDistanceErrorMeters?.toFixed(4) ?? '--'} m`)
    console.log(`Variant: ${report.checks[0]?.groundTruthLaylineVariant ?? '--'} / ${report.checks[0]?.appLaylineVariant ?? '--'}`)
    console.log(`Post tack: ${(report.checks[0]?.groundTruthPostTackHeadingDegrees ?? 0).toFixed(0).padStart(3, '0')}° / ${(report.checks[0]?.appPostTackHeadingDegrees ?? 0).toFixed(0).padStart(3, '0')}°`)
    console.log(`DOM: Fart: ${dashboard.speed}, Riktning: ${dashboard.course}`)
    console.log(`Wall-clock: ${(durationMs / 1_000).toFixed(2)} s`)
    console.log('Result:  PASS')
    return
  }

  if (scenario.name === 'layline-warning') {
    const analysis = report.laylineWarningAnalysis
    console.log(`\n${scenario.label}`)
    console.log(`Speed:  ${report.speedPassed}/${report.speedChecks} PASS`)
    console.log(`Course: ${report.coursePassed}/${report.courseChecks} PASS`)
    console.log(`Countdown: ${analysis.countdownValues.join(' ')}`)
    console.log(`10 -> 0: ${analysis.tenToZeroSeconds?.toFixed(2) ?? '--'} s`)
    console.log(`0 -> -5: ${analysis.zeroToMinus5Seconds?.toFixed(2) ?? '--'} s`)
    console.log(`10 -> -5: ${analysis.tenToMinus5Seconds?.toFixed(2) ?? '--'} s`)
    console.log(`-5 -> clear: ${analysis.minus5ToClearedSeconds?.toFixed(2) ?? '--'} s`)
    console.log(`Activations: ${analysis.activationCount}`)
    console.log(`Returned to VMG Bana: ${analysis.clearedAfterMinus5 ? 'YES' : 'NO'}`)
    console.log(`Wall-clock: ${(durationMs / 1_000).toFixed(2)} s`)
    console.log('Result:  PASS')
    return
  }

  if (scenario.name === 'upwind-to-k1') {
    const analysis = report.upwindToK1Analysis
    console.log(`\n${scenario.label}`)
    console.log(`Speed: ${report.speedPassed}/${report.speedChecks} PASS`)
    console.log(`App decision:`)
    console.log(`LAYLINE 0 observed: ${analysis.zeroObserved ? 'YES' : 'NO'}`)
    console.log(`Simulated sailor:`)
    console.log(`Tack commands: ${analysis.tackCommandCount}`)
    console.log(`Reaction latency: ${analysis.reactionLatencyMs?.toFixed(1) ?? '--'} ms`)
    console.log(`Course:`)
    console.log(`Physical tack: 315° -> 045°`)
    console.log(`Within 5°: ${analysis.firstWithin5DegreesAfterPhysicalTackSeconds?.toFixed(2) ?? '--'} s`)
    console.log(`Within 2°: ${analysis.firstWithin2DegreesAfterPhysicalTackSeconds?.toFixed(2) ?? '--'} s`)
    console.log(`Final error: ${analysis.finalCourseErrorDegrees?.toFixed(4) ?? '--'}°`)
    console.log(`Long-way: ${analysis.hasLongWayCourseError ? 'YES' : 'NO'}`)
    console.log(`K1:`)
    console.log(`Distance at tack command: ${analysis.distanceAtTackCommandMeters?.toFixed(2) ?? '--'} m`)
    console.log(`First within 6 m: t=${analysis.firstWithin6MetersElapsedSeconds ?? '--'}`)
    console.log(`Closest approach: ${analysis.closestApproachMeters?.toFixed(2) ?? '--'} m`)
    console.log(`Closest position: x=${analysis.closestApproachLocalXmeters?.toFixed(2) ?? '--'}, y=${analysis.closestApproachLocalYmeters?.toFixed(2) ?? '--'}`)
    console.log(`Distance at end: ${analysis.distanceAtEndMeters?.toFixed(2) ?? '--'} m`)
    console.log(`Reached K1: ${analysis.k1Reached ? 'YES' : 'NO'}`)
    console.log(`Warning:`)
    console.log(`Cleared: ${analysis.warningCleared ? 'YES' : 'NO'}`)
    console.log(`VMG Bana returned: ${analysis.returnedToVmgBana ? 'YES' : 'NO'}`)
    console.log(`Retrigger: ${analysis.warningRetriggered ? 'YES' : 'NO'}`)
    console.log('Result: PASS')
    return
  }

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
      result.report.upwindToK1Analysis = result.upwindToK1Analysis
      results.push(result)
      printScenarioSummary(scenario, { ...result.report, laylineWarningAnalysis: result.laylineWarningAnalysis }, result.durationMs, result.dashboard)
    }

    const summary = {
      overallPassed: results.every(({ report, measurementAnalysis }) => (
        report.scenario === 'course-noise'
          ? measurementAnalysis?.regressionPassed
          : measurementAnalysis?.measurementPassed ?? report.overallPassed
      )),
      scenarios: results.map(({ report, measurementAnalysis, laylineWarningAnalysis, durationMs }) => ({
        scenario: report.scenario,
        plannedChecks: report.plannedChecks,
        completedChecks: report.completedChecks,
        speedPassed: report.speedPassed,
        coursePassed: report.coursePassed,
        overallPassed: report.overallPassed,
        wallClockDurationMs: durationMs,
        ...(measurementAnalysis ? { [report.scenario === 'tack-course' ? 'tackAnalysis' : 'courseNoiseAnalysis']: measurementAnalysis } : {}),
        ...(laylineWarningAnalysis ? { laylineWarningAnalysis } : {}),
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
