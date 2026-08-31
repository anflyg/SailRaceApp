import type { FilteredGpsReading } from '../types'
import type { SailingSimulationSample } from './sailingSimulator'
import { calculateGroundTruthVmgKnots } from './groundTruthVmg'
import { calculateGroundTruthLaylineCandidate, LAYLINE_CANDIDATE_TARGET_LOCAL } from './groundTruthLayline'

const KNOTS_PER_METER_PER_SECOND = 1.943844

export const STRAIGHT_SIMULATION_VALIDATION = {
  validationIntervalSeconds: 3,
  warmupSeconds: 6,
  endSeconds: 60,
  speedToleranceKnots: 0.15,
  courseToleranceDegrees: 1,
} as const

export const VARIABLE_SPEED_SIMULATION_VALIDATION = {
  validationIntervalSeconds: 3,
  warmupSeconds: 6,
  endSeconds: 120,
  speedToleranceKnots: 0.15,
  courseToleranceDegrees: 1,
} as const

export const VARIABLE_COURSE_SIMULATION_VALIDATION = {
  validationIntervalSeconds: 3,
  warmupSeconds: 6,
  endSeconds: 120,
  speedToleranceKnots: 0.15,
  courseToleranceDegrees: 6,
} as const

export const WIND_VMG_SIMULATION_VALIDATION = {
  validationIntervalSeconds: 3,
  warmupSeconds: 6,
  endSeconds: 60,
  speedToleranceKnots: 0.15,
  courseToleranceDegrees: 1,
  vmgToleranceKnots: 0.10,
  referenceHeadingDegrees: 0,
} as const

export const LAYLINE_CANDIDATE_SIMULATION_VALIDATION = {
  validationIntervalSeconds: 3,
  warmupSeconds: 6,
  endSeconds: 24,
  speedToleranceKnots: 0.15,
  courseToleranceDegrees: 1,
  laylineTimeToleranceSeconds: 0.30,
  laylineDistanceToleranceMeters: 1,
  laylineAlphaDegrees: 90,
} as const

export const LAYLINE_WARNING_SIMULATION_VALIDATION = {
  validationIntervalSeconds: 3,
  warmupSeconds: 6,
  endSeconds: 24,
  speedToleranceKnots: 0.15,
  courseToleranceDegrees: 1,
} as const

export const LAYLINE_REACTIVE_TACK_SIMULATION_VALIDATION = {
  validationIntervalSeconds: 3,
  warmupSeconds: 6,
  endSeconds: 42,
  speedToleranceKnots: 0.15,
  courseToleranceDegrees: 180,
} as const

export const UPWIND_TO_K1_SIMULATION_VALIDATION = {
  validationIntervalSeconds: 3,
  warmupSeconds: 6,
  endSeconds: 48,
  speedToleranceKnots: 0.15,
  courseToleranceDegrees: 180,
} as const

export const SPEED_SOURCE_DISAGREEMENT_SIMULATION_VALIDATION = {
  validationIntervalSeconds: 3,
  warmupSeconds: 15,
  endSeconds: 42,
  speedToleranceKnots: 0.5,
  courseToleranceDegrees: 1,
} as const

export const COURSE_SOURCE_DISAGREEMENT_SIMULATION_VALIDATION = {
  validationIntervalSeconds: 3,
  warmupSeconds: 6,
  endSeconds: 30,
  speedToleranceKnots: 0.5,
  courseToleranceDegrees: 2,
} as const

export interface SimulationValidationTolerances {
  speedToleranceKnots: number
  courseToleranceDegrees: number
  vmgToleranceKnots?: number
  laylineTimeToleranceSeconds?: number
  laylineDistanceToleranceMeters?: number
}

