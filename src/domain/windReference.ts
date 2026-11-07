import { shortestAngleDeltaDegrees } from './angles'
import { COURSE_SAMPLE_MAX_AGE_MS } from './windShiftInstrument'
import type { FilteredGpsReading } from '../types'
import type { WindHeadingMeasurementResult } from '../services/sensors/windHeadingService'

function validAngle(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 360
}

export function isUsableWindReference(
  heading: number | null | undefined,
  measurement: WindHeadingMeasurementResult | null | undefined,
): heading is number {
  return validAngle(heading) && measurement?.referenceFrame === 'true-north' && measurement.quality === 'good' &&
    (measurement.selectedHeadingSource === 'back-vector-row' || measurement.selectedHeadingSource === 'back-vector-column') &&
    Number.isInteger(measurement.sampleCount) && measurement.sampleCount >= 30 &&
    typeof measurement.accuracyDegrees === 'number' && Number.isFinite(measurement.accuracyDegrees) &&
    measurement.accuracyDegrees >= 0 && measurement.accuracyDegrees <= 10 &&
    typeof measurement.spreadDegrees === 'number' && Number.isFinite(measurement.spreadDegrees) &&
    measurement.spreadDegrees >= 0 && measurement.spreadDegrees <= 10 &&
    validAngle(measurement.headingDegrees) && validAngle(measurement.selectedHeadingDegrees) &&
    Math.abs(shortestAngleDeltaDegrees(heading, measurement.headingDegrees)) < 1e-6 &&
    Math.abs(shortestAngleDeltaDegrees(measurement.headingDegrees, measurement.selectedHeadingDegrees)) < 1e-6
}

export function isFreshReliableGps(
  gps: FilteredGpsReading,
  course: number | null,
  timestamp: number | null,
  nowMs = Date.now(),
): boolean {
  return gps.courseReliable && validAngle(course) && typeof gps.speedKnots === 'number' &&
    Number.isFinite(gps.speedKnots) && gps.speedKnots >= 0 &&
    typeof timestamp === 'number' && Number.isFinite(timestamp) && Number.isFinite(nowMs) &&
    timestamp <= nowMs + 1_000 && nowMs - timestamp <= COURSE_SAMPLE_MAX_AGE_MS
}
