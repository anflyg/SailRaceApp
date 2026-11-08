import { formatDegrees, formatKnots, formatSignedKnots } from '../../domain/format'
import { calculateVelocityMadeGood } from '../../domain/navigation'
import { useTranslation } from '../../i18n/LanguageContext'
import { normalizeDegrees } from '../../domain/angles'
import { COURSE_SAMPLE_MAX_AGE_MS, getWindRelativeCourseDegrees } from '../../domain/windShiftInstrument'
import { isFreshReliableGps, isUsableWindReference } from '../../domain/windReference'
import { useEffect, useState } from 'react'
import { RecordingControl } from '../../components/RecordingControl'
import { WindShiftDots, WindShiftScale, useWindShiftInstrumentOutput } from './WindShiftInstruments'
import type { CompassDisplayMode } from '../../services/appSettingsStorage'
import type { CourseState, FilteredGpsReading, Race } from '../../types'

interface RaceDashboardViewProps {
  course: CourseState
  gps: FilteredGpsReading
  compassDisplayMode: CompassDisplayMode
  laylineAlphaDegrees: number
  recordingActive?: boolean
  onStopRecording?: () => void
  raceReference?: Pick<Race, 'course' | 'windMeasurement'> | null
}

export function RaceDashboardView({
  course,
  gps,
  compassDisplayMode,
  laylineAlphaDegrees,
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
  const freshDisplayCourse = isFreshReliableGps(gps, gps.displayCourseDegrees, gps.presentationTimestamp ?? gps.timestamp)
  const freshVmgCourse = isFreshReliableGps(gps, gps.courseDegrees, gps.timestamp)
  const windInstrumentOutput = useWindShiftInstrumentOutput(course, gps, laylineAlphaDegrees)
  const matchingWindReference = windReferenceCompatible && course.windHeadingDegrees !== null &&
    windInstrumentOutput.state.originWindHeadingDegrees === normalizeDegrees(course.windHeadingDegrees) &&
    windInstrumentOutput.state.alphaDegrees === laylineAlphaDegrees
  const courseHeading = compassDisplayMode === 'wind-relative' &&
    windReferenceCompatible && course.windHeadingDegrees !== null
    ? freshDisplayCourse && gps.displayCourseDegrees !== null
      ? getWindRelativeCourseDegrees(gps.displayCourseDegrees, course.windHeadingDegrees)
      : null
    : gps.displayCourseDegrees
  const hasDisplayCourse = courseHeading !== null
  const matchesRace = !raceReference || (isUsableWindReference(raceReference.course?.windDirectionDegrees, raceReference.windMeasurement) &&
    isUsableWindReference(course.windHeadingDegrees, raceReference.windMeasurement))
  const reason = course.windHeadingDegrees === null ? 'sailing.vmgMissingWind' :
    course.windMeasurement && course.windMeasurement.referenceFrame !== 'true-north' ? 'sailing.vmgNorth' :
    !windReferenceCompatible ? 'sailing.vmgQuality' :
    !matchesRace ? 'sailing.vmgRaceMismatch' : !freshVmgCourse ? 'sailing.vmgGps' : null
  const velocityMadeGood = windReferenceCompatible && matchesRace && freshVmgCourse && speedKnots !== null && gps.courseDegrees !== null && course.windHeadingDegrees !== null
    ? calculateVelocityMadeGood(speedKnots, gps.courseDegrees, course.windHeadingDegrees)
    : null
  const velocityValue = velocityMadeGood !== null ? formatSignedKnots(velocityMadeGood) : '--'
  const velocityLabel = t('sailing.vmgWind')
  const velocityClassName = course.windHeadingDegrees !== null ? 'velocity-mode-vmg' : 'velocity-mode-unset'

  return (
    <section className="view-section race-view">
      <div className="race-grid with-wind-cues">
        <div className="metric-box" aria-label={t('sailing.speed')}>
          <span className="metric-value">{speedKnots !== null ? formatKnots(speedKnots) : '--'}</span>
          <span className="metric-label">{t('sailing.speed')}</span>
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
