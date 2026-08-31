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
  createGpsSpeedFusionState,
  type GpsSpeedFusionState,
} from '../domain/gpsSpeed'
import { MIN_RELIABLE_COURSE_SPEED_KNOTS } from './useLiveGps'
import { calculatePositionCourseDegrees, createGpsCourseFusionState, fuseGpsCourseDegrees, GPS_COURSE_MIN_BASELINE_MS, GPS_COURSE_MAX_BASELINE_MS, type GpsCoursePosition } from '../domain/gpsCourse'
import type { FilteredGpsReading, LiveGpsReading } from '../types'

export const GPS_FILTER_WINDOW_MS = 3000
export const COURSE_DISPLAY_SMOOTHING_ALPHA = 0.15
export const COURSE_DISPLAY_LOW_SPEED_ALPHA = 0.06
export const COURSE_DISPLAY_FREEZE_SPEED_KNOTS = 0.7
export const COURSE_DISPLAY_MIN_SPEED_KNOTS = 1.0
export const COURSE_DISPLAY_FAST_THRESHOLD_DEGREES = 12
export const COURSE_DISPLAY_FAST_SMOOTHING_ALPHA = 0.7

interface GpsSample {
  timestamp: number
  gpsTimestamp: number | null
  latitude: number | null
  longitude: number | null
  accuracyMeters: number | null
  speedKnots: number | null
  positionSpeedKnots: number | null
  fusedSpeedKnots: number | null
  nativeCourseDegrees: number | null
  positionCourseDegrees: number | null
  fusedCourseDegrees: number | null
}

interface LastKnownDisplaySpeed extends LastKnownGpsSpeed {
  sourceSample: GpsSample
}

export interface ProcessedGpsTimestampSample {
  gpsTimestamp: number | null
}

export function getLatestProcessedGpsTimestamp(
  samples: ReadonlyArray<ProcessedGpsTimestampSample>,
): number | null {
  return samples.length > 0 ? samples[samples.length - 1].gpsTimestamp : null
}

