import type { CourseState, GeoPoint } from '../types'

export function normalizeDegrees(angle: number): number {
  return ((angle % 360) + 360) % 360
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI
}

export function calculateBearingDegrees(from: GeoPoint, to: GeoPoint): number {
  const fromLat = toRadians(from.latitude)
  const toLat = toRadians(to.latitude)
  const deltaLongitude = toRadians(to.longitude - from.longitude)

  const y = Math.sin(deltaLongitude) * Math.cos(toLat)
  const x =
    Math.cos(fromLat) * Math.sin(toLat) -
    Math.sin(fromLat) * Math.cos(toLat) * Math.cos(deltaLongitude)

  return normalizeDegrees(toDegrees(Math.atan2(y, x)))
}

export function calculateVelocityMadeGood(
  speedKnots: number,
  courseHeadingDegrees: number,
  referenceHeadingDegrees: number,
): number {
  const angleDegrees = normalizeDegrees(
    normalizeDegrees(courseHeadingDegrees) - normalizeDegrees(referenceHeadingDegrees),
  )

  return speedKnots * Math.cos(toRadians(angleDegrees))
}

export function getCourseAxisHeading(course: CourseState): number | null {
  const leewardMark = course.points.lans1
  const windwardMark = course.points.kryss1

  if (!leewardMark || !windwardMark) {
    return null
  }

  return calculateBearingDegrees(leewardMark, windwardMark)
}

export function hasPrimaryCourse(course: CourseState): boolean {
  return course.points.lans1 !== null && course.points.kryss1 !== null
}
