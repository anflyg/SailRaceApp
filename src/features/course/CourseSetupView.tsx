import { normalizeDegrees, shortestAngleDeltaDegrees } from '../../domain/angles'
import { formatDegrees, formatSignedDegrees } from '../../domain/format'
import { getGpsStatusDisplay, getStartLineQuality } from '../../domain/gps'
import {
  getCourseDisplayReference,
  getStartLineAdvantageMeters,
  type CourseDisplayReference,
} from '../../domain/navigation'
import { useWindHeadingMeasurement } from '../../hooks/useWindHeadingMeasurement'
import type { WindHeadingMeasurementResult } from '../../services/sensors/windHeadingService'
import type { CoursePoint, CoursePointKey, CourseState, LiveGpsReading } from '../../types'
import { useTranslation } from '../../i18n/LanguageContext'
import type { TranslationKey } from '../../i18n/translations'

interface CourseSetupViewProps {
  course: CourseState
  gps: LiveGpsReading
  onToggleCoursePoint: (key: CoursePointKey) => void
  onToggleWindHeading: (headingDegrees: number) => void
  onWindMeasurement: (measurement: WindHeadingMeasurementResult | null) => void
  onClearCourse: () => void
  gpsStatusMessage: string | null
}

function getWindArrowRotation(
  windHeadingDegrees: number | null,
  displayReference: CourseDisplayReference,
): number {
  if (windHeadingDegrees === null) {
    return 0
  }

  const relativeAngle = shortestAngleDeltaDegrees(
    windHeadingDegrees,
    displayReference.headingDegrees,
  )

  if (displayReference.kind === 'start-line') {
    return relativeAngle + 90
  }

  return relativeAngle
}

function getCourseMarkClassName(kind: string, point: CoursePoint | null): string {
  return `course-mark ${kind} ${point?.quality ?? 'unset'}`
}

