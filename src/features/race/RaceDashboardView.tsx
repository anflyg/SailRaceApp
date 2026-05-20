import { useEffect, useRef, useState } from 'react'
import { formatDegrees, formatKnots, formatSignedDegrees, formatSignedKnots } from '../../domain/format'
import {
  calculateBearingDegrees,
  calculateVelocityMadeGood,
  hasPrimaryCourse,
} from '../../domain/navigation'
import { useLaylineWarning } from './useLaylineWarning'
import { playLaylineSignal, playLaylineTick } from '../../services/laylineAudio'
import { recordLaylineTackEventIfActive } from '../../services/raceLogger'
import type { CourseState, FilteredGpsReading, GeoPoint, RollPitchValues } from '../../types'

type VelocityMode = 'vmg' | 'vmc'

interface RaceDashboardViewProps {
  course: CourseState
  gps: FilteredGpsReading
  rollPitch: RollPitchValues | null
  laylineEnabled: boolean
  laylineAlphaDegrees: number
  manualLaylineCountdownValue?: number | null
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

export function RaceDashboardView({
  course,
  gps,
  rollPitch,
  laylineEnabled,
  laylineAlphaDegrees,
  manualLaylineCountdownValue = null,
}: RaceDashboardViewProps) {
  const [activeVelocityMode, setActiveVelocityMode] = useState<VelocityMode>('vmc')
  const previousCountdownValueRef = useRef<number | null>(null)
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
  const laylineWarning = useLaylineWarning({
    course,
    gps,
    enabled: laylineEnabled,
    alphaDegrees: laylineAlphaDegrees,
  })
  const isManualLaylinePreview = manualLaylineCountdownValue !== null
  const activeLaylineWarning = isManualLaylinePreview
    ? {
      isActive: true,
      countdownValue: manualLaylineCountdownValue,
      laylineVariant: null,
      postTackHeadingDegrees: null,
    }
    : laylineWarning

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
  const velocityValue = activeLaylineWarning.isActive
    ? `${activeLaylineWarning.countdownValue ?? '--'}`
    : velocityMadeGood !== null
      ? formatSignedKnots(velocityMadeGood)
      : '--'
  const velocityClassName = activeLaylineWarning.isActive
    ? 'velocity-mode-layline'
    : selectedVelocityMode === 'vmc'
    ? 'velocity-mode-vmc'
    : selectedVelocityMode === 'vmg'
      ? 'velocity-mode-vmg'
      : 'velocity-mode-unset'
  const velocityLabelForDisplay = activeLaylineWarning.isActive ? 'LAYLINE' : velocityLabel
  const canInteractVelocityMode = canToggleVelocityMode && !activeLaylineWarning.isActive

  const toggleVelocityMode = () => {
    if (!canInteractVelocityMode) {
      return
    }

    setActiveVelocityMode((current) => (current === 'vmc' ? 'vmg' : 'vmc'))
  }

  useEffect(() => {
    if (isManualLaylinePreview) {
      previousCountdownValueRef.current = activeLaylineWarning.countdownValue
      return
    }

    const countdownValue = activeLaylineWarning.countdownValue

    if (countdownValue === null) {
      previousCountdownValueRef.current = null
      return
    }

    if (previousCountdownValueRef.current === countdownValue) {
      return
    }

    if (countdownValue >= 0) {
      if (countdownValue === 10 || countdownValue === 0) {
        playLaylineSignal()
      } else {
        playLaylineTick()
      }
    }

    if (
      countdownValue === 0 &&
      previousCountdownValueRef.current !== 0 &&
      gps.latitude !== null &&
      gps.longitude !== null &&
      activeLaylineWarning.laylineVariant !== null &&
      activeLaylineWarning.postTackHeadingDegrees !== null
    ) {
      recordLaylineTackEventIfActive({
        timestamp: gps.timestamp !== null ? new Date(gps.timestamp).toISOString() : new Date().toISOString(),
        latitude: gps.latitude,
        longitude: gps.longitude,
        speedKnots: gps.speedKnots ?? undefined,
        cogDegrees: gps.courseDegrees ?? undefined,
        alphaDegrees: laylineAlphaDegrees,
        postTackHeadingDegrees: activeLaylineWarning.postTackHeadingDegrees,
        laylineVariant: activeLaylineWarning.laylineVariant,
      })
    }

    previousCountdownValueRef.current = countdownValue
  }, [
    gps.courseDegrees,
    gps.latitude,
    gps.longitude,
    gps.speedKnots,
    gps.timestamp,
    isManualLaylinePreview,
    laylineAlphaDegrees,
    activeLaylineWarning.countdownValue,
    activeLaylineWarning.laylineVariant,
    activeLaylineWarning.postTackHeadingDegrees,
  ])

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
          className={`metric-box velocity-made-good ${velocityClassName} ${canInteractVelocityMode ? 'can-toggle' : ''}`}
          aria-label={velocityLabelForDisplay}
          role={canInteractVelocityMode ? 'button' : undefined}
          tabIndex={canInteractVelocityMode ? 0 : undefined}
          onClick={toggleVelocityMode}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              toggleVelocityMode()
            }
          }}
        >
          <span className="metric-value">{velocityValue}</span>
          <span className="metric-label">{velocityLabelForDisplay}</span>
        </div>
      </div>

      <div className="roll-pitch-strip" aria-label="Rullning och stampning">
        <span>R {rollPitch ? formatSignedDegrees(rollPitch.rollDegrees) : '—'}</span>
        <span>S {rollPitch ? formatSignedDegrees(rollPitch.pitchDegrees) : '—'}</span>
      </div>
    </section>
  )
}
