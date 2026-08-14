import { describe, expect, it } from 'vitest'
import { gpsReadingFromPosition } from '../hooks/useLiveGps'
import { createSimulatedGpsSource } from './simulatedGpsSource'
import { createSailingSimulator, type SailingSimulationSample } from './sailingSimulator'
import {
  NORTHBOUND_SIX_KNOTS_SCENARIO,
  NORTHBOUND_VARIABLE_COURSE_SCENARIO,
  NORTHBOUND_VARIABLE_SPEED_SCENARIO,
  WIND_VMG_SCENARIO,
  LAYLINE_CANDIDATE_SCENARIO,
} from './sailingSimulator.fixtures'
import { createSimulationValidator, getCourseErrorDegrees } from './simulationValidator'
import { calculateGroundTruthLaylineCandidate, LAYLINE_CANDIDATE_TARGET_LOCAL } from './groundTruthLayline'

const KNOTS_PER_METER_PER_SECOND = 1.943844
const timestampBase = 1_700_000_000_000

function sampleAt(elapsedTimeSeconds: number, overrides: Partial<SailingSimulationSample> = {}): SailingSimulationSample {
  return {
    elapsedTimeSeconds,
    timestamp: timestampBase + elapsedTimeSeconds * 1_000,
    localXmeters: 0,
    localYmeters: elapsedTimeSeconds * (6 / KNOTS_PER_METER_PER_SECOND),
    latitude: 59.3293,
    longitude: 18.0686,
    targetSpeedKnots: 6,
    groundTruthSpeedKnots: 6,
    targetCourseDegrees: 0,
    groundTruthCourseDegrees: 0,
    courseDegrees: 0,
    speedMetersPerSecond: 6 / KNOTS_PER_METER_PER_SECOND,
    accuracyMeters: 3,
    ...overrides,
  }
}

function appOutput(sample: SailingSimulationSample, overrides: {
  speedKnots?: number | null
  displayCourseDegrees?: number | null
  timestamp?: number | null
  presentationTimestamp?: number | null
} = {}) {
  return {
    speedKnots: 'speedKnots' in overrides ? overrides.speedKnots! : sample.groundTruthSpeedKnots,
    displayCourseDegrees: 'displayCourseDegrees' in overrides ? overrides.displayCourseDegrees! : sample.courseDegrees,
    timestamp: 'timestamp' in overrides ? overrides.timestamp! : sample.timestamp,
    presentationTimestamp: 'presentationTimestamp' in overrides ? overrides.presentationTimestamp! : sample.timestamp,
  }
}

function validator() {
  return createSimulationValidator({ scenario: 'straight' })
}

