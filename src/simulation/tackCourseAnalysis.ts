import { getCourseErrorDegrees, type SimulationValidationCheck } from './simulationValidator'

export interface TackCourseAnalysis {
  tackStartSeconds: number
  tackEndSeconds: number
  preTackCourseErrorDegrees: number | null
  maxCourseErrorAfterTackDegrees: number | null
  firstWithin5DegreesSeconds: number | null
  firstWithin5DegreesAfterTackSeconds: number | null
  firstWithin2DegreesSeconds: number | null
  firstWithin2DegreesAfterTackSeconds: number | null
  finalCourseErrorDegrees: number | null
  hasLongWayCourseError: boolean
  measurementPassed: boolean
}

const PRE_TACK_CHECK_SECONDS = 12
const TACK_START_SECONDS = 15
const TACK_END_SECONDS = 21
const FINAL_CHECK_SECONDS = 60

function getCourseError(check: SimulationValidationCheck): number | null {
  if (check.groundTruthCourseDegrees === null || check.appCourseDegrees === null) {
    return null
  }

  return getCourseErrorDegrees(check.groundTruthCourseDegrees, check.appCourseDegrees)
}

function getFirstWithin(
  checks: SimulationValidationCheck[],
  maximumErrorDegrees: number,
): SimulationValidationCheck | undefined {
  return checks.find((check) => {
    const error = getCourseError(check)
    return error !== null && error <= maximumErrorDegrees
  })
}

export function analyzeTackCourseChecks(checks: SimulationValidationCheck[]): TackCourseAnalysis {
  const preTackCheck = checks.find((check) => check.elapsedTimeSeconds === PRE_TACK_CHECK_SECONDS)
  const finalCheck = checks.find((check) => check.elapsedTimeSeconds === FINAL_CHECK_SECONDS)
  const postTackChecks = checks.filter((check) => check.elapsedTimeSeconds >= TACK_END_SECONDS)
  const postTackErrors = postTackChecks
    .map(getCourseError)
    .filter((error): error is number => error !== null)
  const firstWithin5Degrees = getFirstWithin(postTackChecks, 5)
  const firstWithin2Degrees = getFirstWithin(postTackChecks, 2)
  const hasLongWayCourseError = checks
    .filter((check) => check.elapsedTimeSeconds >= TACK_START_SECONDS)
    .some((check) => (
      check.appCourseDegrees !== null &&
      getCourseErrorDegrees(check.targetCourseDegrees, check.appCourseDegrees) > 90
    ))
  const preTackCourseErrorDegrees = preTackCheck ? getCourseError(preTackCheck) : null
  const finalCourseErrorDegrees = finalCheck ? getCourseError(finalCheck) : null

  return {
    tackStartSeconds: TACK_START_SECONDS,
    tackEndSeconds: TACK_END_SECONDS,
    preTackCourseErrorDegrees,
    maxCourseErrorAfterTackDegrees: postTackErrors.length === 0 ? null : Math.max(...postTackErrors),
    firstWithin5DegreesSeconds: firstWithin5Degrees?.elapsedTimeSeconds ?? null,
    firstWithin5DegreesAfterTackSeconds: firstWithin5Degrees
      ? firstWithin5Degrees.elapsedTimeSeconds - TACK_END_SECONDS
      : null,
    firstWithin2DegreesSeconds: firstWithin2Degrees?.elapsedTimeSeconds ?? null,
    firstWithin2DegreesAfterTackSeconds: firstWithin2Degrees
      ? firstWithin2Degrees.elapsedTimeSeconds - TACK_END_SECONDS
      : null,
    finalCourseErrorDegrees,
    hasLongWayCourseError,
    measurementPassed:
      checks.length === 19 &&
      checks.every((check) => check.speedPassed && check.appCourseDegrees !== null) &&
      preTackCourseErrorDegrees !== null && preTackCourseErrorDegrees <= 1 &&
      finalCourseErrorDegrees !== null && finalCourseErrorDegrees <= 1 &&
      firstWithin5Degrees !== undefined &&
      firstWithin2Degrees !== undefined &&
      !hasLongWayCourseError,
  }
}
