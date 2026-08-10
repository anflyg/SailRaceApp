import type { FilteredGpsReading } from '../types'
import type { SailingSimulationSample } from './sailingSimulator'

const KNOTS_PER_METER_PER_SECOND = 1.943844

export const STRAIGHT_SIMULATION_VALIDATION = {
  validationIntervalSeconds: 3,
  warmupSeconds: 6,
  endSeconds: 60,
  speedToleranceKnots: 0.15,
  courseToleranceDegrees: 1,
} as const

export interface SimulationValidationTolerances {
  speedToleranceKnots: number
  courseToleranceDegrees: number
}

export interface SimulationValidationCheck {
  elapsedTimeSeconds: number
  timestamp: number
  targetSpeedKnots: number
  groundTruthSpeedKnots: number | null
  gpsReportedSpeedKnots: number | null
  appSpeedKnots: number | null
  speedErrorKnots: number | null
  speedPassed: boolean
  groundTruthCourseDegrees: number
  appCourseDegrees: number | null
  courseErrorDegrees: number | null
  coursePassed: boolean
  overallPassed: boolean
}

export interface SimulationValidationReport {
  scenario: string
  validationIntervalSeconds: number
  warmupSeconds: number
  tolerances: SimulationValidationTolerances
  checks: SimulationValidationCheck[]
  speedChecks: number
  speedPassed: number
  courseChecks: number
  coursePassed: number
  meanSpeedErrorKnots: number | null
  maxSpeedErrorKnots: number | null
  meanCourseErrorDegrees: number | null
  maxCourseErrorDegrees: number | null
  overallPassed: boolean
}

export interface SimulationValidator {
  observe(
    sample: SailingSimulationSample,
    filteredGps: Pick<FilteredGpsReading, 'speedKnots' | 'displayCourseDegrees' | 'timestamp'>,
  ): SimulationValidationCheck | null
  getReport(): SimulationValidationReport
  isComplete(): boolean
}

export interface SimulationValidatorConfig {
  scenario: string
  validationIntervalSeconds?: number
  warmupSeconds?: number
  endSeconds?: number
  tolerances?: SimulationValidationTolerances
}

declare global {
  interface Window {
    __SAILRACE_SIMULATION_REPORT__?: SimulationValidationReport
  }
}

function isFiniteNumber(value: number | null): value is number {
  return value !== null && Number.isFinite(value)
}

export function getCourseErrorDegrees(expectedDegrees: number, actualDegrees: number): number {
  const difference = ((actualDegrees - expectedDegrees + 540) % 360) - 180
  return Math.abs(difference)
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null
  }

  return values.reduce((total, value) => total + value, 0) / values.length
}

function maximum(values: number[]): number | null {
  return values.length === 0 ? null : Math.max(...values)
}

function isScheduledElapsedTime(
  elapsedTimeSeconds: number,
  validationIntervalSeconds: number,
  warmupSeconds: number,
  endSeconds: number,
): boolean {
  const roundedElapsedSeconds = Math.round(elapsedTimeSeconds)

  return (
    Math.abs(elapsedTimeSeconds - roundedElapsedSeconds) < Number.EPSILON &&
    roundedElapsedSeconds >= warmupSeconds &&
    roundedElapsedSeconds <= endSeconds &&
    roundedElapsedSeconds % validationIntervalSeconds === 0
  )
}

export function createSimulationValidator(config: SimulationValidatorConfig): SimulationValidator {
  const validationIntervalSeconds = config.validationIntervalSeconds ?? STRAIGHT_SIMULATION_VALIDATION.validationIntervalSeconds
  const warmupSeconds = config.warmupSeconds ?? STRAIGHT_SIMULATION_VALIDATION.warmupSeconds
  const endSeconds = config.endSeconds ?? STRAIGHT_SIMULATION_VALIDATION.endSeconds
  const tolerances = config.tolerances ?? {
    speedToleranceKnots: STRAIGHT_SIMULATION_VALIDATION.speedToleranceKnots,
    courseToleranceDegrees: STRAIGHT_SIMULATION_VALIDATION.courseToleranceDegrees,
  }
  const checks: SimulationValidationCheck[] = []
  const checkedTimestamps = new Set<number>()

  const getReport = (): SimulationValidationReport => {
    const speedErrors = checks
      .map((check) => check.speedErrorKnots)
      .filter(isFiniteNumber)
    const courseErrors = checks
      .map((check) => check.courseErrorDegrees)
      .filter(isFiniteNumber)

    return {
      scenario: config.scenario,
      validationIntervalSeconds,
      warmupSeconds,
      tolerances: { ...tolerances },
      checks: checks.map((check) => ({ ...check })),
      speedChecks: checks.length,
      speedPassed: checks.filter((check) => check.speedPassed).length,
      courseChecks: checks.length,
      coursePassed: checks.filter((check) => check.coursePassed).length,
      meanSpeedErrorKnots: average(speedErrors),
      maxSpeedErrorKnots: maximum(speedErrors),
      meanCourseErrorDegrees: average(courseErrors),
      maxCourseErrorDegrees: maximum(courseErrors),
      overallPassed: checks.length > 0 && checks.every((check) => check.overallPassed),
    }
  }

  return {
    observe(sample, filteredGps) {
      if (
        !isScheduledElapsedTime(
          sample.elapsedTimeSeconds,
          validationIntervalSeconds,
          warmupSeconds,
          endSeconds,
        ) ||
        checkedTimestamps.has(sample.timestamp) ||
        filteredGps.timestamp !== sample.timestamp
      ) {
        return null
      }

      const appSpeedKnots = filteredGps.speedKnots
      const appCourseDegrees = filteredGps.displayCourseDegrees
      const groundTruthSpeedKnots = sample.groundTruthSpeedKnots
      const speedErrorKnots =
        isFiniteNumber(groundTruthSpeedKnots) && isFiniteNumber(appSpeedKnots)
          ? Math.abs(appSpeedKnots - groundTruthSpeedKnots)
          : null
      const courseErrorDegrees = isFiniteNumber(appCourseDegrees)
        ? getCourseErrorDegrees(sample.courseDegrees, appCourseDegrees)
        : null
      const speedPassed = speedErrorKnots !== null && speedErrorKnots <= tolerances.speedToleranceKnots
      const coursePassed = courseErrorDegrees !== null && courseErrorDegrees <= tolerances.courseToleranceDegrees
      const check: SimulationValidationCheck = {
        elapsedTimeSeconds: sample.elapsedTimeSeconds,
        timestamp: sample.timestamp,
        targetSpeedKnots: sample.targetSpeedKnots,
        groundTruthSpeedKnots,
        gpsReportedSpeedKnots: sample.speedMetersPerSecond === null
          ? null
          : sample.speedMetersPerSecond * KNOTS_PER_METER_PER_SECOND,
        appSpeedKnots,
        speedErrorKnots,
        speedPassed,
        groundTruthCourseDegrees: sample.courseDegrees,
        appCourseDegrees,
        courseErrorDegrees,
        coursePassed,
        overallPassed: speedPassed && coursePassed,
      }

      checkedTimestamps.add(sample.timestamp)
      checks.push(check)
      return check
    },

    getReport,

    isComplete: () => checks.some((check) => check.elapsedTimeSeconds === endSeconds),
  }
}