describe('simulation validator', () => {
  it('passes matching app presentation values and retains all speed levels', () => {
    const sample = sampleAt(6)
    const check = validator().observe(sample, appOutput(sample))

    expect(check).toMatchObject({
      targetSpeedKnots: 6,
      groundTruthSpeedKnots: 6,
      gpsReportedSpeedKnots: 6,
      appSpeedKnots: 6,
      speedErrorKnots: 0,
      speedPassed: true,
      coursePassed: true,
      overallPassed: true,
    })
  })

  it('fails speed and course values outside their tolerances', () => {
    const sample = sampleAt(6)
    const check = validator().observe(sample, appOutput(sample, {
      speedKnots: 6.2,
      displayCourseDegrees: 2,
    }))

    expect(check).toMatchObject({ speedPassed: false, coursePassed: false, overallPassed: false })
  })

  it('calculates the smallest course error across the 0/360 boundary', () => {
    const sample = sampleAt(6)
    const check = validator().observe(sample, appOutput(sample, { displayCourseDegrees: 359 }))

    expect(getCourseErrorDegrees(0, 359)).toBe(1)
    expect(check?.courseErrorDegrees).toBe(1)
    expect(check?.coursePassed).toBe(true)
  })

  it('starts at warm-up completion, runs every third simulated second and does not duplicate timestamps', () => {
    const simulationValidator = validator()
    const beforeWarmup = sampleAt(5)
    const first = sampleAt(6)
    const between = sampleAt(7)
    const second = sampleAt(9)

    expect(simulationValidator.observe(beforeWarmup, appOutput(beforeWarmup))).toBeNull()
    expect(simulationValidator.observe(first, appOutput(first))).not.toBeNull()
    expect(simulationValidator.observe(first, appOutput(first))).toBeNull()
    expect(simulationValidator.observe(between, appOutput(between))).toBeNull()
    expect(simulationValidator.observe(second, appOutput(second))).not.toBeNull()
    expect(simulationValidator.getReport().checks).toHaveLength(2)
  })

  it('plans 15 checks for upwind-to-k1', () => {
    const report = createSimulationValidator({ scenario: 'upwind-to-k1' }).getReport()
    expect(report.plannedChecks).toBe(15)
    expect(report.warmupSeconds).toBe(6)
    expect(report.validationIntervalSeconds).toBe(3)
    expect(report.tolerances.speedToleranceKnots).toBe(0.15)
  })

  it('waits for a presentation timestamp rather than comparing stale raw GPS output', () => {
    const simulationValidator = validator()
    const sample = sampleAt(6)

    expect(simulationValidator.observe(sample, appOutput(sample, {
      timestamp: sample.timestamp,
      presentationTimestamp: sample.timestamp - 1_000,
    }))).toBeNull()
    expect(simulationValidator.observe(sample, appOutput(sample))).not.toBeNull()
  })

  it('keeps a scheduled sample pending until a later presentation reaches its timestamp', () => {
    const simulationValidator = validator()
    const scheduledSample = sampleAt(6)
    const laterSimulatorSample = sampleAt(7)

    expect(simulationValidator.observe(scheduledSample, appOutput(scheduledSample, {
      presentationTimestamp: scheduledSample.timestamp - 1_000,
    }))).toBeNull()

    const check = simulationValidator.observe(laterSimulatorSample, appOutput(scheduledSample))
    expect(check).toMatchObject({ elapsedTimeSeconds: 6, timestamp: scheduledSample.timestamp })
    expect(simulationValidator.observe(sampleAt(8), appOutput(scheduledSample))).toBeNull()
    expect(simulationValidator.getReport().completedChecks).toBe(1)
  })

  it('does not validate a changed course against a stale presentation timestamp', () => {
    const simulationValidator = validator()
    const northbound = sampleAt(6, { courseDegrees: 0 })
    const eastbound = sampleAt(9, {
      courseDegrees: 90,
      targetCourseDegrees: 90,
      groundTruthCourseDegrees: 90,
    })
    const laterSample = sampleAt(10, { courseDegrees: 90 })

    simulationValidator.observe(northbound, appOutput(northbound))
    expect(simulationValidator.observe(eastbound, appOutput(northbound, {
      presentationTimestamp: northbound.timestamp,
      displayCourseDegrees: 0,
    }))).toBeNull()

    const check = simulationValidator.observe(laterSample, appOutput(eastbound, {
      displayCourseDegrees: 90,
    }))
    expect(check).toMatchObject({ elapsedTimeSeconds: 9, appCourseDegrees: 90, coursePassed: true })
  })

  it('produces the 19 planned checks from t=6 through t=60', () => {
    const simulationValidator = validator()

    for (let elapsedTimeSeconds = 0; elapsedTimeSeconds <= 60; elapsedTimeSeconds += 1) {
      const sample = sampleAt(elapsedTimeSeconds)
      simulationValidator.observe(sample, appOutput(sample))
    }

    const report = simulationValidator.getReport()
    expect(report.speedChecks).toBe(19)
    expect(report.courseChecks).toBe(19)
    expect(report.plannedChecks).toBe(19)
    expect(report.completedChecks).toBe(19)
    expect(report.missingChecks).toBe(0)
    expect(report.overallPassed).toBe(true)
    expect(simulationValidator.isComplete()).toBe(true)
  })

  it('uses variable-speed metadata with 39 planned checks from t=6 through t=120', () => {
    const simulationValidator = createSimulationValidator({ scenario: 'variable-speed' })
    const simulator = createSailingSimulator(NORTHBOUND_VARIABLE_SPEED_SCENARIO)

    for (let elapsedTimeSeconds = 0; elapsedTimeSeconds <= 120; elapsedTimeSeconds += 1) {
      const sample = elapsedTimeSeconds === 0 ? simulator.currentSample() : simulator.step()
      simulationValidator.observe(sample, appOutput(sample))
    }

    const report = simulationValidator.getReport()
    expect(report).toMatchObject({
      scenario: 'variable-speed',
      validationIntervalSeconds: 3,
      warmupSeconds: 6,
      plannedChecks: 39,
      completedChecks: 39,
      missingChecks: 0,
      speedChecks: 39,
      courseChecks: 39,
      overallPassed: true,
    })
  })

  it('uses variable-course metadata, derived course truth and 39 planned checks', () => {
    const simulationValidator = createSimulationValidator({ scenario: 'variable-course' })
    const simulator = createSailingSimulator(NORTHBOUND_VARIABLE_COURSE_SCENARIO)

    for (let elapsedTimeSeconds = 0; elapsedTimeSeconds <= 120; elapsedTimeSeconds += 1) {
      const sample = elapsedTimeSeconds === 0 ? simulator.currentSample() : simulator.step()
      simulationValidator.observe(sample, appOutput(sample))
    }

    const report = simulationValidator.getReport()
    const checkpoint = report.checks.find((check) => check.elapsedTimeSeconds === 117)
    expect(report).toMatchObject({
      scenario: 'variable-course',
      plannedChecks: 39,
      completedChecks: 39,
      missingChecks: 0,
      speedPassed: 39,
      coursePassed: 39,
      overallPassed: true,
      tolerances: { speedToleranceKnots: 0.15, courseToleranceDegrees: 6 },
    })
    expect(checkpoint?.courseErrorDegrees).toBeCloseTo(0, 10)
    expect(checkpoint?.targetCourseDegrees).toBeCloseTo(350, 10)
    expect(checkpoint?.groundTruthCourseDegrees).toBeCloseTo(350, 10)
    expect(checkpoint?.gpsReportedCourseDegrees).toBeCloseTo(350, 10)
    expect(checkpoint?.appCourseDegrees).toBeCloseTo(350, 10)
  })

  it('validates 19 independent VMG checks for wind-vmg without affecting scenarios without a reference', () => {
    const simulationValidator = createSimulationValidator({ scenario: 'wind-vmg' })
    const simulator = createSailingSimulator(WIND_VMG_SCENARIO)

    for (let elapsedTimeSeconds = 0; elapsedTimeSeconds <= 60; elapsedTimeSeconds += 1) {
      const sample = elapsedTimeSeconds === 0 ? simulator.currentSample() : simulator.step()
      simulationValidator.observe(sample, {
        ...appOutput(sample),
        vmgKnots: 6 * Math.cos((315 * Math.PI) / 180),
      })
    }

    const report = simulationValidator.getReport()
    expect(report).toMatchObject({
      scenario: 'wind-vmg',
      plannedChecks: 19,
      completedChecks: 19,
      missingChecks: 0,
      speedPassed: 19,
      coursePassed: 19,
      vmgChecks: 19,
      vmgPassed: 19,
      tolerances: { vmgToleranceKnots: 0.10 },
      overallPassed: true,
    })
    expect(report.checks[0]).toMatchObject({ referenceHeadingDegrees: 0, vmgPassed: true })
    expect(report.checks[0]?.groundTruthVmgKnots).toBeCloseTo(4.242640687, 8)
    expect(report.checks[0]?.appVmgKnots).toBeCloseTo(4.242640687, 8)

    const noVmgReport = validator().getReport()
    expect(noVmgReport).toMatchObject({ vmgChecks: 0, vmgPassed: 0, meanVmgErrorKnots: null })
  })

  it('fails a wind-vmg check outside the 0.10 kn VMG tolerance', () => {
    const sample = sampleAt(6, {
      targetCourseDegrees: 315,
      groundTruthCourseDegrees: 315,
      courseDegrees: 315,
    })
    const check = createSimulationValidator({ scenario: 'wind-vmg' }).observe(sample, {
      ...appOutput(sample, { displayCourseDegrees: 315 }),
      vmgKnots: 4.35,
    })

    expect(check).toMatchObject({ vmgErrorKnots: expect.closeTo(0.1073593128807141, 8), vmgPassed: false, overallPassed: false })
  })

  it('validates seven layline candidates against independent local truth', () => {
    const simulationValidator = createSimulationValidator({ scenario: 'layline-candidate' })
    const simulator = createSailingSimulator(LAYLINE_CANDIDATE_SCENARIO)

    for (let elapsedTimeSeconds = 0; elapsedTimeSeconds <= 24; elapsedTimeSeconds += 1) {
      const sample = elapsedTimeSeconds === 0 ? simulator.currentSample() : simulator.step()
      const truth = calculateGroundTruthLaylineCandidate({
        boat: { xMeters: sample.localXmeters, yMeters: sample.localYmeters },
        target: LAYLINE_CANDIDATE_TARGET_LOCAL,
        groundTruthCourseDegrees: sample.groundTruthCourseDegrees!,
        groundTruthSpeedKnots: sample.groundTruthSpeedKnots!,
        alphaDegrees: 90,
      })
      simulationValidator.observe(sample, {
        ...appOutput(sample),
        laylineObservation: {
          reference: { source: 'l1-k1', headingDegrees: 0 },
          movingTowardTarget: true,
          candidate: truth && {
            laylineVariant: truth.laylineVariant,
            postTackHeadingDegrees: truth.postTackHeadingDegrees,
            distanceToTackMeters: truth.distanceToTackMeters,
            timeToTackSeconds: truth.timeToTackSeconds,
          },
        },
      })
    }

    const report = simulationValidator.getReport()
    const checkAt15 = report.checks.find((check) => check.elapsedTimeSeconds === 15)
    expect(report).toMatchObject({
      plannedChecks: 7,
      completedChecks: 7,
      missingChecks: 0,
      speedPassed: 7,
      coursePassed: 7,
      laylineChecks: 7,
      laylinePassed: 7,
      overallPassed: true,
      tolerances: { laylineTimeToleranceSeconds: 0.30, laylineDistanceToleranceMeters: 1 },
    })
    expect(checkAt15).toMatchObject({
      groundTruthLaylineVariant: 'plus-alpha',
      appLaylineVariant: 'plus-alpha',
      groundTruthPostTackHeadingDegrees: 45,
      appPostTackHeadingDegrees: 45,
      laylinePassed: true,
    })
    expect(checkAt15?.groundTruthTimeToTackSeconds).toBeGreaterThanOrEqual(9.8)
    expect(checkAt15?.groundTruthTimeToTackSeconds).toBeLessThanOrEqual(10.6)
  })

  it('uses speed and course validation only for layline-warning', () => {
    const simulationValidator = createSimulationValidator({ scenario: 'layline-warning' })
    for (let second = 0; second <= 24; second += 1) {
      const sample = sampleAt(second, { targetCourseDegrees: 315, groundTruthCourseDegrees: 315, courseDegrees: 315 })
      simulationValidator.observe(sample, appOutput(sample, { displayCourseDegrees: 315 }))
    }
    expect(simulationValidator.getReport()).toMatchObject({
      plannedChecks: 7, completedChecks: 7, speedPassed: 7, coursePassed: 7,
      vmgChecks: 0, laylineChecks: 0, overallPassed: true,
    })
  })

  it('keeps target, ground-truth and GPS-reported course fields separate', () => {
    const sample = sampleAt(6, {
      targetCourseDegrees: 350,
      groundTruthCourseDegrees: 350,
      courseDegrees: 350,
    })
    const check = createSimulationValidator({ scenario: 'variable-course' }).observe(sample, appOutput(sample, {
      displayCourseDegrees: 349,
    }))

    expect(check).toMatchObject({
      targetCourseDegrees: 350,
      groundTruthCourseDegrees: 350,
      appCourseDegrees: 349,
      courseErrorDegrees: 1,
      coursePassed: true,
    })
  })

  it('keeps target, ground-truth, GPS-reported and app speed as separate report fields', () => {
    const simulator = createSailingSimulator(NORTHBOUND_VARIABLE_SPEED_SCENARIO)

    for (let second = 1; second <= 6; second += 1) {
      simulator.step()
    }

    const sample = simulator.currentSample()
    const check = createSimulationValidator({ scenario: 'variable-speed' }).observe(sample, appOutput(sample, {
      speedKnots: sample.groundTruthSpeedKnots! - 0.05,
    }))

    expect(check).toMatchObject({
      targetSpeedKnots: sample.targetSpeedKnots,
      groundTruthSpeedKnots: sample.groundTruthSpeedKnots,
      gpsReportedSpeedKnots: sample.speedMetersPerSecond! * KNOTS_PER_METER_PER_SECOND,
      appSpeedKnots: sample.groundTruthSpeedKnots! - 0.05,
    })
    expect(check?.appSpeedKnots).not.toBe(check?.groundTruthSpeedKnots)
    expect(check?.speedErrorKnots).toBeCloseTo(0.05, 10)
  })

  it('does not pass an incomplete report with only 18 of 19 correct checks', () => {
    const simulationValidator = validator()

    for (let elapsedTimeSeconds = 6; elapsedTimeSeconds < 60; elapsedTimeSeconds += 3) {
      const sample = sampleAt(elapsedTimeSeconds)
      simulationValidator.observe(sample, appOutput(sample))
    }

    const report = simulationValidator.getReport()
    expect(report).toMatchObject({
      plannedChecks: 19,
      completedChecks: 18,
      missingChecks: 1,
      overallPassed: false,
    })
    expect(simulationValidator.isComplete()).toBe(false)
  })

  it('fails missing app speed or displayed course after warm-up', () => {
    const simulationValidator = validator()
    const missingSpeed = sampleAt(6)
    const missingCourse = sampleAt(9)

    expect(simulationValidator.observe(missingSpeed, appOutput(missingSpeed, { speedKnots: null }))).toMatchObject({
      speedPassed: false,
      overallPassed: false,
    })
    expect(simulationValidator.observe(missingCourse, appOutput(missingCourse, { displayCourseDegrees: null }))).toMatchObject({
      coursePassed: false,
      overallPassed: false,
    })
  })

  it('summarizes numerical errors and overall pass/fail in a JSON-safe report', () => {
    const simulationValidator = validator()
    const first = sampleAt(6)
    const second = sampleAt(9)

    simulationValidator.observe(first, appOutput(first, { speedKnots: 6.1, displayCourseDegrees: 1 }))
    simulationValidator.observe(second, appOutput(second, { speedKnots: 5.8, displayCourseDegrees: 2 }))
    const report = simulationValidator.getReport()

    expect(report).toMatchObject({
      speedChecks: 2,
      speedPassed: 1,
      courseChecks: 2,
      coursePassed: 1,
      meanCourseErrorDegrees: 1.5,
      maxCourseErrorDegrees: 2,
      overallPassed: false,
    })
    expect(report.meanSpeedErrorKnots).toBeCloseTo(0.15, 10)
    expect(report.maxSpeedErrorKnots).toBeCloseTo(0.2, 10)
    expect(() => JSON.stringify(report)).not.toThrow()
  })

  it('connects a simulator sample through GpsSource and useLiveGps mapping to validator input', async () => {
    const source = createSimulatedGpsSource(createSailingSimulator(NORTHBOUND_SIX_KNOTS_SCENARIO))
    let liveGps: ReturnType<typeof gpsReadingFromPosition> | null = null
    await source.watchPosition({
      enableHighAccuracy: true,
      timeout: 10_000,
      maximumAge: 1_000,
      minimumUpdateInterval: 1_000,
      interval: 1_000,
    }, (position) => {
      if (position) {
        liveGps = gpsReadingFromPosition(position, 'watching')
      }
    })

    for (let second = 0; second < 6; second += 1) {
      source.advance()
    }

    const sample = source.currentSample()
    const mappedLiveGps = liveGps as ReturnType<typeof gpsReadingFromPosition> | null
    const check = validator().observe(sample, {
      speedKnots: mappedLiveGps?.speedKnots ?? null,
      displayCourseDegrees: mappedLiveGps?.courseDegrees ?? null,
      timestamp: mappedLiveGps?.timestamp ?? null,
      presentationTimestamp: mappedLiveGps?.timestamp ?? null,
    })

    expect(check).toMatchObject({ overallPassed: true, appCourseDegrees: 0 })
    expect(check?.appSpeedKnots).toBeCloseTo(6, 10)
  })
})
