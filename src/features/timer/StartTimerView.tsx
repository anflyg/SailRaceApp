import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { WatchCountdown, watchAvailable, type WatchAction, type WatchPhase } from '../../services/watchCountdown'
import { runCountdownAction } from './countdownActions'
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
  watchEnabled?: boolean
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
  watchEnabled = false,
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

  const resetCountdown = () => {
    onCountdownPause?.()
    setCountdownToken(null)
    onRunningChange?.(false)
    startGunMarkedRef.current = false
    reset(selectedMinutes * 60)
  }

  const executeAction = (action: WatchAction): boolean => runCountdownAction(status, action, {
    reset: resetCountdown,
    start: () => {
      startGunMarkedRef.current = false
      setCountdownToken(onCountdownStart?.(seconds) ?? null)
      onRunningChange?.(true)
      toggle()
    },
    pause: () => {
      onCountdownPause?.()
      setCountdownToken(null)
      onRunningChange?.(false)
      toggle()
    },
    resume: () => {
      if (recordingActive) setCountdownToken(onCountdownResume?.(seconds) ?? null)
      else {
        startGunMarkedRef.current = false
        setCountdownToken(onCountdownStart?.(Math.max(0, seconds)) ?? null)
      }
      onRunningChange?.(true)
      toggle()
    },
  })

  const phase: WatchPhase = status === 'stopped' ? 'ready' : status
  const current = useRef({ phase, executeAction })
  const pendingWatch = useRef<{ id: string; phase: WatchPhase } | null>(null)
  const [watchCommit, setWatchCommit] = useState(0)
  useLayoutEffect(() => { current.current = { phase, executeAction } })

  // A reply is sent only after React commits the requested phase.
  useEffect(() => {
    if (!watchEnabled || !watchAvailable()) return
    const pending = pendingWatch.current
    if (pending && pending.phase === phase) {
      pendingWatch.current = null
      void WatchCountdown.confirm({ phase, id: pending.id }).catch(() => {})
    } else if (!pending) {
      void WatchCountdown.confirm({ phase }).catch(() => {})
    }
  }, [phase, watchEnabled, watchCommit])

  useEffect(() => {
    if (!watchEnabled || !watchAvailable()) return
    let live = true
    let listener: { remove(): Promise<void> } | undefined
    void (async () => {
      listener = await WatchCountdown.addListener('command', ({ id, action, expiresAt }) => {
        if (!live || pendingWatch.current || Date.now() >= expiresAt) return
        const target: WatchPhase = action === 'reset' ? 'ready' : action === 'pause' ? 'paused' : 'running'
        if (!current.current.executeAction(action)) return
        pendingWatch.current = { id, phase: target }
        setWatchCommit(value => value + 1)
      })
      if (live) await WatchCountdown.available({ phase: current.current.phase })
      else await listener.remove()
    })().catch(() => {})
    return () => {
      live = false
      pendingWatch.current = null
      void WatchCountdown.unavailable().catch(() => {})
      if (listener) void listener.remove()
    }
  }, [watchEnabled])

  const handleDisplayPointerDown = () => {
    longPressTriggered.current = false
    if (longPressRef.current) {
      window.clearTimeout(longPressRef.current)
    }

    longPressRef.current = window.setTimeout(() => {
      longPressTriggered.current = true
      resetCountdown()
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
      executeAction(status === 'stopped' ? 'start' : status === 'running' ? 'pause' : 'resume')
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
      {recordingActive ? (
        <RecordingControl active messageKey={null} onStop={onStopRecording} compact showStatus={false} />
      ) : null}
    </section>
  )
}
