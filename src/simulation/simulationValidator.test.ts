import { describe, expect, it } from 'vitest'
import { gpsReadingFromPosition } from '../hooks/useLiveGps'
import { createSimulatedGpsSource } from './simulatedGpsSource'
import { createSailingSimulator, type SailingSimulationSample } from './sailingSimulator'
import { NORTHBOUND_SIX_KNOTS_SCENARIO } from './sailingSimulator.fixtures'
import { createSimulationValidator, getCourseErrorDegrees } from './simulationValidator'

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
    speedKnots: 'speedKnots' in overrides ? overrides.speedKnots! : 6,
    displayCourseDegrees: 'displayCourseDegrees' in overrides ? overrides.displayCourseDegrees! : 0,
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
    const eastbound = sampleAt(9, { courseDegrees: 90 })
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
