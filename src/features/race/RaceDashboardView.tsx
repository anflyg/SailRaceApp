import { formatSignedDegrees, formatDegrees, formatKnots, formatSignedKnots } from '../../domain/format'
import { calculateVelocityMadeGood } from '../../domain/navigation'
import { useTranslation } from '../../i18n/LanguageContext'
import { normalizeDegrees } from '../../domain/angles'
import { COURSE_SAMPLE_MAX_AGE_MS, getWindRelativeCourseDegrees } from '../../domain/windShiftInstrument'
import { isFreshReliableGps, isUsableWindReference } from '../../domain/windReference'
import { useEffect, useState } from 'react'
import { RecordingControl } from '../../components/RecordingControl'
import { WindShiftDots, WindShiftScale, emptyOutput } from './WindShiftInstruments'
import type { WindInstrumentOutput } from '../../domain/windShiftInstrument'
import { isFreshTacticalHeading, NO_TACTICAL_HEADING, type TacticalHeading } from '../../hooks/useTacticalHeading'
import type { CompassDisplayMode } from '../../services/appSettingsStorage'
import type { CourseState, FilteredGpsReading, Race, RollPitchValues } from '../../types'

interface RaceDashboardViewProps {
  liveRaceVmg?: { value: number | null }
  course: CourseState
  gps: FilteredGpsReading
  rollPitch?: RollPitchValues | null
  heading?: TacticalHeading
  compassDisplayMode: CompassDisplayMode
  laylineAlphaDegrees: number
  windInstrumentOutput?: WindInstrumentOutput
  recordingActive?: boolean
  onStopRecording?: () => void
  raceReference?: Pick<Race, 'course' | 'windMeasurement'> & Partial<Pick<Race, 'id'>> | null
}

export function RaceDashboardView({
  course,
  liveRaceVmg,
  gps,
  heading = NO_TACTICAL_HEADING,
  rollPitch = null,
  compassDisplayMode,
  laylineAlphaDegrees,
  windInstrumentOutput = emptyOutput,
  recordingActive = false,
  onStopRecording = () => {},
  raceReference = null,
}: RaceDashboardViewProps) {
  const { t } = useTranslation()
  const speedKnots = gps.speedKnots
  const windReferenceCompatible = isUsableWindReference(course.windHeadingDegrees, course.windMeasurement)
  const [freshnessTick, setFreshnessTick] = useState(0)
  useEffect(() => {
    const now = Date.now()
    const times = [gps.timestamp, gps.presentationTimestamp].filter((value): value is number =>
      typeof value === 'number' && Number.isFinite(value) && value + COURSE_SAMPLE_MAX_AGE_MS + 1 > now)
    if (!times.length) return
    const remaining = Math.min(...times) + COURSE_SAMPLE_MAX_AGE_MS + 1 - now
    const timeout = window.setTimeout(() => setFreshnessTick((tick) => tick + 1), remaining)
    return () => window.clearTimeout(timeout)
  }, [gps.timestamp, gps.presentationTimestamp, freshnessTick])
  const freshDisplayCourse = isFreshTacticalHeading(heading)
  const freshVmgCourse = isFreshReliableGps(gps, gps.courseDegrees, gps.timestamp)
  const matchingWindReference = windReferenceCompatible && course.windHeadingDegrees !== null &&
    windInstrumentOutput.state.originWindHeadingDegrees === normalizeDegrees(course.windHeadingDegrees) &&
    windInstrumentOutput.state.alphaDegrees === laylineAlphaDegrees
  const courseHeading = compassDisplayMode === 'wind-relative' &&
    windReferenceCompatible && course.windHeadingDegrees !== null
    ? freshDisplayCourse && heading.degrees !== null
      ? getWindRelativeCourseDegrees(heading.degrees, course.windHeadingDegrees)
      : null
    : freshDisplayCourse ? heading.degrees : null
  const hasDisplayCourse = courseHeading !== null
  const matchesRace = !raceReference || (isUsableWindReference(raceReference.course?.windDirectionDegrees, raceReference.windMeasurement, raceReference.id) &&
    isUsableWindReference(course.windHeadingDegrees, raceReference.windMeasurement, raceReference.id))
  const legacyReason = course.windHeadingDegrees === null ? 'sailing.vmgMissingWind' :
    course.windMeasurement && course.windMeasurement.referenceFrame !== 'true-north' ? 'sailing.vmgNorth' :
    !windReferenceCompatible ? 'sailing.vmgQuality' :
    !matchesRace ? 'sailing.vmgRaceMismatch' : !freshVmgCourse ? 'sailing.vmgGps' : null
  const legacyVelocityMadeGood = windReferenceCompatible && matchesRace && freshVmgCourse && speedKnots !== null && gps.courseDegrees !== null && course.windHeadingDegrees !== null
    ? calculateVelocityMadeGood(speedKnots, gps.courseDegrees, course.windHeadingDegrees)
    : null
  const velocityMadeGood = liveRaceVmg ? (freshVmgCourse ? liveRaceVmg.value : null) : legacyVelocityMadeGood
  const reason = liveRaceVmg ? (velocityMadeGood === null ? legacyReason ?? 'sailing.vmgRaceMismatch' : null) : legacyReason
  const velocityValue = velocityMadeGood !== null ? formatSignedKnots(velocityMadeGood) : '--'
  const velocityLabel = t('sailing.vmgWind')
  const velocityClassName = course.windHeadingDegrees !== null ? 'velocity-mode-vmg' : 'velocity-mode-unset'

  return (
    <section className="view-section race-view">
      <div className="race-grid with-wind-cues">
        <div className="metric-box speed-with-attitude" aria-label={t('sailing.speed')}>
          <div className="speed-secondary-row">
            <span className="sailing-roll"><small>R</small> {rollPitch && Number.isFinite(rollPitch.rollDegrees) ? formatSignedDegrees(rollPitch.rollDegrees) : '—'}</span>
            <span className="speed-caption">{t('sailing.speed')}</span>
            <span className="sailing-pitch"><small>S</small> {rollPitch && Number.isFinite(rollPitch.pitchDegrees) ? formatSignedDegrees(rollPitch.pitchDegrees) : '—'}</span>
          </div>
          <span className="metric-value">{speedKnots !== null ? formatKnots(speedKnots) : '--'}</span>
        </div>

        <WindShiftDots validReference={matchingWindReference && freshDisplayCourse} output={windInstrumentOutput} />

        <div className="metric-box" aria-label={t('sailing.heading')}>
          <span className="metric-value">{hasDisplayCourse ? formatDegrees(courseHeading) : '--'}</span>
          <span className="metric-label">{t('sailing.heading')}</span>
        </div>

        <div className={`metric-box velocity-made-good ${velocityClassName}`} aria-label={velocityLabel}>
          <span className="metric-value">{velocityValue}</span>
          <span className="metric-label">{velocityLabel}</span>
          {reason ? <span className="vmg-unavailable-reason">{t(reason)}</span> : null}
        </div>
      </div>

      <div className="race-instrument-footer with-wind-scale">
        <WindShiftScale
          validReference={matchingWindReference}
          output={windInstrumentOutput}
          windHeadingDegrees={windReferenceCompatible ? course.windHeadingDegrees : null}
        />
      </div>
      {recordingActive ? <RecordingControl active onStop={onStopRecording} compact showStatus={false} /> : null}
    </section>
  )
}
