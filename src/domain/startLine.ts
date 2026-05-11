import { getStartLineQuality, GOOD_GPS_ACCURACY_METERS } from './gps'
import type { CoursePoint, GeoPoint } from '../types'

export const MIN_TTL_SPEED_KNOTS = 1
export const KNOTS_TO_METERS_PER_SECOND = 0.514444

export type StartStatusText =
  | 'GPS SAKNAS'
  | 'SAKNAR LINJE'
  | 'GPS OSÄKER'
  | 'FÖR LÅG FART'
  | 'UTANFÖR LINJEN'
  | 'LINJE OSÄKER'

interface LocalPoint {
  x: number
  y: number
}

export interface TimeToLineInput {
  boatPosition: GeoPoint
  startA: GeoPoint
  startB: GeoPoint
  courseDegrees: number
  speedKnots: number
}

export interface StartMetricsInput {
  boatPosition: GeoPoint | null
  currentAccuracyMeters: number | null
  startA: CoursePoint | null
  startB: CoursePoint | null
  courseDegrees: number | null
  speedKnots: number | null
  countdownSeconds: number
}

export interface StartMetrics {
  ttlSeconds: number | null
  burnSeconds: number | null
  statusText: StartStatusText | null
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

function cross(a: LocalPoint, b: LocalPoint): number {
  return a.x * b.y - a.y * b.x
}

function toLocalMeters(origin: GeoPoint, point: GeoPoint): LocalPoint {
  const metersPerDegreeLatitude = 111_320
  const metersPerDegreeLongitude = metersPerDegreeLatitude * Math.cos(toRadians(origin.latitude))

  return {
    x: (point.longitude - origin.longitude) * metersPerDegreeLongitude,
    y: (point.latitude - origin.latitude) * metersPerDegreeLatitude,
  }
}

export function calculateTimeToLine({
  boatPosition,
  startA,
  startB,
  courseDegrees,
  speedKnots,
}: TimeToLineInput): number | null {
  const speedMetersPerSecond = speedKnots * KNOTS_TO_METERS_PER_SECOND

  if (speedMetersPerSecond <= 0) {
    return null
  }

  const startALocal = toLocalMeters(boatPosition, startA)
  const startBLocal = toLocalMeters(boatPosition, startB)
  const courseRadians = toRadians(courseDegrees)
  const rayDirection = {
    x: Math.sin(courseRadians),
    y: Math.cos(courseRadians),
  }
  const segmentDirection = {
    x: startBLocal.x - startALocal.x,
    y: startBLocal.y - startALocal.y,
  }
  const denominator = cross(rayDirection, segmentDirection)

  if (Math.abs(denominator) < 1e-9) {
    return null
  }

  const rayMeters = cross(startALocal, segmentDirection) / denominator
  const segmentPosition = cross(startALocal, rayDirection) / denominator

  if (rayMeters < 0 || segmentPosition < 0 || segmentPosition > 1) {
    return null
  }

  return Math.round(rayMeters / speedMetersPerSecond)
}

export function calculateBurn(countdownSeconds: number, ttlSeconds: number): number {
  return countdownSeconds - ttlSeconds
}

export function calculateStartMetrics({
  boatPosition,
  currentAccuracyMeters,
  startA,
  startB,
  courseDegrees,
  speedKnots,
  countdownSeconds,
}: StartMetricsInput): StartMetrics {
  if (!boatPosition) {
    return {
      ttlSeconds: null,
      burnSeconds: null,
      statusText: 'GPS SAKNAS',
    }
  }

  if (!startA || !startB) {
    return {
      ttlSeconds: null,
      burnSeconds: null,
      statusText: 'SAKNAR LINJE',
    }
  }

  if (currentAccuracyMeters === null || currentAccuracyMeters > GOOD_GPS_ACCURACY_METERS) {
    return {
      ttlSeconds: null,
      burnSeconds: null,
      statusText: 'GPS OSÄKER',
    }
  }

  if (speedKnots === null || speedKnots < MIN_TTL_SPEED_KNOTS) {
    return {
      ttlSeconds: null,
      burnSeconds: null,
      statusText: 'FÖR LÅG FART',
    }
  }

  if (courseDegrees === null) {
    return {
      ttlSeconds: null,
      burnSeconds: null,
      statusText: 'UTANFÖR LINJEN',
    }
  }

  const ttlSeconds = calculateTimeToLine({
    boatPosition,
    startA,
    startB,
    courseDegrees,
    speedKnots,
  })

  if (ttlSeconds === null) {
    return {
      ttlSeconds: null,
      burnSeconds: null,
      statusText: 'UTANFÖR LINJEN',
    }
  }

  return {
    ttlSeconds,
    burnSeconds: calculateBurn(countdownSeconds, ttlSeconds),
    statusText: getStartLineQuality(startA, startB) === 'poor' ? 'LINJE OSÄKER' : null,
  }
}
