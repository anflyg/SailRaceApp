import { normalizeDegrees, shortestAngleDeltaDegrees } from '../domain/angles'
import type { GeoPoint } from '../types'
import type { GpsPosition } from '../services/gps/gpsSource'
import { localPositionToGeoPoint, type LocalPosition } from './localCoordinates'

const KNOTS_PER_METER_PER_SECOND = 1.943844

export interface SpeedProfilePoint {
  elapsedTimeSeconds: number
  speedKnots: number
}

export interface CourseProfilePoint {
  elapsedTimeSeconds: number
  courseDegrees: number
}

export interface SailingSimulatorConfig {
  origin: GeoPoint
  initialPosition?: LocalPosition
  courseDegrees?: number
  courseProfile?: readonly CourseProfilePoint[]
  courseNoiseDegrees?: readonly number[]
  targetSpeedKnots?: number
  speedProfile?: readonly SpeedProfilePoint[]
  timeStepSeconds?: number
  startTimestamp?: number
  accuracyMeters?: number
  reportedSpeedKnots?: number
}

export interface SailingSimulationSample {
  elapsedTimeSeconds: number
  timestamp: number
  localXmeters: number
  localYmeters: number
  latitude: number
  longitude: number
  targetSpeedKnots: number
  groundTruthSpeedKnots: number | null
  targetCourseDegrees: number
  groundTruthCourseDegrees: number | null
  courseDegrees: number
  speedMetersPerSecond: number | null
  accuracyMeters: number
  reportedSpeedKnots?: number | null
}

