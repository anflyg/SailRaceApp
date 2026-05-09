import { useMemo } from 'react'
import { useCountdown } from '../../hooks/useCountdown'

const durations = [5, 4, 3, 2, 1]

function formatTime(seconds: number) {
  const sign = seconds < 0 ? '-' : ''
  const positive = Math.abs(seconds)
  const minutes = Math.floor(positive / 60)
  const secs = positive % 60
  return `${sign}${minutes}:${secs.toString().padStart(2, '0')}`
}

export function StartTimerView() {
  const { seconds, status, toggle, reset } = useCountdown(300)

  const actionLabel = status === 'running' ? 'Pause' : 'Start'
  const subtitle = status === 'running' ? 'Counting down' : 'Ready'
  const statusClass = status === 'running' ? 'status-running' : 'status-paused'

  const buttonSet = useMemo(
    () =>
      durations.map((minutes) => ({
        minutes,
        label: `${minutes} min`,
      })),
    [],
  )

  return (
    <section className="view-section">
      <div className="timer-panel">
        <div className="timer-display">
          <span>{formatTime(seconds)}</span>
        </div>
        <p className={`timer-status ${statusClass}`}>{subtitle}</p>
      </div>

      <div className="button-grid">
        {buttonSet.map((button) => (
          <button
            key={button.minutes}
            type="button"
            className="secondary-button"
            onClick={() => {
              reset(button.minutes * 60)
            }}
          >
            {button.label}
          </button>
        ))}
      </div>

      <div className="action-row">
        <button type="button" className="primary-button" onClick={toggle}>
          {actionLabel}
        </button>
        <button type="button" className="secondary-button" onClick={() => reset(300)}>
          Reset
        </button>
      </div>
      <p className="placeholder-note">
        Countdown continues to -0:10 as a placeholder for later automatic transitions into Race dashboard.
      </p>
    </section>
  )
}
