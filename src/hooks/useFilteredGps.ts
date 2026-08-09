import { useEffect, useMemo, useRef, useState } from 'react'
import { averageAnglesDegrees, normalizeDegrees, shortestAngleDeltaDegrees } from '../domain/angles'
import {
  calculatePositionSpeedKnots,
  filterGpsSpeedKnots,
  fuseGpsSpeedKnots,
  GPS_SPEED_LAST_KNOWN_GRACE_MS,
  GPS_SPEED_MAX_POSITION_BASELINE_MS,
  GPS_SPEED_MIN_POSITION_BASELINE_MS,
  isReliableGpsSpeedPosition,
  keepLastKnownGpsSpeedKnots,
  type LastKnownGpsSpeed,
  type GpsSpeedPosition,
} from '../domain/gpsSpeed'
import { MIN_RELIABLE_COURSE_SPEED_KNOTS } from './useLiveGps'
import type { FilteredGpsReading, LiveGpsReading } from '../types'

export const GPS_FILTER_WINDOW_MS = 3000
export const COURSE_DISPLAY_SMOOTHING_ALPHA = 0.15
export const COURSE_DISPLAY_LOW_SPEED_ALPHA = 0.06
export const COURSE_DISPLAY_FREEZE_SPEED_KNOTS = 0.7
export const COURSE_DISPLAY_MIN_SPEED_KNOTS = 1.0

interface GpsSample {
  timestamp: number
  gpsTimestamp: number | null
  latitude: number | null
  longitude: number | null
  accuracyMeters: number | null
  speedKnots: number | null
  fusedSpeedKnots: number | null
  courseDegrees: number | null
}

interface LastKnownDisplaySpeed extends LastKnownGpsSpeed {
  sourceSample: GpsSample
}

