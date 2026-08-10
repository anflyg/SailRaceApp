import { describe, expect, it } from 'vitest'
import { createFakeGpsSource } from '../services/gps/fakeGpsSource'
import type { GpsPosition, GpsSourceOptions } from '../services/gps/gpsSource'
import { MIN_RELIABLE_COURSE_SPEED_KNOTS, gpsReadingFromPosition } from './useLiveGps'

const sourceOptions: GpsSourceOptions = {
  enableHighAccuracy: true,
  timeout: 10_000,
  maximumAge: 1_000,
  minimumUpdateInterval: 1_000,
  interval: 1_000,
}

const position: GpsPosition = {
  latitude: 59.3293,
  longitude: 18.0686,
  accuracyMeters: 4,
  speedMetersPerSecond: 5,
  courseDegrees: 370,
  headingDegrees: null,
  timestamp: 1_700_000_000_000,
}

describe('GPS source integration', () => {
  it('maps a fake source reading to the reading consumed by useLiveGps', async () => {
    const source = createFakeGpsSource(position)
    const sourcePosition = await source.getCurrentPosition(sourceOptions)

    expect(gpsReadingFromPosition(sourcePosition, 'watching')).toMatchObject({
      status: 'watching',
      latitude: 59.3293,
      longitude: 18.0686,
      accuracyMeters: 4,
      timestamp: 1_700_000_000_000,
      speedKnots: 9.71922,
      courseDegrees: 10,
      courseReliable: true,
    })
  })

  it('converts m/s to knots and normalizes course degrees', () => {
    const reading = gpsReadingFromPosition(position, 'watching')

    expect(reading.speedKnots).toBeCloseTo(9.71922, 5)
    expect(reading.courseDegrees).toBe(10)
  })

  it('marks course as reliable at and above the existing speed threshold', () => {
    const belowThreshold = gpsReadingFromPosition({
      ...position,
      speedMetersPerSecond: (MIN_RELIABLE_COURSE_SPEED_KNOTS - 0.1) / 1.943844,
    }, 'watching')
    const atThreshold = gpsReadingFromPosition({
      ...position,
      speedMetersPerSecond: MIN_RELIABLE_COURSE_SPEED_KNOTS / 1.943844,
    }, 'watching')

    expect(belowThreshold.courseReliable).toBe(false)
    expect(atThreshold.courseReliable).toBe(true)
  })

  it('clears fake source watches', async () => {
    const source = createFakeGpsSource(position)
    let updateCount = 0
    const watchId = await source.watchPosition(sourceOptions, () => {
      updateCount += 1
    })

    source.emitPosition(position)

    await source.clearWatch(watchId)
    source.emitPosition({ ...position, latitude: 59.33 })

    expect(source.clearedWatchIds).toEqual([watchId])
    expect(updateCount).toBe(1)
  })
})
