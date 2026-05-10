import { useState } from 'react'
import { normalizeDegrees } from '../../domain/angles'
import {
  calculateBearingDegrees,
  calculateVelocityMadeGood,
  hasPrimaryCourse,
} from '../../domain/navigation'
import type { CourseState, GeoPoint } from '../../types'

type VelocityMode = 'vmg' | 'vmc'

// Format knots value: clamp to 19.9 and use one decimal with comma
function formatKnots(value: number): string {
  const clamped = Math.max(0, Math.min(value, 19.9))
  return clamped.toFixed(1).replace('.', ',')
}

function formatSignedKnots(value: number): string {
  const clamped = Math.max(-19.9, Math.min(value, 19.9))
  return clamped.toFixed(1).replace('.', ',')
}

function formatDegrees(value: number): string {
  const rounded = Math.round(normalizeDegrees(value)) % 360
  return `${rounded.toString().padStart(3, '0')}°`
}

interface RaceDashboardViewProps {
  course: CourseState
  boatPosition: GeoPoint
}

export function RaceDashboardView({ course, boatPosition }: RaceDashboardViewProps) {
  const [activeVelocityMode, setActiveVelocityMode] = useState<VelocityMode>('vmc')
  // Demo values for now
  const fart = 6.3
  const riktning = 97
  const hasWindVmg = course.windHeadingDegrees !== null
  const targetBearing = course.points.kryss1
    ? calculateBearingDegrees(boatPosition, course.points.kryss1)
    : null
  const hasTargetVmc = hasPrimaryCourse(course) && targetBearing !== null
  const canToggleVelocityMode = hasWindVmg && hasTargetVmc

  const selectedVelocityMode: VelocityMode | null = hasTargetVmc && activeVelocityMode === 'vmc'
    ? 'vmc'
    : hasWindVmg
      ? 'vmg'
      : hasTargetVmc
        ? 'vmc'
        : null
  const referenceHeading = selectedVelocityMode === 'vmc'
    ? targetBearing
    : selectedVelocityMode === 'vmg'
      ? course.windHeadingDegrees
      : null
  const velocityMadeGood = referenceHeading !== null && referenceHeading !== undefined
    ? calculateVelocityMadeGood(fart, riktning, referenceHeading)
    : null
  const velocityLabel = selectedVelocityMode === 'vmc'
    ? 'VMC mål'
    : selectedVelocityMode === 'vmg'
      ? 'VMG vind'
      : 'Ej satt'
  const velocityValue = velocityMadeGood !== null ? formatSignedKnots(velocityMadeGood) : '--'
  const velocityClassName = selectedVelocityMode === 'vmc'
    ? 'velocity-mode-vmc'
    : selectedVelocityMode === 'vmg'
      ? 'velocity-mode-vmg'
      : 'velocity-mode-unset'

  const toggleVelocityMode = () => {
    if (!canToggleVelocityMode) {
      return
    }

    setActiveVelocityMode((current) => (current === 'vmc' ? 'vmg' : 'vmc'))
  }

  return (
    <section className="view-section race-view">
      <div className="race-grid">
        <div className="metric-box" aria-label="Fart">
          <span className="metric-value">{formatKnots(fart)}</span>
          <span className="metric-label">Fart</span>
        </div>

        <div className="metric-box" aria-label="Riktning">
          <span className="metric-value">{formatDegrees(riktning)}</span>
          <span className="metric-label">Riktning</span>
        </div>

        <div
          className={`metric-box velocity-made-good ${velocityClassName} ${canToggleVelocityMode ? 'can-toggle' : ''}`}
          aria-label={velocityLabel}
          role={canToggleVelocityMode ? 'button' : undefined}
          tabIndex={canToggleVelocityMode ? 0 : undefined}
          onClick={toggleVelocityMode}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              toggleVelocityMode()
            }
          }}
        >
          <span className="metric-value">{velocityValue}</span>
          <span className="metric-label">{velocityLabel}</span>
        </div>
      </div>
    </section>
  )
}
