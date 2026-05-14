import { useEffect, useMemo, useRef } from 'react'
import { formatMeters } from '../../domain/format'
import { calculateStartMetrics } from '../../domain/startLine'
import { useCountdown } from '../../hooks/useCountdown'
import type { CountdownDuration, CourseState, FilteredGpsReading, GeoPoint, LiveGpsReading } from '../../types'

const durations: CountdownDuration[] = [5, 4, 3, 2, 1]

function formatTime(seconds: number) {
  const positive = Math.abs(seconds)
  const minutes = Math.floor(positive / 60)
  const secs = positive % 60
  return `${minutes}:${secs.toString().padStart(2, '0')}`
}

interface StartTimerViewProps {
  selectedMinutes: CountdownDuration
  course: CourseState
  gps: LiveGpsReading
  filteredGps: FilteredGpsReading
  onSelectedMinutesChange: (minutes: CountdownDuration) => void
  onCountdownStart?: (durationSeconds: number) => void
  onStartGun?: () => void
  onReset?: () => void
  onRunningChange?: (isRunning: boolean) => void
  onFinish?: () => void
}

function getGpsPosition(gps: LiveGpsReading): GeoPoint | null {
  if (gps.latitude === null || gps.longitude === null) {
    return null
  }

  return {
    latitude: gps.latitude,
    longitude: gps.longitude,
  }
}

function formatGpsLabel(gps: LiveGpsReading): string {
  if (gps.latitude === null || gps.longitude === null || gps.accuracyMeters === null) {
    return '—'
  }

  return `±${formatMeters(gps.accuracyMeters)} m`
}

function formatSeconds(value: number): string {
  return `${value} s`
}

function formatBurnSeconds(value: number): string {
  if (value > 0) {
    return `+${value} s`
  }

  return `${value} s`
}

export function StartTimerView({
  selectedMinutes,
  course,
  gps,
  filteredGps,
  onSelectedMinutesChange,
  onCountdownStart,
  onStartGun,
  onReset,
  onRunningChange,
  onFinish,
}: StartTimerViewProps) {
  const { seconds, status, toggle, pause, reset } = useCountdown(selectedMinutes * 60)
  const longPressRef = useRef<number | null>(null)
  const longPressTriggered = useRef(false)
  const startGunMarkedRef = useRef(false)

  useEffect(() => {
    reset(selectedMinutes * 60)
  }, [selectedMinutes, reset])

  useEffect(() => {
    onRunningChange?.(status === 'running')

    return () => {
      onRunningChange?.(false)
    }
  }, [status, onRunningChange])

  useEffect(() => {
    if (seconds <= -10 && status === 'running') {
      pause()
      onFinish?.()
    }
  }, [seconds, status, pause, onFinish])

  useEffect(() => {
    if (status === 'stopped') {
      startGunMarkedRef.current = false
    }
  }, [status])

  useEffect(() => {
    if (status === 'running' && seconds <= 0 && !startGunMarkedRef.current) {
      startGunMarkedRef.current = true
      onStartGun?.()
    }
  }, [seconds, status, onStartGun])

  const handleDisplayPointerDown = () => {
    longPressTriggered.current = false
    if (longPressRef.current) {
      window.clearTimeout(longPressRef.current)
    }

    longPressRef.current = window.setTimeout(() => {
      longPressTriggered.current = true
      onRunningChange?.(false)
      onReset?.()
      startGunMarkedRef.current = false
      reset(selectedMinutes * 60)
    }, 500)
  }

  const handleDisplayPointerUp = () => {
    if (longPressRef.current) {
      window.clearTimeout(longPressRef.current)
      longPressRef.current = null
    }
  }

  const handleDisplayClick = () => {
    if (!longPressTriggered.current) {
      if (status === 'stopped') {
        startGunMarkedRef.current = false
        onCountdownStart?.(selectedMinutes * 60)
      }

      onRunningChange?.(status !== 'running')
      toggle()
    }
  }

  const buttonSet = useMemo(
    () =>
      durations.map((minutes) => ({
        minutes,
        label: `${minutes}`,
      })),
    [],
  )
  const timerStateClass = status !== 'running'
    ? 'timer-idle'
    : seconds < 0
      ? 'timer-negative'
      : 'timer-running'
  const startMetrics = calculateStartMetrics({
    boatPosition: getGpsPosition(gps),
    currentAccuracyMeters: gps.accuracyMeters,
    startA: course.points.startA,
    startB: course.points.startB,
    speedKnots: filteredGps.speedKnots,
    courseDegrees: filteredGps.courseDegrees,
    countdownSeconds: seconds,
  })
  const isTimerRunning = status === 'running'

  return (
    <section className={`view-section timer-view ${isTimerRunning ? 'timer-running-layout' : 'timer-paused-layout'}`}>
      <div className="timer-panel">
        <div
          className={`timer-display interactive large-timer ${timerStateClass}`}
          role="button"
          tabIndex={0}
          onClick={handleDisplayClick}
          onPointerDown={handleDisplayPointerDown}
          onPointerUp={handleDisplayPointerUp}
          onPointerLeave={handleDisplayPointerUp}
        >
          <span>{formatTime(seconds)}</span>
        </div>
      </div>

      {isTimerRunning ? (
        <div className="start-run-panel">
          <div className="start-metric-row">
            <span>TTL</span>
            <strong>{startMetrics.ttlSeconds !== null ? formatSeconds(startMetrics.ttlSeconds) : '—'}</strong>
          </div>
          <div className="start-metric-row">
            <span>BURN</span>
            <strong>
              {startMetrics.burnSeconds !== null
                ? formatBurnSeconds(startMetrics.burnSeconds)
                : '—'}
            </strong>
          </div>
          <div className="start-metric-row">
            <span>GPS</span>
            <strong>{formatGpsLabel(gps)}</strong>
          </div>
          {startMetrics.statusText ? (
            <p className="start-status" role="status">
              {startMetrics.statusText}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="button-grid timer-button-grid">
          {buttonSet.map((button) => (
            <button
              key={button.minutes}
              type="button"
              className={`duration-button ${selectedMinutes === button.minutes ? 'active' : ''}`}
              onClick={() => {
                onSelectedMinutesChange(button.minutes)
                reset(button.minutes * 60)
              }}
            >
              {button.label}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
