import { averageAnglesDegrees, normalizeDegrees } from '../../domain/angles'
import type {
  BoatForwardHeadingReading,
  CourseReading,
  LocationReading,
  SpeedReading,
  WindHeadingReading,
} from './sensorTypes'

function now(): number {
  return Date.now()
}

export async function getCurrentLocation(): Promise<LocationReading> {
  return {
    latitude: 59.32718,
    longitude: 18.07194,
    accuracyMeters: 4.5,
    timestamp: now(),
  }
}

export async function getGpsSpeed(): Promise<SpeedReading> {
  return {
    speedKnots: 6.4,
    accuracyKnots: 0.25,
    source: 'gps',
    timestamp: now(),
  }
}

export async function getGpsCourse(): Promise<CourseReading> {
  const speed = await getGpsSpeed()
  const isReliable = speed.speedKnots >= 1.5

  return {
    courseDegrees: 97,
    accuracyDegrees: 4,
    speedKnots: speed.speedKnots,
    source: 'gps-course',
    isReliable,
    timestamp: now(),
  }
}

export async function getBoatForwardHeadingFromDeviceBack(): Promise<BoatForwardHeadingReading> {
  // TODO(iOS): Replace with Core Motion fused attitude and project the phone back
  // vector to the horizontal plane. The phone's back side points toward the bow.
  return {
    headingDegrees: normalizeDegrees(103.5),
    accuracyDegrees: 6,
    source: 'device-back-fused',
    isReliable: true,
    timestamp: now(),
  }
}

export async function measureWindHeading(sampleCount = 12): Promise<WindHeadingReading> {
  // TODO(iOS): Use Core Motion fused attitude samples over ~1-3 seconds,
  // convert each sample to horizontal back-vector heading and average.
  const baseHeading = 41
  const mockOffsets = [-4, -2, -1, 0, 2, 3, -3, 1, 0, 2, -1, 1]
  const samples = Array.from({ length: sampleCount }, (_, index) =>
    normalizeDegrees(baseHeading + mockOffsets[index % mockOffsets.length]),
  )
  const headingDegrees = averageAnglesDegrees(samples)

  return {
    headingDegrees: headingDegrees ?? normalizeDegrees(baseHeading),
    sampleCount,
    accuracyDegrees: 5,
    source: 'averaged-device-back-heading',
    timestamp: now(),
  }
}
