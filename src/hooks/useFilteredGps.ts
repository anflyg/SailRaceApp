import { useEffect, useMemo, useState } from 'react'
import { averageAnglesDegrees } from '../domain/angles'
import { MIN_RELIABLE_COURSE_SPEED_KNOTS } from './useLiveGps'
import type { FilteredGpsReading, LiveGpsReading } from '../types'

export const GPS_FILTER_WINDOW_MS = 3000

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
        courseReliable: false,
        sampleCount: 0,
      }
    }

    const speedValues = samples
      .map((sample) => sample.speedKnots)
      .filter((speedKnots): speedKnots is number => speedKnots !== null)
    const courseValues = samples
      .map((sample) => sample.courseDegrees)
      .filter((courseDegrees): courseDegrees is number => courseDegrees !== null)
    const speedKnots = averageNumbers(speedValues)
    const courseDegrees = averageAnglesDegrees(courseValues)
    const courseReliable =
      courseDegrees !== null &&
      speedKnots !== null &&
      speedKnots >= MIN_RELIABLE_COURSE_SPEED_KNOTS

    return {
      ...gps,
      speedKnots,
      courseDegrees,
      courseReliable,
      sampleCount: samples.length,
    }
  }, [gps, samples])
}