interface ScenarioValidationProfile {
  validationIntervalSeconds: number
  warmupSeconds: number
  endSeconds: number
  speedToleranceKnots: number
  courseToleranceDegrees: number
  vmgToleranceKnots?: number
  referenceHeadingDegrees?: number
  laylineTimeToleranceSeconds?: number
  laylineDistanceToleranceMeters?: number
  laylineAlphaDegrees?: number
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
  targetCourseDegrees: number
  groundTruthCourseDegrees: number | null
  gpsReportedCourseDegrees: number
  appCourseDegrees: number | null
  courseErrorDegrees: number | null
  coursePassed: boolean
  referenceHeadingDegrees: number | null
  groundTruthVmgKnots: number | null
  appVmgKnots: number | null
  vmgErrorKnots: number | null
  vmgPassed: boolean
  groundTruthLaylineVariant: string | null
  appLaylineVariant: string | null
  groundTruthPostTackHeadingDegrees: number | null
  appPostTackHeadingDegrees: number | null
  groundTruthDistanceToTackMeters: number | null
  appDistanceToTackMeters: number | null
  laylineDistanceErrorMeters: number | null
  groundTruthTimeToTackSeconds: number | null
  appTimeToTackSeconds: number | null
  laylineTimeErrorSeconds: number | null
  appLaylineReferenceSource: string | null
  appLaylineReferenceHeadingDegrees: number | null
  appMovingTowardTarget: boolean | null
  laylinePassed: boolean
  overallPassed: boolean
}

export interface SimulationValidationReport {
  scenario: string
  validationIntervalSeconds: number
  warmupSeconds: number
  tolerances: SimulationValidationTolerances
  checks: SimulationValidationCheck[]
  plannedChecks: number
  completedChecks: number
  missingChecks: number
  speedChecks: number
  speedPassed: number
  courseChecks: number
  coursePassed: number
  vmgChecks: number
  vmgPassed: number
  laylineChecks: number
  laylinePassed: number
  meanSpeedErrorKnots: number | null
  maxSpeedErrorKnots: number | null
  meanCourseErrorDegrees: number | null
  maxCourseErrorDegrees: number | null
  meanVmgErrorKnots: number | null
  maxVmgErrorKnots: number | null
  meanLaylineTimeErrorSeconds: number | null
  maxLaylineTimeErrorSeconds: number | null
  meanLaylineDistanceErrorMeters: number | null
  maxLaylineDistanceErrorMeters: number | null
  overallPassed: boolean
}

