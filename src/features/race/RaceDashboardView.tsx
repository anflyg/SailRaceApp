import { useEffect, useRef, useState } from 'react'
import { formatDegrees, formatKnots, formatSignedKnots } from '../../domain/format'
import {
  calculateBearingDegrees,
  calculateVelocityMadeGood,
  hasPrimaryCourse,
} from '../../domain/navigation'
import { useLaylineWarning } from './useLaylineWarning'
import { playLaylineSignal, playLaylineTick } from '../../services/laylineAudio'
import { recordLaylineTackEventIfActive } from '../../services/raceLogger'
import { useTranslation } from '../../i18n/LanguageContext'
import { normalizeDegrees } from '../../domain/angles'
import { getWindRelativeCourseDegrees } from '../../domain/windShiftInstrument'
import { WindShiftDots, WindShiftScale, useWindShiftInstrumentOutput } from './WindShiftInstruments'
import type { CompassDisplayMode } from '../../services/appSettingsStorage'
import type { CourseState, FilteredGpsReading, GeoPoint } from '../../types'

type VelocityMode = 'vmg' | 'vmc'

interface RaceDashboardViewProps {
  course: CourseState
  gps: FilteredGpsReading
  compassDisplayMode: CompassDisplayMode
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
  compassDisplayMode,
  laylineEnabled,
  laylineAlphaDegrees,
  manualLaylineCountdownValue = null,
}: RaceDashboardViewProps) {
  const { t } = useTranslation()
  const [activeVelocityMode, setActiveVelocityMode] = useState<VelocityMode>('vmc')
  const previousCountdownValueRef = useRef<number | null>(null)
  const speedKnots = gps.speedKnots
  const windReferenceCompatible = course.windMeasurement?.referenceFrame === 'true-north'
  const windInstrumentOutput = useWindShiftInstrumentOutput(course, gps, laylineAlphaDegrees)
  const matchingWindReference = windReferenceCompatible && course.windHeadingDegrees !== null &&
    windInstrumentOutput.state.originWindHeadingDegrees === normalizeDegrees(course.windHeadingDegrees) &&
    windInstrumentOutput.state.alphaDegrees === laylineAlphaDegrees
  const courseHeading = compassDisplayMode === 'wind-relative' &&
    windReferenceCompatible && course.windHeadingDegrees !== null
    ? isFreshReliableCourse(gps) && gps.displayCourseDegrees !== null
      ? getWindRelativeCourseDegrees(gps.displayCourseDegrees, course.windHeadingDegrees)
      : null
    : gps.displayCourseDegrees
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
  const velocityMadeGood = speedKnots !== null && gps.courseDegrees !== null && referenceHeading !== null
    ? calculateVelocityMadeGood(speedKnots, gps.courseDegrees, referenceHeading)
    : null
  const velocityLabel = selectedVelocityMode === 'vmc'
    ? t('sailing.vmgCourse')
    : t('sailing.vmgWind')
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
      <div className="race-grid with-wind-cues">
        <div className="metric-box" aria-label={t('sailing.speed')}>
          <span className="metric-value">{speedKnots !== null ? formatKnots(speedKnots) : '--'}</span>
          <span className="metric-label">{t('sailing.speed')}</span>
        </div>

        <WindShiftDots validReference={matchingWindReference && gps.displayCourseDegrees !== null && isFreshReliableCourse(gps)} output={windInstrumentOutput} />

        <div className="metric-box" aria-label={t('sailing.heading')}>
          <span className="metric-value">{hasDisplayCourse ? formatDegrees(courseHeading) : '--'}</span>
          <span className="metric-label">{t('sailing.heading')}</span>
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

      <div className="race-instrument-footer with-wind-scale">
        <WindShiftScale
          validReference={matchingWindReference}
          output={windInstrumentOutput}
          windHeadingDegrees={course.windHeadingDegrees}
        />
      </div>
    </section>
  )
}

function isFreshReliableCourse(gps: FilteredGpsReading): boolean {
  const timestamp = gps.presentationTimestamp ?? gps.timestamp
  if (!gps.courseReliable || timestamp === null || !Number.isFinite(timestamp)) return false
  const ageMs = Date.now() - timestamp
  return ageMs >= -1_000 && ageMs <= 5_000
}
