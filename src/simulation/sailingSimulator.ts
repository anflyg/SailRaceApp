import { normalizeDegrees } from '../domain/angles'
import type { GeoPoint } from '../types'
import type { GpsPosition } from '../services/gps/gpsSource'
import { localPositionToGeoPoint, type LocalPosition } from './localCoordinates'

const KNOTS_PER_METER_PER_SECOND = 1.943844

export interface SailingSimulatorConfig {
  origin: GeoPoint
  initialPosition?: LocalPosition
  courseDegrees: number
  targetSpeedKnots: number
  timeStepSeconds?: number
  startTimestamp?: number
  accuracyMeters?: number
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
  courseDegrees: number
  speedMetersPerSecond: number | null
  accuracyMeters: number
}

export interface SailingSimulator {
  currentSample(): SailingSimulationSample
  step(): SailingSimulationSample
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

function createSample(
  config: Required<Pick<SailingSimulatorConfig, 'origin' | 'targetSpeedKnots' | 'timeStepSeconds' | 'startTimestamp' | 'accuracyMeters'>>,
  position: LocalPosition,
  elapsedTimeSeconds: number,
  courseDegrees: number,
  groundTruthSpeedKnots: number | null,
): SailingSimulationSample {
  const point = localPositionToGeoPoint(config.origin, position)

  return {
    elapsedTimeSeconds,
    timestamp: config.startTimestamp + elapsedTimeSeconds * 1000,
    localXmeters: position.xMeters,
    localYmeters: position.yMeters,
    latitude: point.latitude,
    longitude: point.longitude,
    targetSpeedKnots: config.targetSpeedKnots,
    groundTruthSpeedKnots,
    courseDegrees,
    speedMetersPerSecond: groundTruthSpeedKnots === null
      ? null
      : groundTruthSpeedKnots / KNOTS_PER_METER_PER_SECOND,
    accuracyMeters: config.accuracyMeters,
  }
}

export function sampleToGpsPosition(sample: SailingSimulationSample): GpsPosition {
  return {
    latitude: sample.latitude,
    longitude: sample.longitude,
    accuracyMeters: sample.accuracyMeters,
    speedMetersPerSecond: sample.speedMetersPerSecond,
    courseDegrees: sample.courseDegrees,
    headingDegrees: sample.courseDegrees,
    timestamp: sample.timestamp,
  }
}

export function createSailingSimulator(config: SailingSimulatorConfig): SailingSimulator {
  const timeStepSeconds = config.timeStepSeconds ?? 1
  const accuracyMeters = config.accuracyMeters ?? 3
  const startTimestamp = config.startTimestamp ?? 0
  const courseDegrees = normalizeDegrees(config.courseDegrees)
  const targetSpeedMetersPerSecond = config.targetSpeedKnots / KNOTS_PER_METER_PER_SECOND
  let position: LocalPosition = config.initialPosition ?? { xMeters: 0, yMeters: 0 }
  let elapsedTimeSeconds = 0
  let sample = createSample(
    { ...config, timeStepSeconds, accuracyMeters, startTimestamp },
    position,
    elapsedTimeSeconds,
    courseDegrees,
    null,
  )

  return {
    currentSample: () => sample,

    step: () => {
      const courseRadians = toRadians(courseDegrees)
      const previousPosition = position
      const distanceMeters = targetSpeedMetersPerSecond * timeStepSeconds
      position = {
        xMeters: previousPosition.xMeters + distanceMeters * Math.sin(courseRadians),
        yMeters: previousPosition.yMeters + distanceMeters * Math.cos(courseRadians),
      }
      elapsedTimeSeconds += timeStepSeconds

      const movedDistanceMeters = Math.hypot(
        position.xMeters - previousPosition.xMeters,
        position.yMeters - previousPosition.yMeters,
      )
      const groundTruthSpeedKnots =
        (movedDistanceMeters / timeStepSeconds) * KNOTS_PER_METER_PER_SECOND

      sample = createSample(
        { ...config, timeStepSeconds, accuracyMeters, startTimestamp },
        position,
        elapsedTimeSeconds,
        courseDegrees,
        groundTruthSpeedKnots,
      )

      return sample
    },
  }
}