export interface SimulationValidator {
  observe(
    sample: SailingSimulationSample,
    filteredGps: Pick<
      FilteredGpsReading,
      'speedKnots' | 'displayCourseDegrees' | 'timestamp' | 'presentationTimestamp'
    > & {
      courseDegrees?: number | null
      vmgKnots?: number | null
      laylineObservation?: {
        reference: { source: string; headingDegrees: number } | null
        movingTowardTarget: boolean
        candidate: {
          laylineVariant: string
          postTackHeadingDegrees: number
          distanceToTackMeters: number
          timeToTackSeconds: number
        } | null
      } | null
    },
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
  referenceHeadingDegrees?: number | null
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

function getPlannedChecks(
  validationIntervalSeconds: number,
  warmupSeconds: number,
  endSeconds: number,
): number {
  const firstScheduledSecond = Math.ceil(warmupSeconds / validationIntervalSeconds) * validationIntervalSeconds

  return firstScheduledSecond > endSeconds
    ? 0
    : Math.floor((endSeconds - firstScheduledSecond) / validationIntervalSeconds) + 1
}

export function createSimulationValidator(config: SimulationValidatorConfig): SimulationValidator {
  const scenarioValidation: ScenarioValidationProfile = config.scenario === 'variable-speed'
    ? VARIABLE_SPEED_SIMULATION_VALIDATION
    : config.scenario === 'variable-course'
      ? VARIABLE_COURSE_SIMULATION_VALIDATION
    : config.scenario === 'wind-vmg'
        ? WIND_VMG_SIMULATION_VALIDATION
      : config.scenario === 'layline-candidate'
        ? LAYLINE_CANDIDATE_SIMULATION_VALIDATION
      : config.scenario === 'layline-warning'
        ? LAYLINE_WARNING_SIMULATION_VALIDATION
      : config.scenario === 'layline-reactive-tack'
        ? LAYLINE_REACTIVE_TACK_SIMULATION_VALIDATION
      : config.scenario === 'upwind-to-k1'
        ? UPWIND_TO_K1_SIMULATION_VALIDATION
      : config.scenario === 'course-source-disagreement'
        ? COURSE_SOURCE_DISAGREEMENT_SIMULATION_VALIDATION
      : config.scenario === 'speed-source-disagreement'
        ? SPEED_SOURCE_DISAGREEMENT_SIMULATION_VALIDATION
      : STRAIGHT_SIMULATION_VALIDATION
  const validationIntervalSeconds = config.validationIntervalSeconds ?? scenarioValidation.validationIntervalSeconds
  const warmupSeconds = config.warmupSeconds ?? scenarioValidation.warmupSeconds
  const endSeconds = config.endSeconds ?? scenarioValidation.endSeconds
  const tolerances = config.tolerances ?? {
    speedToleranceKnots: scenarioValidation.speedToleranceKnots,
    courseToleranceDegrees: scenarioValidation.courseToleranceDegrees,
    ...(scenarioValidation.vmgToleranceKnots === undefined ? {} : { vmgToleranceKnots: scenarioValidation.vmgToleranceKnots }),
    ...(scenarioValidation.laylineTimeToleranceSeconds === undefined ? {} : {
      laylineTimeToleranceSeconds: scenarioValidation.laylineTimeToleranceSeconds,
      laylineDistanceToleranceMeters: scenarioValidation.laylineDistanceToleranceMeters,
    }),
  }
  const referenceHeadingDegrees = config.referenceHeadingDegrees ?? scenarioValidation.referenceHeadingDegrees ?? null
  const checks: SimulationValidationCheck[] = []
  const checkedTimestamps = new Set<number>()
  const completedElapsedTimes = new Set<number>()
  const pendingSamples = new Map<number, SailingSimulationSample>()
  const plannedChecks = getPlannedChecks(validationIntervalSeconds, warmupSeconds, endSeconds)

  const getReport = (): SimulationValidationReport => {
    const speedErrors = checks
      .map((check) => check.speedErrorKnots)
      .filter(isFiniteNumber)
    const courseErrors = checks
      .map((check) => check.courseErrorDegrees)
      .filter(isFiniteNumber)
    const vmgErrors = checks
      .map((check) => check.vmgErrorKnots)
      .filter(isFiniteNumber)
    const laylineTimeErrors = checks
      .map((check) => check.laylineTimeErrorSeconds)
      .filter(isFiniteNumber)
    const laylineDistanceErrors = checks
      .map((check) => check.laylineDistanceErrorMeters)
      .filter(isFiniteNumber)
    const laylineValidationEnabled = scenarioValidation.laylineAlphaDegrees !== undefined

    return {
      scenario: config.scenario,
      validationIntervalSeconds,
      warmupSeconds,
      tolerances: { ...tolerances },
      checks: checks.map((check) => ({ ...check })),
      plannedChecks,
      completedChecks: completedElapsedTimes.size,
      missingChecks: Math.max(0, plannedChecks - completedElapsedTimes.size),
      speedChecks: checks.length,
      speedPassed: checks.filter((check) => check.speedPassed).length,
      courseChecks: checks.length,
      coursePassed: checks.filter((check) => check.coursePassed).length,
      vmgChecks: referenceHeadingDegrees === null ? 0 : checks.length,
      vmgPassed: referenceHeadingDegrees === null ? 0 : checks.filter((check) => check.vmgPassed).length,
      laylineChecks: laylineValidationEnabled ? checks.length : 0,
      laylinePassed: laylineValidationEnabled ? checks.filter((check) => check.laylinePassed).length : 0,
      meanSpeedErrorKnots: average(speedErrors),
      maxSpeedErrorKnots: maximum(speedErrors),
      meanCourseErrorDegrees: average(courseErrors),
      maxCourseErrorDegrees: maximum(courseErrors),
      meanVmgErrorKnots: average(vmgErrors),
      maxVmgErrorKnots: maximum(vmgErrors),
      meanLaylineTimeErrorSeconds: average(laylineTimeErrors),
      maxLaylineTimeErrorSeconds: maximum(laylineTimeErrors),
      meanLaylineDistanceErrorMeters: average(laylineDistanceErrors),
      maxLaylineDistanceErrorMeters: maximum(laylineDistanceErrors),
      overallPassed:
        plannedChecks > 0 &&
        completedElapsedTimes.size === plannedChecks &&
        checks.every((check) => check.overallPassed),
    }
  }

  return {
    observe(sample, filteredGps) {
      if (isScheduledElapsedTime(
        sample.elapsedTimeSeconds,
        validationIntervalSeconds,
        warmupSeconds,
        endSeconds,
      ) &&
        !checkedTimestamps.has(sample.timestamp) &&
        !completedElapsedTimes.has(sample.elapsedTimeSeconds)) {
        pendingSamples.set(sample.timestamp, sample)
      }

      const presentationTimestamp = filteredGps.presentationTimestamp

      if (presentationTimestamp === null || checkedTimestamps.has(presentationTimestamp)) {
        return null
      }

      const pendingSample = pendingSamples.get(presentationTimestamp)

      if (!pendingSample || completedElapsedTimes.has(pendingSample.elapsedTimeSeconds)) {
        pendingSamples.delete(presentationTimestamp)
        return null
      }

      const appSpeedKnots = filteredGps.speedKnots
      const appCourseDegrees = config.scenario === 'course-source-disagreement'
        ? filteredGps.courseDegrees ?? filteredGps.displayCourseDegrees
        : filteredGps.displayCourseDegrees
      const groundTruthSpeedKnots = pendingSample.groundTruthSpeedKnots
      const speedErrorKnots =
        isFiniteNumber(groundTruthSpeedKnots) && isFiniteNumber(appSpeedKnots)
          ? Math.abs(appSpeedKnots - groundTruthSpeedKnots)
          : null
      const groundTruthCourseDegrees = pendingSample.groundTruthCourseDegrees
      const courseErrorDegrees = isFiniteNumber(groundTruthCourseDegrees) && isFiniteNumber(appCourseDegrees)
        ? getCourseErrorDegrees(groundTruthCourseDegrees, appCourseDegrees)
        : null
      const speedPassed = speedErrorKnots !== null && speedErrorKnots <= tolerances.speedToleranceKnots
      const coursePassed = courseErrorDegrees !== null && courseErrorDegrees <= tolerances.courseToleranceDegrees
      const appVmgKnots = filteredGps.vmgKnots ?? null
      const groundTruthVmgKnots =
        referenceHeadingDegrees !== null && isFiniteNumber(groundTruthSpeedKnots) && isFiniteNumber(groundTruthCourseDegrees)
          ? calculateGroundTruthVmgKnots(groundTruthSpeedKnots, groundTruthCourseDegrees, referenceHeadingDegrees)
          : null
      const vmgErrorKnots = isFiniteNumber(groundTruthVmgKnots) && isFiniteNumber(appVmgKnots)
        ? Math.abs(appVmgKnots - groundTruthVmgKnots)
        : null
      const vmgPassed = referenceHeadingDegrees === null
        ? true
        : vmgErrorKnots !== null && vmgErrorKnots <= (tolerances.vmgToleranceKnots ?? 0)
      const laylineObservation = filteredGps.laylineObservation ?? null
      const groundTruthLayline = scenarioValidation.laylineAlphaDegrees !== undefined &&
        isFiniteNumber(groundTruthSpeedKnots) &&
        isFiniteNumber(groundTruthCourseDegrees)
        ? calculateGroundTruthLaylineCandidate({
          boat: { xMeters: pendingSample.localXmeters, yMeters: pendingSample.localYmeters },
          target: LAYLINE_CANDIDATE_TARGET_LOCAL,
          groundTruthCourseDegrees,
          groundTruthSpeedKnots,
          alphaDegrees: scenarioValidation.laylineAlphaDegrees,
        })
        : null
      const appLaylineCandidate = laylineObservation?.candidate ?? null
      const laylineDistanceErrorMeters = groundTruthLayline !== null && appLaylineCandidate !== null
        ? Math.abs(appLaylineCandidate.distanceToTackMeters - groundTruthLayline.distanceToTackMeters)
        : null
      const laylineTimeErrorSeconds = groundTruthLayline !== null && appLaylineCandidate !== null
        ? Math.abs(appLaylineCandidate.timeToTackSeconds - groundTruthLayline.timeToTackSeconds)
        : null
      const laylinePassed = scenarioValidation.laylineAlphaDegrees === undefined
        ? true
        : groundTruthLayline !== null &&
          appLaylineCandidate !== null &&
          laylineObservation?.movingTowardTarget === true &&
          laylineObservation.reference?.source === 'l1-k1' &&
          laylineObservation.reference.headingDegrees !== undefined &&
          getCourseErrorDegrees(0, laylineObservation.reference.headingDegrees) <= 0.2 &&
          groundTruthLayline.laylineVariant === 'plus-alpha' &&
          appLaylineCandidate.laylineVariant === 'plus-alpha' &&
          getCourseErrorDegrees(45, groundTruthLayline.postTackHeadingDegrees) <= 0.2 &&
          getCourseErrorDegrees(45, appLaylineCandidate.postTackHeadingDegrees) <= 0.5 &&
          laylineTimeErrorSeconds !== null &&
          laylineTimeErrorSeconds <= (tolerances.laylineTimeToleranceSeconds ?? 0) &&
          laylineDistanceErrorMeters !== null &&
          laylineDistanceErrorMeters <= (tolerances.laylineDistanceToleranceMeters ?? 0)
      const check: SimulationValidationCheck = {
        elapsedTimeSeconds: pendingSample.elapsedTimeSeconds,
        timestamp: pendingSample.timestamp,
        targetSpeedKnots: pendingSample.targetSpeedKnots,
        groundTruthSpeedKnots,
        gpsReportedSpeedKnots: pendingSample.speedMetersPerSecond === null
          ? null
          : pendingSample.speedMetersPerSecond * KNOTS_PER_METER_PER_SECOND,
        appSpeedKnots,
        speedErrorKnots,
        speedPassed,
        targetCourseDegrees: pendingSample.targetCourseDegrees,
        groundTruthCourseDegrees,
        gpsReportedCourseDegrees: pendingSample.courseDegrees,
        appCourseDegrees,
        courseErrorDegrees,
        coursePassed,
        referenceHeadingDegrees,
        groundTruthVmgKnots,
        appVmgKnots,
        vmgErrorKnots,
        vmgPassed,
        groundTruthLaylineVariant: groundTruthLayline?.laylineVariant ?? null,
        appLaylineVariant: appLaylineCandidate?.laylineVariant ?? null,
        groundTruthPostTackHeadingDegrees: groundTruthLayline?.postTackHeadingDegrees ?? null,
        appPostTackHeadingDegrees: appLaylineCandidate?.postTackHeadingDegrees ?? null,
        groundTruthDistanceToTackMeters: groundTruthLayline?.distanceToTackMeters ?? null,
        appDistanceToTackMeters: appLaylineCandidate?.distanceToTackMeters ?? null,
        laylineDistanceErrorMeters,
        groundTruthTimeToTackSeconds: groundTruthLayline?.timeToTackSeconds ?? null,
        appTimeToTackSeconds: appLaylineCandidate?.timeToTackSeconds ?? null,
        laylineTimeErrorSeconds,
        appLaylineReferenceSource: laylineObservation?.reference?.source ?? null,
        appLaylineReferenceHeadingDegrees: laylineObservation?.reference?.headingDegrees ?? null,
        appMovingTowardTarget: laylineObservation?.movingTowardTarget ?? null,
        laylinePassed,
        overallPassed: speedPassed && coursePassed && vmgPassed && laylinePassed,
      }

      checkedTimestamps.add(pendingSample.timestamp)
      completedElapsedTimes.add(pendingSample.elapsedTimeSeconds)
      pendingSamples.delete(pendingSample.timestamp)
      checks.push(check)
      return check
    },

    getReport,

    isComplete: () => plannedChecks > 0 && completedElapsedTimes.size === plannedChecks,
  }
}
