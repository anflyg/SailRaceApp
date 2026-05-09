import { useEffect, useMemo, useRef, useState } from 'react'
import { useCountdown } from '../../hooks/useCountdown'

type Duration = 5 | 4 | 3 | 2 | 1

const durations: Duration[] = [5, 4, 3, 2, 1]

function formatTime(seconds: number) {
  const sign = seconds < 0 ? '-' : ''
  const positive = Math.abs(seconds)
  const minutes = Math.floor(positive / 60)
  const secs = positive % 60
  return `${sign}${minutes}:${secs.toString().padStart(2, '0')}`
}

interface StartTimerViewProps {
  onFinish?: () => void
}

export function StartTimerView({ onFinish }: StartTimerViewProps) {
  const [selectedMinutes, setSelectedMinutes] = useState<Duration>(5)
  const { seconds, status, toggle, pause, reset } = useCountdown(selectedMinutes * 60)
  const longPressRef = useRef<number | null>(null)
  const longPressTriggered = useRef(false)

  useEffect(() => {
    reset(selectedMinutes * 60)
  }, [selectedMinutes, reset])

  useEffect(() => {
    if (seconds <= -10 && status === 'running') {
      pause()
      onFinish?.()
    }
  }, [seconds, status, pause, onFinish])

  const handleDisplayPointerDown = () => {
    longPressTriggered.current = false
    if (longPressRef.current) {
      window.clearTimeout(longPressRef.current)
    }

    longPressRef.current = window.setTimeout(() => {
      longPressTriggered.current = true
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

  return (
    <section className="view-section timer-view">
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

      <div className="button-grid timer-button-grid">
        {buttonSet.map((button) => (
          <button
            key={button.minutes}
            type="button"
            className={`duration-button ${selectedMinutes === button.minutes ? 'active' : ''}`}
            onClick={() => {
              setSelectedMinutes(button.minutes)
              reset(button.minutes * 60)
            }}
          >
            {button.label}
          </button>
        ))}
      </div>
    </section>
  )
}
