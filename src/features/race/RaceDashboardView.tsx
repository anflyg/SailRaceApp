import { useState } from 'react'
import { formatDegrees, formatKnots, formatSignedDegrees, formatSignedKnots } from '../../domain/format'
import {
  calculateBearingDegrees,
  calculateVelocityMadeGood,
  hasPrimaryCourse,
} from '../../domain/navigation'
import type { CourseState, FilteredGpsReading, GeoPoint, RollPitchValues } from '../../types'

type VelocityMode = 'vmg' | 'vmc'

interface RaceDashboardViewProps {
  course: CourseState
  gps: FilteredGpsReading
  rollPitch: RollPitchValues | null
}

function getGpsPosition(gps: FilteredGpsReading): GeoPoint | null {
  if (gps.latitude === null || gps.longitude === null) {
    return null
  }

  return {
    latitude: gps.latitude,
    longitude: gps.longitude,
  }
}

export function RaceDashboardView({ course, gps, rollPitch }: RaceDashboardViewProps) {
  const [activeVelocityMode, setActiveVelocityMode] = useState<VelocityMode>('vmc')
  const speedKnots = gps.speedKnots
  const courseHeading = gps.displayCourseDegrees
  const hasDisplayCourse = courseHeading !== null
  const boatPosition = getGpsPosition(gps)
  const targetMark = course.points.kryss1
  const hasWindVmg = course.windHeadingDegrees !== null
  const targetBearing = targetMark && boatPosition
    ? calculateBearingDegrees(boatPosition, targetMark)
    : null
  const hasTargetVmc = hasPrimaryCourse(course)
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
  const velocityMadeGood = speedKnots !== null && hasDisplayCourse && referenceHeading !== null
    ? calculateVelocityMadeGood(speedKnots, courseHeading, referenceHeading)
    : null
  const velocityLabel = selectedVelocityMode === 'vmc'
    ? 'VMG Bana'
    : selectedVelocityMode === 'vmg'
      ? 'VMG Vind'
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
          <span className="metric-value">{speedKnots !== null ? formatKnots(speedKnots) : '--'}</span>
          <span className="metric-label">Fart</span>
        </div>

        <div className="metric-box" aria-label="Riktning">
          <span className="metric-value">{hasDisplayCourse ? formatDegrees(courseHeading) : '--'}</span>
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

      <div className="roll-pitch-strip" aria-label="Rullning och stampning">
        <span>R {rollPitch ? formatSignedDegrees(rollPitch.rollDegrees) : '—'}</span>
        <span>S {rollPitch ? formatSignedDegrees(rollPitch.pitchDegrees) : '—'}</span>
      </div>
    </section>
  )
}