function averageNumbers(values: number[]): number | null {
  if (values.length === 0) {
    return null
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function useFilteredGps(gps: LiveGpsReading): FilteredGpsReading {
  const [samples, setSamples] = useState<GpsSample[]>([])
  const [displayCourseDegrees, setDisplayCourseDegrees] = useState<number | null>(null)
  const [speedGraceTick, setSpeedGraceTick] = useState(0)
  const lastKnownDisplaySpeedRef = useRef<LastKnownDisplaySpeed | null>(null)

  useEffect(() => {
    if (
      gps.timestamp === null &&
      gps.latitude === null &&
      gps.longitude === null &&
      gps.speedKnots === null &&
      gps.courseDegrees === null
    ) {
      return
    }

    const timestamp = gps.timestamp ?? Date.now()
    const cutoff = timestamp - GPS_FILTER_WINDOW_MS
    const timeoutId = window.setTimeout(() => {
      setSamples((current) => {
        const currentPosition: GpsSpeedPosition = {
          latitude: gps.latitude,
          longitude: gps.longitude,
          accuracyMeters: gps.accuracyMeters,
          timestamp: gps.timestamp,
        }
        let previousPosition: GpsSpeedPosition | null = null
        let previousSpeedKnots: number | null = null

        for (let index = current.length - 1; index >= 0; index -= 1) {
          const sample = current[index]

          if (previousSpeedKnots === null && sample.fusedSpeedKnots !== null) {
            previousSpeedKnots = sample.fusedSpeedKnots
          }

          if (previousPosition === null) {
            const candidate: GpsSpeedPosition = {
              latitude: sample.latitude,
              longitude: sample.longitude,
              accuracyMeters: sample.accuracyMeters,
              timestamp: sample.gpsTimestamp,
            }

            if (
              isReliableGpsSpeedPosition(candidate) &&
              isReliableGpsSpeedPosition(currentPosition)
            ) {
              const baselineMs = currentPosition.timestamp - candidate.timestamp

              if (
                baselineMs >= GPS_SPEED_MIN_POSITION_BASELINE_MS &&
                baselineMs <= GPS_SPEED_MAX_POSITION_BASELINE_MS
              ) {
                previousPosition = candidate
              }
            }
          }

          if (previousPosition !== null && previousSpeedKnots !== null) {
            break
          }
        }

        const positionSpeedKnots = calculatePositionSpeedKnots(
          previousPosition,
          currentPosition,
        )
        const fusedSpeedKnots = fuseGpsSpeedKnots(
          gps.speedKnots,
          positionSpeedKnots,
          previousSpeedKnots,
        )

        return [
          ...current.filter((sample) => sample.timestamp >= cutoff),
          {
            timestamp,
            gpsTimestamp: gps.timestamp,
            latitude: gps.latitude,
            longitude: gps.longitude,
            accuracyMeters: gps.accuracyMeters,
            speedKnots: gps.speedKnots,
            fusedSpeedKnots,
            courseDegrees: gps.courseDegrees,
          },
        ]
      })
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [
    gps.accuracyMeters,
    gps.courseDegrees,
    gps.latitude,
    gps.longitude,
    gps.speedKnots,
    gps.timestamp,
  ])

  const filteredSpeedKnots = useMemo(() => {
    const speedValues = samples
      .map((sample) => sample.speedKnots)
      .filter((speedKnots): speedKnots is number => speedKnots !== null)

    return averageNumbers(speedValues)
  }, [samples])

  const filteredDisplaySpeedKnots = useMemo(() => {
    return filterGpsSpeedKnots(samples.map((sample) => sample.fusedSpeedKnots))
  }, [samples])

  const latestFusedSpeedSample = useMemo(() => {
    for (let index = samples.length - 1; index >= 0; index -= 1) {
      if (samples[index].fusedSpeedKnots !== null) {
        return samples[index]
      }
    }

    return null
  }, [samples])

  useEffect(() => {
    if (
      latestFusedSpeedSample === null ||
      filteredDisplaySpeedKnots === null ||
      lastKnownDisplaySpeedRef.current?.sourceSample === latestFusedSpeedSample
    ) {
      return
    }

    lastKnownDisplaySpeedRef.current = {
      speedKnots: filteredDisplaySpeedKnots,
      observedAt: Date.now(),
      sourceSample: latestFusedSpeedSample,
    }
    setSpeedGraceTick((current) => current + 1)
  }, [filteredDisplaySpeedKnots, latestFusedSpeedSample])

  const displaySpeedKnots = useMemo(() => {
    const hasNewFusedSpeed =
      latestFusedSpeedSample !== null &&
      lastKnownDisplaySpeedRef.current?.sourceSample !== latestFusedSpeedSample

    return keepLastKnownGpsSpeedKnots(
      hasNewFusedSpeed ? filteredDisplaySpeedKnots : null,
      lastKnownDisplaySpeedRef.current,
      Date.now(),
    )
  }, [filteredDisplaySpeedKnots, latestFusedSpeedSample, speedGraceTick])

  useEffect(() => {
    const lastKnownSpeed = lastKnownDisplaySpeedRef.current

    if (lastKnownSpeed === null) {
      return
    }

    const remainingMs =
      lastKnownSpeed.observedAt + GPS_SPEED_LAST_KNOWN_GRACE_MS - Date.now()

    if (remainingMs <= 0) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setSpeedGraceTick((current) => current + 1)
    }, remainingMs)

    return () => window.clearTimeout(timeoutId)
  }, [speedGraceTick])

  const filteredCourseDegrees = useMemo(() => {
    const courseValues = samples
      .map((sample) => sample.courseDegrees)
      .filter((courseDegrees): courseDegrees is number => courseDegrees !== null)

    return averageAnglesDegrees(courseValues)
  }, [samples])

  useEffect(() => {
    setDisplayCourseDegrees((currentDisplayCourse) => {
      const speedKnots = filteredSpeedKnots

      if (speedKnots === null) {
        return currentDisplayCourse
      }

      if (speedKnots < COURSE_DISPLAY_FREEZE_SPEED_KNOTS) {
        return currentDisplayCourse
      }

      if (filteredCourseDegrees === null) {
        return currentDisplayCourse
      }

      if (currentDisplayCourse === null) {
        return normalizeDegrees(filteredCourseDegrees)
      }

      const smoothingAlpha = speedKnots < COURSE_DISPLAY_MIN_SPEED_KNOTS
        ? COURSE_DISPLAY_LOW_SPEED_ALPHA
        : COURSE_DISPLAY_SMOOTHING_ALPHA
      const delta = shortestAngleDeltaDegrees(filteredCourseDegrees, currentDisplayCourse)

      return normalizeDegrees(currentDisplayCourse + smoothingAlpha * delta)
    })
  }, [filteredCourseDegrees, filteredSpeedKnots, gps.timestamp])

  return useMemo(() => {
    if (
      gps.timestamp === null &&
      gps.latitude === null &&
      gps.longitude === null &&
      gps.speedKnots === null &&
      gps.courseDegrees === null
    ) {
      return {
        ...gps,
        speedKnots: null,
        courseDegrees: null,
        displayCourseDegrees: null,
        courseReliable: false,
        sampleCount: 0,
      }
    }
    const speedKnots = displaySpeedKnots
    const courseDegrees = filteredCourseDegrees
    const courseReliable =
      courseDegrees !== null &&
      filteredSpeedKnots !== null &&
      filteredSpeedKnots >= MIN_RELIABLE_COURSE_SPEED_KNOTS

    return {
      ...gps,
      speedKnots,
      courseDegrees,
      displayCourseDegrees:
        filteredSpeedKnots !== null &&
          filteredSpeedKnots >= COURSE_DISPLAY_FREEZE_SPEED_KNOTS &&
          displayCourseDegrees !== null
          ? normalizeDegrees(displayCourseDegrees)
          : null,
      courseReliable,
      sampleCount: samples.length,
    }
  }, [
    displayCourseDegrees,
    filteredCourseDegrees,
    displaySpeedKnots,
    filteredSpeedKnots,
    gps,
    samples.length,
  ])
}