export function CourseSetupView({
  course,
  gps,
  onToggleCoursePoint,
  onToggleWindHeading,
  onWindMeasurement,
  onClearCourse,
  gpsStatusMessage,
}: CourseSetupViewProps) {
  const { t } = useTranslation()
  const {
    status: windMeasurementStatus,
    lastMeasurement,
    measureWindHeading,
    resetWindHeadingMeasurement,
  } = useWindHeadingMeasurement()

  const displayReference = getCourseDisplayReference(course)
  const startLineAdvantage = getStartLineAdvantageMeters(course)
  const startLineAdvantageLabel = !startLineAdvantage
    ? null
    : startLineAdvantage.favoredEnd === 'neutral'
      ? t('course.startLineNeutral')
      : t('course.startLineAdvantage', { end: startLineAdvantage.favoredEnd, meters: Math.round(startLineAdvantage.meters) })
  const windArrowRotation = getWindArrowRotation(course.windHeadingDegrees, displayReference)
  const windRelativeDisplayAngle = course.windHeadingDegrees !== null
    ? shortestAngleDeltaDegrees(course.windHeadingDegrees, displayReference.headingDegrees)
    : null
  const referenceLabel = t(({ 'course-axis': 'course.courseReference', 'start-line': 'course.startLineReference', 'north-fallback': 'course.north' } as const)[displayReference.kind] as TranslationKey)
  const qualityKey = lastMeasurement?.quality === 'good' && lastMeasurement.accuracyDegrees !== null && lastMeasurement.accuracyDegrees <= 5
    ? 'course.qualityVeryGood'
    : ({ good: 'course.qualityGood', ok: 'course.qualityQuestionable', poor: 'course.qualityPoor', unstable: 'course.qualityUnstable', unknown: 'course.qualityUnknown' } as const)[lastMeasurement?.quality ?? 'unknown']
  const windMeasurementSummary = lastMeasurement
    ? `${t('course.windSet')}: ${formatDegrees(lastMeasurement.headingDegrees)} · ${t('course.quality')}: ${t(qualityKey)} · ${t('course.source')}: ${lastMeasurement.selectedHeadingSource}`
    : null
  const isMeasuringWind = windMeasurementStatus === 'measuring'

  const handleWindArrowClick = async () => {
    if (course.windHeadingDegrees !== null) {
      resetWindHeadingMeasurement()
      onWindMeasurement(null)
      onToggleWindHeading(0)
      return
    }

    const measuredHeading = await measureWindHeading()

    if (measuredHeading !== null) {
      onToggleWindHeading(normalizeDegrees(measuredHeading.headingDegrees))
      onWindMeasurement(measuredHeading)
    }
  }

  const handleClearCourse = () => {
    resetWindHeadingMeasurement()
    onClearCourse()
  }

  const windStatusMessage = {
    measuring: t('course.measuringWind'), success: t('course.windSet'), unstable: t('course.windUnstable'), error: t('course.windMeasurementFailed'), unavailable: t('course.windMeasurementFailed'),
    idle: null,
  }[windMeasurementStatus]
  const statusMessage = windStatusMessage ?? (gpsStatusMessage === 'gps-position-unavailable' ? t('course.gpsPositionUnavailable') : gpsStatusMessage)
  const gpsStatus = getGpsStatusDisplay(gps)
  const startLineQuality = getStartLineQuality(course.points.startA, course.points.startB)

  return (
    <section className="view-section course-view">
      <div className={`course-schematic start-line-${startLineQuality}`}>
        <div className="course-axis-line" aria-hidden="true" />

        <button
          type="button"
          className={getCourseMarkClassName('start-point start-a', course.points.startA)}
          onClick={() => onToggleCoursePoint('startA')}
        >
          A
        </button>

        <button
          type="button"
          className={getCourseMarkClassName('start-point start-b', course.points.startB)}
          onClick={() => onToggleCoursePoint('startB')}
        >
          B
        </button>

        <button
          type="button"
          className={getCourseMarkClassName('windward', course.points.kryss1)}
          onClick={() => onToggleCoursePoint('kryss1')}
        >
          K1
        </button>

        <button
          type="button"
          className={getCourseMarkClassName('leeward', course.points.lans1)}
          onClick={() => onToggleCoursePoint('lans1')}
        >
          L1
        </button>

        <button
          type="button"
          className={`wind-arrow-button ${course.windHeadingDegrees !== null ? 'set' : 'unset'} ${isMeasuringWind ? 'measuring' : ''}`}
          onClick={handleWindArrowClick}
          disabled={isMeasuringWind}
          aria-label={t('course.wind')}
          style={{
            transform: `translateX(-50%) rotate(${windArrowRotation}deg)`,
          }}
        >
          ▲
        </button>
      </div>

      <div className="course-footer">
        <div className="course-gps-status" role="status">
          <span>{gpsStatus.isGood ? gpsStatus.label : 'GPS —'}</span>
          {gpsStatus.status ? <span>{gpsStatus.status === 'missing' ? t('status.gpsUnavailable') : t('status.gpsUnreliable')}</span> : null}
        </div>
        {statusMessage ? (
          <p className="course-status" role="status">
            {statusMessage}
          </p>
        ) : null}
        <div className="course-display-debug" aria-label={t('course.debug')}>
          {windMeasurementSummary ? (
            <span>{windMeasurementSummary}</span>
          ) : null}
          {lastMeasurement?.nativeDebug ? (
            <span>{t('course.trueHeading')}: {lastMeasurement.nativeDebug.clTrueHeadingDegrees === null ? '—' : formatDegrees(lastMeasurement.nativeDebug.clTrueHeadingDegrees)} · {t('course.magneticHeading')}: {lastMeasurement.nativeDebug.clMagneticHeadingDegrees === null ? '—' : formatDegrees(lastMeasurement.nativeDebug.clMagneticHeadingDegrees)}</span>
          ) : null}
          <span>{t('course.reference')}: {referenceLabel}</span>
          {windRelativeDisplayAngle !== null ? (
            <span>{t('course.windRelative')}: {formatSignedDegrees(windRelativeDisplayAngle)}</span>
          ) : null}
          {startLineAdvantageLabel ? (
            <span>{startLineAdvantageLabel}</span>
          ) : null}
        </div>
        <button type="button" className="primary-button clear-button" onClick={handleClearCourse}>
          {t('course.clear')}
        </button>
      </div>
    </section>
  )
}
