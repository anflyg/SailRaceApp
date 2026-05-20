import { normalizeDegrees, shortestAngleDeltaDegrees } from './angles'
import type { CoursePoint, CourseState, GeoPoint, LaylineVariant } from '../types'

const METERS_PER_DEGREE_LATITUDE = 111_320
const KNOTS_TO_METERS_PER_SECOND = 0.514444
const MIN_VALID_DISTANCE_METERS = 0.1
const PARALLEL_EPSILON = 1e-6

export type LaylineReferenceSource = 'l1-k1' | 'startline-mid-k1'

export interface LaylineReference {
  source: LaylineReferenceSource
  headingDegrees: number
  target: CoursePoint
}

export interface LaylineCandidate {
  laylineVariant: LaylineVariant
  postTackHeadingDegrees: number
  tackPoint: GeoPoint
  distanceToTackMeters: number
  timeToTackSeconds: number
}

export interface LaylineComputationInput {
  position: GeoPoint
  currentCogDegrees: number
  speedKnots: number
  alphaDegrees: number
  targetMark: GeoPoint
}

export function getLaylineReference(course: CourseState): LaylineReference | null {
  const target = course.points.kryss1

  if (!target) {
    return null
  }

  if (course.points.lans1) {
    return {
      source: 'l1-k1',
      headingDegrees: calculateBearingDegrees(course.points.lans1, target),
      target,
    }
  }

  if (course.points.startA && course.points.startB) {
    const startMidpoint = {
      latitude: (course.points.startA.latitude + course.points.startB.latitude) / 2,
      longitude: (course.points.startA.longitude + course.points.startB.longitude) / 2,
    }

    return {
      source: 'startline-mid-k1',
      headingDegrees: calculateBearingDegrees(startMidpoint, target),
      target,
    }
  }

  return null
}

export function isHeadingTowardReference(
  currentCogDegrees: number,
  referenceHeadingDegrees: number,
  halfWindowDegrees = 90,
): boolean {
  return Math.abs(shortestAngleDeltaDegrees(currentCogDegrees, referenceHeadingDegrees)) <= halfWindowDegrees
}

export function computeLaylineCandidate(input: LaylineComputationInput): LaylineCandidate | null {
  if (!Number.isFinite(input.speedKnots) || input.speedKnots <= 0) {
    return null
  }

  const candidates = computeLaylineCandidates(input)

  if (candidates.length === 0) {
    return null
  }

  return candidates.reduce((best, candidate) => (
    candidate.distanceToTackMeters < best.distanceToTackMeters ? candidate : best
  ))
}

export function computeLaylineCandidates(input: LaylineComputationInput): LaylineCandidate[] {
  const variants: Array<{ laylineVariant: LaylineVariant; heading: number }> = [
    { laylineVariant: 'plus-alpha', heading: normalizeDegrees(input.currentCogDegrees + input.alphaDegrees) },
    { laylineVariant: 'minus-alpha', heading: normalizeDegrees(input.currentCogDegrees - input.alphaDegrees) },
  ]

  const speedMetersPerSecond = input.speedKnots * KNOTS_TO_METERS_PER_SECOND

  return variants
    .map(({ laylineVariant, heading }) => {
      const solution = calculateTackPoint({
        position: input.position,
        currentCogDegrees: input.currentCogDegrees,
        postTackHeadingDegrees: heading,
        targetMark: input.targetMark,
      })

      if (!solution || speedMetersPerSecond <= 0) {
        return null
      }

      return {
        laylineVariant,
        postTackHeadingDegrees: heading,
        tackPoint: solution.tackPoint,
        distanceToTackMeters: solution.distanceToTackMeters,
        timeToTackSeconds: solution.distanceToTackMeters / speedMetersPerSecond,
      } satisfies LaylineCandidate
    })
    .filter((candidate): candidate is LaylineCandidate => candidate !== null)
}

interface TackPointInput {
  position: GeoPoint
  currentCogDegrees: number
  postTackHeadingDegrees: number
  targetMark: GeoPoint
}

interface TackPointSolution {
  tackPoint: GeoPoint
  distanceToTackMeters: number
}

function calculateTackPoint(input: TackPointInput): TackPointSolution | null {
  const targetLocal = toLocalMeters(input.position, input.targetMark)
  const currentUnit = headingToUnitVector(input.currentCogDegrees)
  const postTackReverseUnit = headingToUnitVector(normalizeDegrees(input.postTackHeadingDegrees + 180))
  const denominator = cross(currentUnit, postTackReverseUnit)

  if (Math.abs(denominator) < PARALLEL_EPSILON) {
    return null
  }

  const t = cross(targetLocal, postTackReverseUnit) / denominator
  const intersection = {
    x: currentUnit.x * t,
    y: currentUnit.y * t,
  }
  const targetFromTack = {
    x: targetLocal.x - intersection.x,
    y: targetLocal.y - intersection.y,
  }
  const postTackUnit = headingToUnitVector(input.postTackHeadingDegrees)
  const targetAheadAfterTack = dot(targetFromTack, postTackUnit) > MIN_VALID_DISTANCE_METERS

  if (t <= MIN_VALID_DISTANCE_METERS || !targetAheadAfterTack) {
    return null
  }

  return {
    tackPoint: toGeoPoint(input.position, intersection),
    distanceToTackMeters: t,
  }
}

function headingToUnitVector(headingDegrees: number): { x: number; y: number } {
  const radians = (normalizeDegrees(headingDegrees) * Math.PI) / 180

  return {
    x: Math.sin(radians),
    y: Math.cos(radians),
  }
}

function toLocalMeters(origin: GeoPoint, point: GeoPoint): { x: number; y: number } {
  const metersPerDegreeLongitude = METERS_PER_DEGREE_LATITUDE * Math.cos((origin.latitude * Math.PI) / 180)

  return {
    x: (point.longitude - origin.longitude) * metersPerDegreeLongitude,
    y: (point.latitude - origin.latitude) * METERS_PER_DEGREE_LATITUDE,
  }
}

function toGeoPoint(origin: GeoPoint, localMeters: { x: number; y: number }): GeoPoint {
  const metersPerDegreeLongitude = METERS_PER_DEGREE_LATITUDE * Math.cos((origin.latitude * Math.PI) / 180)

  return {
    latitude: origin.latitude + (localMeters.y / METERS_PER_DEGREE_LATITUDE),
    longitude: origin.longitude + (localMeters.x / metersPerDegreeLongitude),
  }
}

function cross(first: { x: number; y: number }, second: { x: number; y: number }): number {
  return first.x * second.y - first.y * second.x
}

function dot(first: { x: number; y: number }, second: { x: number; y: number }): number {
  return first.x * second.x + first.y * second.y
}

function calculateBearingDegrees(from: GeoPoint, to: GeoPoint): number {
  const fromLatitudeRadians = (from.latitude * Math.PI) / 180
  const toLatitudeRadians = (to.latitude * Math.PI) / 180
  const deltaLongitudeRadians = ((to.longitude - from.longitude) * Math.PI) / 180
  const y = Math.sin(deltaLongitudeRadians) * Math.cos(toLatitudeRadians)
  const x =
    Math.cos(fromLatitudeRadians) * Math.sin(toLatitudeRadians) -
    Math.sin(fromLatitudeRadians) * Math.cos(toLatitudeRadians) * Math.cos(deltaLongitudeRadians)

  return normalizeDegrees((Math.atan2(y, x) * 180) / Math.PI)
}
