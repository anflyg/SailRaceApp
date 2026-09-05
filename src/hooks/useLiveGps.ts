import { useEffect, useState } from 'react'
import { normalizeDegrees } from '../domain/angles'
import { capacitorGpsSource } from '../services/gps/capacitorGpsSource'
import type { GpsPosition, GpsSource, GpsSourceOptions } from '../services/gps/gpsSource'
import type { LiveGpsReading, LiveGpsStatus } from '../types'

const METERS_PER_SECOND_TO_KNOTS = 1.943844

export const MIN_RELIABLE_COURSE_SPEED_KNOTS = 1.5

const initialReading: LiveGpsReading = {
  status: 'idle',
  error: null,
  latitude: null,
  longitude: null,
  accuracyMeters: null,
  speedKnots: null,
  courseDegrees: null,
  courseReliable: false,
  timestamp: null,
}

const liveGpsOptions: GpsSourceOptions = {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 1000,
  minimumUpdateInterval: 1000,
  interval: 1000,
}

function finiteNumberOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function speedMetersPerSecondToKnots(speedMetersPerSecond: number | null): number | null {
  if (speedMetersPerSecond === null || speedMetersPerSecond < 0) {
    return null
  }

  return speedMetersPerSecond * METERS_PER_SECOND_TO_KNOTS
}

function normalizeGpsCourse(courseDegrees: number | null): number | null {
  if (courseDegrees === null || courseDegrees < 0) {
    return null
  }

  return normalizeDegrees(courseDegrees)
}

export function gpsReadingFromPosition(position: GpsPosition, status: LiveGpsStatus): LiveGpsReading {
  const speedKnots = speedMetersPerSecondToKnots(position.speedMetersPerSecond)
  const courseDegrees = normalizeGpsCourse(position.courseDegrees)
  const courseReliable =
    courseDegrees !== null &&
    speedKnots !== null &&
    speedKnots >= MIN_RELIABLE_COURSE_SPEED_KNOTS

  return {
    status,
    error: null,
    latitude: finiteNumberOrNull(position.latitude),
    longitude: finiteNumberOrNull(position.longitude),
    accuracyMeters: finiteNumberOrNull(position.accuracyMeters),
    speedKnots,
    courseDegrees,
    courseReliable,
    timestamp: finiteNumberOrNull(position.timestamp),
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string') {
      return message
    }
  }

  return 'gps_unavailable'
}

export function useLiveGps(enabled = true, gpsSource: GpsSource = capacitorGpsSource): LiveGpsReading {
  const [reading, setReading] = useState<LiveGpsReading>(initialReading)

  useEffect(() => {
    if (!enabled) {
      return
    }

    let cancelled = false
    let watchId: string | null = null

    const updateStatus = (status: LiveGpsStatus, error: string | null = null) => {
      if (!cancelled) {
        setReading((current) => ({
          ...current,
          status,
          error,
        }))
      }
    }

    const startWatching = async () => {
      if (!gpsSource.isAvailable()) {
        updateStatus('unavailable', 'gps_unsupported')
        return
      }

      try {
        updateStatus('requesting')

        const permission = await gpsSource.requestPermission()

        if (permission !== 'granted') {
          updateStatus('error', 'gps_permission_denied')
          return
        }

        const currentPosition = await gpsSource.getCurrentPosition(liveGpsOptions)

        if (!cancelled) {
          setReading(gpsReadingFromPosition(currentPosition, 'requesting'))
        }

        watchId = await gpsSource.watchPosition(liveGpsOptions, (position, error) => {
          if (cancelled) {
            return
          }

          if (error) {
            updateStatus('error', getErrorMessage(error))
            return
          }

          if (!position) {
            updateStatus('unavailable', 'gps_position_missing')
            return
          }

          setReading(gpsReadingFromPosition(position, 'watching'))
        })

        if (cancelled && watchId) {
          await gpsSource.clearWatch(watchId)
          return
        }

        updateStatus('watching')
      } catch (error) {
        updateStatus('error', getErrorMessage(error))
      }
    }

    void startWatching()

    return () => {
      cancelled = true

      if (watchId) {
        void gpsSource.clearWatch(watchId).catch(() => undefined)
      }
    }
  }, [enabled, gpsSource])

  return enabled ? reading : initialReading
}
