import { useEffect, useMemo, useRef, useState } from 'react'
import { formatMeters } from '../../domain/format'
import { calculateStartMetrics } from '../../domain/startLine'
import { useCountdown } from '../../hooks/useCountdown'
import type { CountdownDuration, CourseState, FilteredGpsReading, GeoPoint, LiveGpsReading } from '../../types'
import { useTranslation } from '../../i18n/LanguageContext'
import type { TranslationKey } from '../../i18n/translations'
import { RecordingControl } from '../../components/RecordingControl'
import type { CountdownToken } from '../../services/raceLogger'

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
  onCountdownStart?: (durationSeconds: number) => CountdownToken | null
  onCountdownResume?: (remainingSeconds: number) => CountdownToken | null
  onCountdownPause?: () => void
  onStartGun?: (token: CountdownToken) => boolean
  onRunningChange?: (isRunning: boolean) => void
  onFinish?: () => void
  recordingActive?: boolean
  recordingMessageKey?: TranslationKey | null
  onStopRecording?: () => void
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
  onCountdownResume,
  onCountdownPause,
  onStartGun,
  onRunningChange,
  onFinish,
  recordingActive = false,
  onStopRecording = () => {},
}: StartTimerViewProps) {
  const { t } = useTranslation()
  const { seconds, status, toggle, pause, reset } = useCountdown(selectedMinutes * 60)
  const longPressRef = useRef<number | null>(null)
  const longPressTriggered = useRef(false)
  const startGunMarkedRef = useRef(false)
  const [countdownToken, setCountdownToken] = useState<CountdownToken | null>(null)

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
      if (countdownToken && onStartGun?.(countdownToken)) {
        startGunMarkedRef.current = true
      }
    }
  }, [seconds, status, onStartGun, countdownToken])

  const handleDisplayPointerDown = () => {
    longPressTriggered.current = false
    if (longPressRef.current) {
      window.clearTimeout(longPressRef.current)
    }

    longPressRef.current = window.setTimeout(() => {
      longPressTriggered.current = true
      onCountdownPause?.()
      setCountdownToken(null)
      onRunningChange?.(false)
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
        setCountdownToken(onCountdownStart?.(seconds) ?? null)
        onRunningChange?.(true)
        toggle()
        return
      }

      if (status === 'running') {
        onCountdownPause?.()
        setCountdownToken(null)
      } else if (recordingActive) {
        setCountdownToken(onCountdownResume?.(seconds) ?? null)
      } else {
        startGunMarkedRef.current = false
        setCountdownToken(onCountdownStart?.(Math.max(0, seconds)) ?? null)
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
          {startMetrics.status ? (
            <p className="start-status" role="status">
              {t((`start.status.${startMetrics.status}`) as TranslationKey)}
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
                onCountdownPause?.()
                setCountdownToken(null)
                onSelectedMinutesChange(button.minutes)
                reset(button.minutes * 60)
              }}
            >
              {button.label}
            </button>
          ))}
        </div>
      )}
      {isTimerRunning && recordingActive ? (
        <RecordingControl active messageKey={null} onStop={onStopRecording} compact showStatus={false} />
      ) : null}
    </section>
  )
}
