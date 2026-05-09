import {
  calculateBearingDegrees,
  calculateVelocityMadeGood,
  hasPrimaryCourse,
  normalizeDegrees,
} from '../../domain/navigation'
import type { CourseState, GeoPoint } from '../../types'

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
  // Demo values for now
  const fart = 6.3
  const riktning = 97
  const useTargetVmc = hasPrimaryCourse(course)
  const targetBearing = course.points.kryss1
    ? calculateBearingDegrees(boatPosition, course.points.kryss1)
    : null
  const referenceHeading = useTargetVmc && targetBearing !== null
    ? targetBearing
    : course.windHeadingDegrees
  const velocityMadeGood = referenceHeading !== null
    ? calculateVelocityMadeGood(fart, riktning, referenceHeading)
    : null
  const velocityLabel = useTargetVmc ? 'VMC mål' : course.windHeadingDegrees !== null ? 'VMG vind' : 'VMG ej satt'
  const velocityValue = velocityMadeGood !== null ? formatSignedKnots(velocityMadeGood) : '--'

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

        <div className="metric-box velocity-made-good" aria-label={velocityLabel}>
          <span className="metric-value-row">
            <span className="metric-value">{velocityValue}</span>
            <span className="metric-context-label">{velocityLabel}</span>
          </span>
          <span className="metric-label">VMG/VMC</span>
        </div>
      </div>
    </section>
  )
}
