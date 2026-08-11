import {
  computeLaylineCandidate,
  getLaylineReference,
  isHeadingTowardReference,
  type LaylineCandidate,
  type LaylineReference,
} from '../../domain/layline'
import type { CourseState, FilteredGpsReading, GeoPoint } from '../../types'

export interface LaylineObservation {
  reference: LaylineReference | null
  currentCogDegrees: number | null
  movingTowardTarget: boolean
  candidate: LaylineCandidate | null
}

export function getLaylineObservation({
  course,
  gps,
  enabled,
  alphaDegrees,
}: {
  course: CourseState
  gps: FilteredGpsReading
  enabled: boolean
  alphaDegrees: number
}): LaylineObservation {
  const reference = getLaylineReference(course)
  const position = getPosition(gps)
  const currentCogDegrees = gps.courseReliable ? gps.courseDegrees : null
  const speedKnots = gps.speedKnots
  const movingTowardTarget = reference !== null &&
    currentCogDegrees !== null &&
    isHeadingTowardReference(currentCogDegrees, reference.headingDegrees)
  const candidate = enabled &&
    reference !== null &&
    position !== null &&
    currentCogDegrees !== null &&
    speedKnots !== null &&
    movingTowardTarget
    ? computeLaylineCandidate({
      position,
      currentCogDegrees,
      speedKnots,
      alphaDegrees,
      targetMark: reference.target,
    })
    : null

  return { reference, currentCogDegrees, movingTowardTarget, candidate }
}

function getPosition(gps: FilteredGpsReading): GeoPoint | null {
  if (gps.latitude === null || gps.longitude === null) {
    return null
  }

  return { latitude: gps.latitude, longitude: gps.longitude }
}
