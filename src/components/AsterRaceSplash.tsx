import { useEffect, useState } from 'react'
import primaryLogo from '../assets/branding/aster-race-primary-logo.png'
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
        <img className="aster-race-splash__logo" src={primaryLogo} alt="Aster Race" />
        <p className="aster-race-splash__tagline">Performance Instrument</p>
      </div>
    </div>
  )
}
