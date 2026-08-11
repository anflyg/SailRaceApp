import { getCourseErrorDegrees, type SimulationValidationCheck } from './simulationValidator'

export interface CourseNoiseAnalysis {
  rawGpsMeanAbsoluteCourseErrorDegrees: number | null
  rawGpsMaxCourseErrorDegrees: number | null
  appMeanAbsoluteCourseErrorDegrees: number | null
  appMaxCourseErrorDegrees: number | null
  rawGpsMeanStepChangeDegrees: number | null
  rawGpsMaxStepChangeDegrees: number | null
  appMeanStepChangeDegrees: number | null
  appMaxStepChangeDegrees: number | null
  meanErrorReductionRatio: number | null
  meanJitterReductionRatio: number | null
  finalCourseErrorDegrees: number | null
  noisyGpsCheckCount: number
  measurementPassed: boolean
}

function average(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length
}

function maximum(values: number[]): number | null {
  return values.length === 0 ? null : Math.max(...values)
}

function getStepChanges(values: number[]): number[] {
  return values.slice(1).map((value, index) => getCourseErrorDegrees(values[index], value))
}

export function analyzeCourseNoiseChecks(checks: SimulationValidationCheck[]): CourseNoiseAnalysis {
  const validChecks = checks.filter((check) => (
    check.groundTruthCourseDegrees !== null && check.appCourseDegrees !== null
  ))
  const rawGpsErrors = validChecks.map((check) => (
    getCourseErrorDegrees(check.groundTruthCourseDegrees!, check.gpsReportedCourseDegrees)
  ))
  const appErrors = validChecks.map((check) => (
    getCourseErrorDegrees(check.groundTruthCourseDegrees!, check.appCourseDegrees!)
  ))
  const rawGpsCourses = validChecks.map((check) => check.gpsReportedCourseDegrees)
  const appCourses = validChecks.map((check) => check.appCourseDegrees!)
  const rawGpsStepChanges = getStepChanges(rawGpsCourses)
  const appStepChanges = getStepChanges(appCourses)
  const rawGpsMeanAbsoluteCourseErrorDegrees = average(rawGpsErrors)
  const appMeanAbsoluteCourseErrorDegrees = average(appErrors)
  const rawGpsMeanStepChangeDegrees = average(rawGpsStepChanges)
  const appMeanStepChangeDegrees = average(appStepChanges)
  const finalCourseErrorDegrees = appErrors.at(-1) ?? null
  const noisyGpsCheckCount = rawGpsErrors.filter((error) => error > Number.EPSILON).length

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
    measurementPassed:
      checks.length === 19 &&
      validChecks.length === 19 &&
      noisyGpsCheckCount >= 3 &&
      (maximum(rawGpsErrors) ?? Infinity) <= 5 &&
      finalCourseErrorDegrees !== null && finalCourseErrorDegrees <= 2,
  }
}
