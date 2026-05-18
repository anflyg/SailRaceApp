import { useEffect, useMemo, useState } from 'react'
import { averageAnglesDegrees, normalizeDegrees, shortestAngleDeltaDegrees } from '../domain/angles'
import { MIN_RELIABLE_COURSE_SPEED_KNOTS } from './useLiveGps'
import type { FilteredGpsReading, LiveGpsReading } from '../types'

export const GPS_FILTER_WINDOW_MS = 3000
export const COURSE_DISPLAY_SMOOTHING_ALPHA = 0.15
export const COURSE_DISPLAY_LOW_SPEED_ALPHA = 0.06
export const COURSE_DISPLAY_FREEZE_SPEED_KNOTS = 0.7
export const COURSE_DISPLAY_MIN_SPEED_KNOTS = 1.0

interface GpsSample {
  timestamp: number
  speedKnots: number | null
  courseDegrees: number | null
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
      setSamples((current) => [
        ...current.filter((sample) => sample.timestamp >= cutoff),
        {
          timestamp,
          speedKnots: gps.speedKnots,
          courseDegrees: gps.courseDegrees,
        },
      ])
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
    const speedKnots = filteredSpeedKnots
    const courseDegrees = filteredCourseDegrees
    const courseReliable =
      courseDegrees !== null &&
      speedKnots !== null &&
      speedKnots >= MIN_RELIABLE_COURSE_SPEED_KNOTS

    return {
      ...gps,
      speedKnots,
      courseDegrees,
      displayCourseDegrees:
        speedKnots !== null &&
          speedKnots >= COURSE_DISPLAY_FREEZE_SPEED_KNOTS &&
          displayCourseDegrees !== null
          ? normalizeDegrees(displayCourseDegrees)
          : null,
      courseReliable,
      sampleCount: samples.length,
    }
  }, [displayCourseDegrees, filteredCourseDegrees, filteredSpeedKnots, gps, samples.length])
}