export interface SailingSimulator {
  currentSample(): SailingSimulationSample
  step(): SailingSimulationSample
  setCommandedCourseDegrees(courseDegrees: number): void
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

function createSample(
  config: SailingSimulatorConfig & Required<Pick<SailingSimulatorConfig, 'origin' | 'timeStepSeconds' | 'startTimestamp' | 'accuracyMeters'>>,
  position: LocalPosition,
  elapsedTimeSeconds: number,
  courseDegrees: number,
  targetSpeedKnots: number,
  groundTruthSpeedKnots: number | null,
  targetCourseDegrees: number,
  groundTruthCourseDegrees: number | null,
): SailingSimulationSample {
  const point = localPositionToGeoPoint(config.origin, position)

  return {
    elapsedTimeSeconds,
    timestamp: config.startTimestamp + elapsedTimeSeconds * 1000,
    localXmeters: position.xMeters,
    localYmeters: position.yMeters,
    latitude: point.latitude,
    longitude: point.longitude,
    targetSpeedKnots,
    groundTruthSpeedKnots,
    targetCourseDegrees,
    groundTruthCourseDegrees,
    courseDegrees,
    speedMetersPerSecond: groundTruthSpeedKnots === null
      ? null
      : groundTruthSpeedKnots / KNOTS_PER_METER_PER_SECOND,
    accuracyMeters: config.accuracyMeters,
    reportedSpeedKnots: config.reportedSpeedKnots ?? null,
  }
}

export function getCourseFromDisplacement(deltaXmeters: number, deltaYmeters: number): number | null {
  if (Math.hypot(deltaXmeters, deltaYmeters) <= Number.EPSILON) {
    return null
  }

  return normalizeDegrees((Math.atan2(deltaXmeters, deltaYmeters) * 180) / Math.PI)
}

function getTargetSpeedKnots(
  speedProfile: readonly SpeedProfilePoint[] | undefined,
  fallbackSpeedKnots: number | undefined,
  elapsedTimeSeconds: number,
): number {
  if (!speedProfile || speedProfile.length === 0) {
    if (fallbackSpeedKnots === undefined) {
      throw new Error('SailingSimulator requires targetSpeedKnots or a speedProfile')
    }

    return fallbackSpeedKnots
  }

  const firstPoint = speedProfile[0]
  const lastPoint = speedProfile[speedProfile.length - 1]

  if (elapsedTimeSeconds <= firstPoint.elapsedTimeSeconds) {
    return firstPoint.speedKnots
  }

  if (elapsedTimeSeconds >= lastPoint.elapsedTimeSeconds) {
    return lastPoint.speedKnots
  }

  for (let index = 1; index < speedProfile.length; index += 1) {
    const nextPoint = speedProfile[index]
    const previousPoint = speedProfile[index - 1]

    if (elapsedTimeSeconds <= nextPoint.elapsedTimeSeconds) {
      const progress =
        (elapsedTimeSeconds - previousPoint.elapsedTimeSeconds) /
        (nextPoint.elapsedTimeSeconds - previousPoint.elapsedTimeSeconds)
      return previousPoint.speedKnots + (nextPoint.speedKnots - previousPoint.speedKnots) * progress
    }
  }

  return lastPoint.speedKnots
}

function getTargetCourseDegrees(
  courseProfile: readonly CourseProfilePoint[] | undefined,
  fallbackCourseDegrees: number | undefined,
  elapsedTimeSeconds: number,
): number {
  if (!courseProfile || courseProfile.length === 0) {
    if (fallbackCourseDegrees === undefined) {
      throw new Error('SailingSimulator requires courseDegrees or a courseProfile')
    }

    return normalizeDegrees(fallbackCourseDegrees)
  }

  const firstPoint = courseProfile[0]
  const lastPoint = courseProfile[courseProfile.length - 1]

  if (elapsedTimeSeconds <= firstPoint.elapsedTimeSeconds) {
    return normalizeDegrees(firstPoint.courseDegrees)
  }

  if (elapsedTimeSeconds >= lastPoint.elapsedTimeSeconds) {
    return normalizeDegrees(lastPoint.courseDegrees)
  }

  for (let index = 1; index < courseProfile.length; index += 1) {
    const nextPoint = courseProfile[index]
    const previousPoint = courseProfile[index - 1]

    if (elapsedTimeSeconds <= nextPoint.elapsedTimeSeconds) {
      const progress =
        (elapsedTimeSeconds - previousPoint.elapsedTimeSeconds) /
        (nextPoint.elapsedTimeSeconds - previousPoint.elapsedTimeSeconds)
      const delta = shortestAngleDeltaDegrees(nextPoint.courseDegrees, previousPoint.courseDegrees)
      return normalizeDegrees(previousPoint.courseDegrees + delta * progress)
    }
  }

  return normalizeDegrees(lastPoint.courseDegrees)
}

export function getGpsReportedCourseDegrees(
  groundTruthCourseDegrees: number | null,
  fallbackCourseDegrees: number,
  courseNoiseDegrees: readonly number[] | undefined,
  elapsedTimeSeconds: number,
): number {
  if (groundTruthCourseDegrees === null || !courseNoiseDegrees || courseNoiseDegrees.length === 0) {
    return groundTruthCourseDegrees ?? fallbackCourseDegrees
  }

  const noiseOffset = courseNoiseDegrees[elapsedTimeSeconds % courseNoiseDegrees.length]
  return normalizeDegrees(groundTruthCourseDegrees + noiseOffset)
}

export function sampleToGpsPosition(sample: SailingSimulationSample): GpsPosition {
  return {
    latitude: sample.latitude,
    longitude: sample.longitude,
    accuracyMeters: sample.accuracyMeters,
    speedMetersPerSecond: sample.reportedSpeedKnots == null ? sample.speedMetersPerSecond : sample.reportedSpeedKnots / KNOTS_PER_METER_PER_SECOND,
    courseDegrees: sample.courseDegrees,
    headingDegrees: sample.courseDegrees,
    timestamp: sample.timestamp,
  }
}

export function createSailingSimulator(config: SailingSimulatorConfig): SailingSimulator {
  const timeStepSeconds = config.timeStepSeconds ?? 1
  const accuracyMeters = config.accuracyMeters ?? 3
  const startTimestamp = config.startTimestamp ?? 0
  let position: LocalPosition = config.initialPosition ?? { xMeters: 0, yMeters: 0 }
  let elapsedTimeSeconds = 0
  let targetSpeedKnots = getTargetSpeedKnots(config.speedProfile, config.targetSpeedKnots, elapsedTimeSeconds)
  let targetCourseDegrees = getTargetCourseDegrees(config.courseProfile, config.courseDegrees, elapsedTimeSeconds)
  let commandedCourseDegrees: number | null = null
  let sample = createSample(
    { ...config, timeStepSeconds, accuracyMeters, startTimestamp },
    position,
    elapsedTimeSeconds,
    getGpsReportedCourseDegrees(null, targetCourseDegrees, config.courseNoiseDegrees, elapsedTimeSeconds),
    targetSpeedKnots,
    null,
    targetCourseDegrees,
    null,
  )

  return {
    currentSample: () => sample,
    setCommandedCourseDegrees: (courseDegrees) => {
      commandedCourseDegrees = normalizeDegrees(courseDegrees)
    },

    step: () => {
      const previousPosition = position
      elapsedTimeSeconds += timeStepSeconds
      targetSpeedKnots = getTargetSpeedKnots(config.speedProfile, config.targetSpeedKnots, elapsedTimeSeconds)
      targetCourseDegrees = commandedCourseDegrees ?? getTargetCourseDegrees(config.courseProfile, config.courseDegrees, elapsedTimeSeconds)
      const courseRadians = toRadians(targetCourseDegrees)
      const targetSpeedMetersPerSecond = targetSpeedKnots / KNOTS_PER_METER_PER_SECOND
      const distanceMeters = targetSpeedMetersPerSecond * timeStepSeconds
      position = {
        xMeters: previousPosition.xMeters + distanceMeters * Math.sin(courseRadians),
        yMeters: previousPosition.yMeters + distanceMeters * Math.cos(courseRadians),
      }
      const movedDistanceMeters = Math.hypot(
        position.xMeters - previousPosition.xMeters,
        position.yMeters - previousPosition.yMeters,
      )
      const groundTruthSpeedKnots =
        (movedDistanceMeters / timeStepSeconds) * KNOTS_PER_METER_PER_SECOND
      const groundTruthCourseDegrees = getCourseFromDisplacement(
        position.xMeters - previousPosition.xMeters,
        position.yMeters - previousPosition.yMeters,
      )

      sample = createSample(
        { ...config, timeStepSeconds, accuracyMeters, startTimestamp },
        position,
        elapsedTimeSeconds,
        getGpsReportedCourseDegrees(
          groundTruthCourseDegrees,
          targetCourseDegrees,
          config.courseNoiseDegrees,
          elapsedTimeSeconds,
        ),
        targetSpeedKnots,
        groundTruthSpeedKnots,
        targetCourseDegrees,
        groundTruthCourseDegrees,
      )

      return sample
    },
  }
}
