import { useEffect, useState } from 'react'
import './AsterRaceSplash.css'

interface AsterRaceSplashProps {
  onComplete?: () => void
}

const LEAVE_DELAY_MS = 1400
const COMPLETE_DELAY_MS = 1700

export default function AsterRaceSplash({ onComplete }: AsterRaceSplashProps) {
  const [isLeaving, setIsLeaving] = useState(false)

  useEffect(() => {
    const leaveTimeoutId = window.setTimeout(() => {
      setIsLeaving(true)
    }, LEAVE_DELAY_MS)

    const completeTimeoutId = window.setTimeout(() => {
      onComplete?.()
    }, COMPLETE_DELAY_MS)

    return () => {
      window.clearTimeout(leaveTimeoutId)
      window.clearTimeout(completeTimeoutId)
    }
  }, [onComplete])

  return (
    <div
      className={`aster-race-splash ${isLeaving ? 'aster-race-splash--leaving' : ''}`}
      aria-label="Aster Race start screen"
    >
      <div className="aster-race-splash__halo" aria-hidden="true" />
      <div className="aster-race-splash__content">
        <svg
          className="aster-race-splash__mark"
          viewBox="0 0 220 220"
          role="img"
          aria-labelledby="aster-race-splash-title"
        >
          <title id="aster-race-splash-title">Aster Race compass sail mark</title>
          <defs>
            <linearGradient id="aster-race-compass-gradient" x1="54" y1="38" x2="170" y2="182">
              <stop stopColor="var(--ar-white)" />
              <stop offset="0.52" stopColor="var(--ar-blue-soft)" />
              <stop offset="1" stopColor="var(--ar-blue)" />
            </linearGradient>
            <linearGradient id="aster-race-course-gradient" x1="44" y1="138" x2="178" y2="138">
              <stop stopColor="var(--ar-blue)" stopOpacity="0.2" />
              <stop offset="0.55" stopColor="var(--ar-blue-soft)" />
              <stop offset="1" stopColor="var(--ar-blue)" />
            </linearGradient>
          </defs>

          <circle className="aster-race-splash__dial" cx="110" cy="110" r="82" />
          <circle className="aster-race-splash__dial-ring" cx="110" cy="110" r="64" />

          <path
            className="aster-race-splash__star"
            d="M110 30L124 93L190 110L124 127L110 190L96 127L30 110L96 93L110 30Z"
          />
          <path className="aster-race-splash__sail" d="M112 62L112 145L158 145C144 109 129 84 112 62Z" />
          <path className="aster-race-splash__sail-edge" d="M112 62L112 145L158 145" />
          <path className="aster-race-splash__course" d="M45 137C70 121 91 154 118 138C142 124 154 119 178 132" />
          <path className="aster-race-splash__accent" d="M161 68L174 62L170 77Z" />
          <circle className="aster-race-splash__center" cx="110" cy="110" r="4" />
        </svg>

        <div className="aster-race-splash__wordmark">
          <h1>Aster Race</h1>
        </div>
      </div>
    </div>
  )
}
