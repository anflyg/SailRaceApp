import { normalizeDegrees } from './angles'
import type { CourseState, GeoPoint } from '../types'

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI
}

function toLocalMeters(origin: GeoPoint, point: GeoPoint): { x: number, y: number } {
  const metersPerDegreeLatitude = 111_320
  const metersPerDegreeLongitude = metersPerDegreeLatitude * Math.cos(toRadians(origin.latitude))

  return {
    x: (point.longitude - origin.longitude) * metersPerDegreeLongitude,
    y: (point.latitude - origin.latitude) * metersPerDegreeLatitude,
  }
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

export type CourseDisplayReferenceKind = 'course-axis' | 'start-line' | 'north-fallback'

export interface CourseDisplayReference {
  kind: CourseDisplayReferenceKind
  headingDegrees: number
}

export interface StartLineAdvantage {
  favoredEnd: 'A' | 'B' | 'neutral'
  meters: number
}

export function getStartLineHeading(course: CourseState): number | null {
  const startA = course.points.startA
  const startB = course.points.startB

  if (!startA || !startB) {
    return null
  }

  return calculateBearingDegrees(startA, startB)
}

export function getCourseDisplayReference(course: CourseState): CourseDisplayReference {
  const courseAxisHeading = getCourseAxisHeading(course)

  if (courseAxisHeading !== null) {
    return {
      kind: 'course-axis',
      headingDegrees: courseAxisHeading,
    }
  }

  const startLineHeading = getStartLineHeading(course)

  if (startLineHeading !== null) {
    return {
      kind: 'start-line',
      headingDegrees: startLineHeading,
    }
  }

  return {
    kind: 'north-fallback',
    headingDegrees: 0,
  }
}

export function getRelativeDisplayAngleDegrees(
  angleDegrees: number,
  referenceHeadingDegrees: number,
): number {
  return normalizeDegrees(angleDegrees - referenceHeadingDegrees)
}

export function getStartLineAdvantageMeters(course: CourseState): StartLineAdvantage | null {
  const startA = course.points.startA
  const startB = course.points.startB
  const leewardMark = course.points.lans1
  const windwardMark = course.points.kryss1

  if (!startA || !startB || !leewardMark || !windwardMark) {
    return null
  }

  const courseAxisHeading = calculateBearingDegrees(leewardMark, windwardMark)
  const axisRadians = toRadians(courseAxisHeading)
  const courseAxisUnitVector = {
    x: Math.sin(axisRadians),
    y: Math.cos(axisRadians),
  }
  const localA = toLocalMeters(leewardMark, startA)
  const localB = toLocalMeters(leewardMark, startB)
  const projectionA =
    localA.x * courseAxisUnitVector.x + localA.y * courseAxisUnitVector.y
  const projectionB =
    localB.x * courseAxisUnitVector.x + localB.y * courseAxisUnitVector.y
  const differenceMeters = projectionA - projectionB

  if (!Number.isFinite(differenceMeters)) {
    return null
  }

  if (Math.abs(differenceMeters) < 1) {
    return {
      favoredEnd: 'neutral',
      meters: 0,
    }
  }

  return {
    favoredEnd: differenceMeters > 0 ? 'A' : 'B',
    meters: Math.abs(differenceMeters),
  }
}

export function hasPrimaryCourse(course: CourseState): boolean {
  return course.points.lans1 !== null && course.points.kryss1 !== null
}
