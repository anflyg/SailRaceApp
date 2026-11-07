import { formatDegrees, formatKnots, formatSignedKnots } from '../../domain/format'
import { calculateVelocityMadeGood } from '../../domain/navigation'
import { useTranslation } from '../../i18n/LanguageContext'
import { normalizeDegrees } from '../../domain/angles'
import { getWindRelativeCourseDegrees } from '../../domain/windShiftInstrument'
import { WindShiftDots, WindShiftScale, useWindShiftInstrumentOutput } from './WindShiftInstruments'
import type { CompassDisplayMode } from '../../services/appSettingsStorage'
import type { CourseState, FilteredGpsReading } from '../../types'

interface RaceDashboardViewProps {
  course: CourseState
  gps: FilteredGpsReading
  compassDisplayMode: CompassDisplayMode
  laylineAlphaDegrees: number
}

export function RaceDashboardView({
  course,
  gps,
  compassDisplayMode,
  laylineAlphaDegrees,
}: RaceDashboardViewProps) {
  const { t } = useTranslation()
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
  const velocityMadeGood = speedKnots !== null && gps.courseDegrees !== null && course.windHeadingDegrees !== null
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

        <WindShiftDots validReference={matchingWindReference && gps.displayCourseDegrees !== null && isFreshReliableCourse(gps)} output={windInstrumentOutput} />

        <div className="metric-box" aria-label={t('sailing.heading')}>
          <span className="metric-value">{hasDisplayCourse ? formatDegrees(courseHeading) : '--'}</span>
          <span className="metric-label">{t('sailing.heading')}</span>
        </div>

        <div className={`metric-box velocity-made-good ${velocityClassName}`} aria-label={velocityLabel}>
          <span className="metric-value">{velocityValue}</span>
          <span className="metric-label">{velocityLabel}</span>
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