function averageNumbers(values: number[]): number | null {
  if (values.length === 0) {
    return null
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function getCourseDisplaySmoothingAlpha(
  speedKnots: number,
  filteredCourseDegrees: number,
  currentDisplayCourseDegrees: number,
): number | null {
  if (speedKnots < COURSE_DISPLAY_FREEZE_SPEED_KNOTS) {
    return null
  }

  if (speedKnots < COURSE_DISPLAY_MIN_SPEED_KNOTS) {
    return COURSE_DISPLAY_LOW_SPEED_ALPHA
  }

  const delta = shortestAngleDeltaDegrees(filteredCourseDegrees, currentDisplayCourseDegrees)
  return Math.abs(delta) >= COURSE_DISPLAY_FAST_THRESHOLD_DEGREES
    ? COURSE_DISPLAY_FAST_SMOOTHING_ALPHA
    : COURSE_DISPLAY_SMOOTHING_ALPHA
}

export function useFilteredGps(gps: LiveGpsReading): FilteredGpsReading {
  const [samples, setSamples] = useState<GpsSample[]>([])
  const [displayCourseDegrees, setDisplayCourseDegrees] = useState<number | null>(null)
  const [presentationTimestamp, setPresentationTimestamp] = useState<number | null>(null)
  const [speedGraceTick, setSpeedGraceTick] = useState(0)
  const lastKnownDisplaySpeedRef = useRef<LastKnownDisplaySpeed | null>(null)
  const fusionStateRef = useRef<GpsSpeedFusionState>(createGpsSpeedFusionState())
  const courseHistoryRef = useRef<GpsCoursePosition[]>([])
  const courseFusionStateRef = useRef(createGpsCourseFusionState())
  const courseFusionResultsRef = useRef(new Map<number, number | null>())

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
    const currentCoursePosition: GpsCoursePosition = {
      latitude: gps.latitude,
      longitude: gps.longitude,
      accuracyMeters: gps.accuracyMeters,
      timestamp: gps.timestamp,
    }
    const previousHistoricalCoursePosition = courseHistoryRef.current.findLast((candidate) => (
      candidate.timestamp !== null && currentCoursePosition.timestamp !== null &&
      currentCoursePosition.timestamp - candidate.timestamp >= GPS_COURSE_MIN_BASELINE_MS &&
      currentCoursePosition.timestamp - candidate.timestamp <= GPS_COURSE_MAX_BASELINE_MS
    )) ?? null
    if (currentCoursePosition.timestamp !== null) {
      courseHistoryRef.current = [...courseHistoryRef.current.slice(-8), currentCoursePosition]
    }
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
        const previousCoursePosition = previousHistoricalCoursePosition

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
          fusionStateRef.current,
        )
        const positionCourseDegrees = calculatePositionCourseDegrees(previousCoursePosition, currentPosition, fusedSpeedKnots)

        return [
          ...current.filter((sample) => sample.timestamp >= cutoff),
          {
            timestamp,
            gpsTimestamp: gps.timestamp,
            latitude: gps.latitude,
            longitude: gps.longitude,
            accuracyMeters: gps.accuracyMeters,
            speedKnots: gps.speedKnots,
            positionSpeedKnots,
            fusedSpeedKnots,
            nativeCourseDegrees: gps.courseDegrees,
            positionCourseDegrees,
            fusedCourseDegrees: null,
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

  const courseResults = useMemo(() => {
    const state = courseFusionStateRef.current
    const results = samples.map((sample, index) => {
      const previous = samples.slice(0, index).findLast((candidate) => (
        candidate.gpsTimestamp !== null && sample.gpsTimestamp !== null &&
        sample.gpsTimestamp - candidate.gpsTimestamp >= GPS_COURSE_MIN_BASELINE_MS &&
        sample.gpsTimestamp - candidate.gpsTimestamp <= GPS_COURSE_MAX_BASELINE_MS
      ))
      const calculatedPositionCourseDegrees = calculatePositionCourseDegrees(
        previous ? { latitude: previous.latitude, longitude: previous.longitude, accuracyMeters: previous.accuracyMeters, timestamp: previous.gpsTimestamp } : null,
        { latitude: sample.latitude, longitude: sample.longitude, accuracyMeters: sample.accuracyMeters, timestamp: sample.gpsTimestamp },
        sample.fusedSpeedKnots,
      )
      const positionCourseDegrees = sample.positionCourseDegrees ?? calculatedPositionCourseDegrees
      const cachedCourse = sample.gpsTimestamp === null ? undefined : courseFusionResultsRef.current.get(sample.gpsTimestamp)
      const fusedCourseDegrees = cachedCourse !== undefined
        ? cachedCourse
        : fuseGpsCourseDegrees(sample.nativeCourseDegrees, positionCourseDegrees, sample.fusedSpeedKnots, state)
      if (sample.gpsTimestamp !== null) courseFusionResultsRef.current.set(sample.gpsTimestamp, fusedCourseDegrees)
      return { ...sample, positionCourseDegrees, fusedCourseDegrees }
    })
    const activeTimestamps = new Set(samples.map((sample) => sample.gpsTimestamp).filter((timestamp): timestamp is number => timestamp !== null))
    courseFusionResultsRef.current.forEach((_value, timestamp) => { if (!activeTimestamps.has(timestamp)) courseFusionResultsRef.current.delete(timestamp) })
    return results
  }, [samples])
  const filteredCourseDegrees = useMemo(() => averageAnglesDegrees(
    courseResults.map((sample) => sample.fusedCourseDegrees).filter((course): course is number => course !== null),
  ), [courseResults])

  const latestSamplePresentationTimestamp = useMemo(
    () => getLatestProcessedGpsTimestamp(samples),
    [samples],
  )

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

      const smoothingAlpha = getCourseDisplaySmoothingAlpha(
        speedKnots,
        filteredCourseDegrees,
        currentDisplayCourse,
      )

      if (smoothingAlpha === null) {
        return currentDisplayCourse
      }

      const delta = shortestAngleDeltaDegrees(filteredCourseDegrees, currentDisplayCourse)

      return normalizeDegrees(currentDisplayCourse + smoothingAlpha * delta)
    })
    setPresentationTimestamp(latestSamplePresentationTimestamp)
  }, [filteredCourseDegrees, filteredSpeedKnots, latestSamplePresentationTimestamp])

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
        nativeSpeedKnots: null,
        positionSpeedKnots: null,
        fusedSpeedKnots: null,
        nativeCourseDegrees: null,
        positionCourseDegrees: null,
        fusedCourseDegrees: null,
        speedKnots: null,
        courseDegrees: null,
        displayCourseDegrees: null,
        presentationTimestamp: null,
        courseReliable: false,
        sampleCount: 0,
      }
    }
    const speedKnots = displaySpeedKnots
    const latestSample = courseResults.at(-1) ?? null
    const courseDegrees = courseResults.at(-1)?.fusedCourseDegrees ?? null
    const courseReliable =
      courseDegrees !== null &&
      speedKnots !== null &&
      speedKnots >= MIN_RELIABLE_COURSE_SPEED_KNOTS

    return {
      ...gps,
      speedKnots,
      nativeSpeedKnots: gps.speedKnots,
      positionSpeedKnots: latestSample?.positionSpeedKnots ?? null,
      fusedSpeedKnots: latestSample?.fusedSpeedKnots ?? null,
      nativeCourseDegrees: latestSample?.nativeCourseDegrees ?? gps.courseDegrees,
      positionCourseDegrees: latestSample?.positionCourseDegrees ?? null,
      fusedCourseDegrees: latestSample?.fusedCourseDegrees ?? null,
      courseDegrees,
      displayCourseDegrees:
        filteredSpeedKnots !== null &&
          filteredSpeedKnots >= COURSE_DISPLAY_FREEZE_SPEED_KNOTS &&
          displayCourseDegrees !== null
          ? normalizeDegrees(displayCourseDegrees)
          : null,
      presentationTimestamp,
      courseReliable,
      sampleCount: samples.length,
    }
  }, [
    displayCourseDegrees,
    filteredCourseDegrees,
    displaySpeedKnots,
    filteredSpeedKnots,
    gps,
    presentationTimestamp,
    samples.length,
    courseResults,
  ])
}
