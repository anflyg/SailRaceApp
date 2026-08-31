import { calculateBearingDegrees } from './navigation'
import { normalizeDegrees, shortestAngleDeltaDegrees } from './angles'

export const GPS_COURSE_MIN_DISPLACEMENT_METERS = 5
export const GPS_COURSE_MIN_SPEED_KNOTS = 1.5
export const GPS_COURSE_MAX_ACCURACY_METERS = 25
export const GPS_COURSE_MIN_BASELINE_MS = 3000
export const GPS_COURSE_MAX_BASELINE_MS = 5000
export const GPS_COURSE_CONSISTENCY_DEGREES = 15
export const GPS_COURSE_NATIVE_SPIKE_DEGREES = 45
export const GPS_COURSE_OVERRIDE_OBSERVATIONS = 3

export interface GpsCoursePosition {
  latitude: number | null
  longitude: number | null
  accuracyMeters: number | null
  timestamp: number | null
}

export interface GpsCourseFusionState {
  previousEffectiveCourse: number | null
  positionEvidenceCourse: number | null
  positionEvidenceCount: number
  nativeSpikeCount: number
}

export function createGpsCourseFusionState(): GpsCourseFusionState {
  return { previousEffectiveCourse: null, positionEvidenceCourse: null, positionEvidenceCount: 0, nativeSpikeCount: 0 }
}

function isReliablePosition(position: GpsCoursePosition | null): position is GpsCoursePosition & { latitude: number; longitude: number; accuracyMeters: number; timestamp: number } {
  return position !== null && Number.isFinite(position.latitude) && Number.isFinite(position.longitude) &&
    position.accuracyMeters !== null && Number.isFinite(position.accuracyMeters) && position.accuracyMeters <= GPS_COURSE_MAX_ACCURACY_METERS &&
    position.timestamp !== null && Number.isFinite(position.timestamp)
}

export function calculatePositionCourseDegrees(
  previous: GpsCoursePosition | null,
  current: GpsCoursePosition,
  effectiveSpeedKnots: number | null,
): number | null {
  if (!isReliablePosition(previous) || !isReliablePosition(current) || effectiveSpeedKnots === null || effectiveSpeedKnots < GPS_COURSE_MIN_SPEED_KNOTS) return null
  const baselineMs = current.timestamp - previous.timestamp
  if (baselineMs < GPS_COURSE_MIN_BASELINE_MS || baselineMs > GPS_COURSE_MAX_BASELINE_MS) return null
  const course = calculateBearingDegrees(previous, current)
  const distanceMeters = (effectiveSpeedKnots / 1.943844) * (baselineMs / 1000)
  if (distanceMeters < GPS_COURSE_MIN_DISPLACEMENT_METERS) return null
  return course
}

export function fuseGpsCourseDegrees(
  nativeCourseDegrees: number | null,
  positionCourseDegrees: number | null,
  effectiveSpeedKnots: number | null,
  state: GpsCourseFusionState,
): number | null {
  const native = nativeCourseDegrees === null ? null : normalizeDegrees(nativeCourseDegrees)
  const position = positionCourseDegrees === null ? null : normalizeDegrees(positionCourseDegrees)
  if (native !== null && position !== null && Math.abs(shortestAngleDeltaDegrees(position, native)) <= GPS_COURSE_CONSISTENCY_DEGREES) {
    state.positionEvidenceCourse = null
    state.positionEvidenceCount = 0
    state.nativeSpikeCount = 0
    state.previousEffectiveCourse = native
    return native
  }
  if (position !== null && effectiveSpeedKnots !== null && effectiveSpeedKnots >= GPS_COURSE_MIN_SPEED_KNOTS) {
    if (state.positionEvidenceCourse !== null && Math.abs(shortestAngleDeltaDegrees(position, state.positionEvidenceCourse)) <= GPS_COURSE_CONSISTENCY_DEGREES) {
      state.positionEvidenceCount += 1
      state.positionEvidenceCourse = normalizeDegrees(state.positionEvidenceCourse + shortestAngleDeltaDegrees(position, state.positionEvidenceCourse) * 0.5)
    } else {
      state.positionEvidenceCourse = position
      state.positionEvidenceCount = 1
    }
    if (native === null || state.positionEvidenceCount >= GPS_COURSE_OVERRIDE_OBSERVATIONS) {
      state.previousEffectiveCourse = position
      return position
    }
  } else {
    state.positionEvidenceCourse = null
    state.positionEvidenceCount = 0
  }
  if (native !== null && state.previousEffectiveCourse !== null && Math.abs(shortestAngleDeltaDegrees(native, state.previousEffectiveCourse)) > GPS_COURSE_NATIVE_SPIKE_DEGREES) {
    state.nativeSpikeCount += 1
    if (state.nativeSpikeCount === 1) return state.previousEffectiveCourse
  } else {
    state.nativeSpikeCount = 0
  }
  const effective = native ?? position ?? state.previousEffectiveCourse
  state.previousEffectiveCourse = effective
  return effective
}
