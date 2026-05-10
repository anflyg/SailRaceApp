import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { Geolocation, type Position } from '@capacitor/geolocation'
import { normalizeDegrees } from '../domain/angles'
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

const liveGpsOptions = {
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

function getPositionCourse(position: Position): number | null {
  const course = finiteNumberOrNull(position.coords.course)

  if (course !== null) {
    return normalizeGpsCourse(course)
  }

  if (!Capacitor.isNativePlatform()) {
    return normalizeGpsCourse(finiteNumberOrNull(position.coords.heading))
  }

  return null
}

function gpsReadingFromPosition(position: Position, status: LiveGpsStatus): LiveGpsReading {
  const speedKnots = speedMetersPerSecondToKnots(finiteNumberOrNull(position.coords.speed))
  const courseDegrees = getPositionCourse(position)
  const courseReliable =
    courseDegrees !== null &&
    speedKnots !== null &&
    speedKnots >= MIN_RELIABLE_COURSE_SPEED_KNOTS

  return {
    status,
    error: null,
    latitude: finiteNumberOrNull(position.coords.latitude),
    longitude: finiteNumberOrNull(position.coords.longitude),
    accuracyMeters: finiteNumberOrNull(position.coords.accuracy),
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

  return 'GPS är inte tillgänglig.'
}

function geolocationAvailable(): boolean {
  return (
    Capacitor.isPluginAvailable('Geolocation') ||
    (typeof navigator !== 'undefined' && typeof navigator.geolocation !== 'undefined')
  )
}

export function useLiveGps(enabled = true): LiveGpsReading {
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
      if (!geolocationAvailable()) {
        updateStatus('unavailable', 'GPS stöds inte på den här enheten.')
        return
      }

      try {
        updateStatus('requesting')

        if (Capacitor.isNativePlatform()) {
          const permissions = await Geolocation.requestPermissions({ permissions: ['location'] })

          if (permissions.location !== 'granted') {
            updateStatus('error', 'GPS-behörighet nekades.')
            return
          }
        }

        const currentPosition = await Geolocation.getCurrentPosition(liveGpsOptions)

        if (!cancelled) {
          setReading(gpsReadingFromPosition(currentPosition, 'requesting'))
        }

        watchId = await Geolocation.watchPosition(liveGpsOptions, (position, error) => {
          if (cancelled) {
            return
          }

          if (error) {
            updateStatus('error', getErrorMessage(error))
            return
          }

          if (!position) {
            updateStatus('unavailable', 'GPS-position saknas.')
            return
          }

          setReading(gpsReadingFromPosition(position, 'watching'))
        })

        if (cancelled && watchId) {
          await Geolocation.clearWatch({ id: watchId })
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
        void Geolocation.clearWatch({ id: watchId }).catch(() => undefined)
      }
    }
  }, [enabled])

  return enabled ? reading : initialReading
}
