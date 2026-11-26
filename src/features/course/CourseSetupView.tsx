import { normalizeDegrees, shortestAngleDeltaDegrees } from '../../domain/angles'
import { formatDegrees, formatSignedDegrees } from '../../domain/format'
import { getGpsStatusDisplay, getStartLineQuality } from '../../domain/gps'
import { lineAdvantage } from '../../domain/bowGeometry'
import { assessWindReference } from '../../domain/windReference'
import {
  getCourseDisplayReference,
  type CourseDisplayReference,
} from '../../domain/navigation'
import { useWindHeadingMeasurement } from '../../hooks/useWindHeadingMeasurement'
import type { WindHeadingDiagnostics, WindHeadingMeasurementResult } from '../../services/sensors/windHeadingService'
import type { CoursePoint, CoursePointKey, CourseState, LiveGpsReading } from '../../types'
import { useTranslation } from '../../i18n/LanguageContext'
import type { TranslationKey } from '../../i18n/translations'

interface CourseSetupViewProps {
  course: CourseState
  gps: LiveGpsReading
  onToggleCoursePoint: (key: CoursePointKey) => void
  onWindHeadingChange: (headingDegrees: number | null) => void
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

export function WindFailureDiagnostics({ diagnostics }: { diagnostics: WindHeadingDiagnostics }) {
  const { t, language } = useTranslation()
  const number = (value: number | null) => value === null ? '—' : `${value.toFixed(1).replace('.', language === 'sv' ? ',' : '.')}°`
  const frame = diagnostics.referenceFrame === 'true-north' ? t('course.windNorthTrue') :
    diagnostics.referenceFrame === 'magnetic-north' ? t('course.windNorthMagnetic') : t('course.windNorthUnknown')
  const reason = diagnostics.reason === 'failed' && diagnostics.referenceFrame !== 'true-north' ? 'course.windRejectedNorth' : diagnostics.reason === 'completed' ? null : ({ failed: 'course.windFailureGeneral', 'insufficient-samples': 'course.windFailureSamples', 'insufficient-coverage': 'course.windFailureCoverage', unstable: 'course.windFailureUnstable' } as const)[diagnostics.reason]
  return <div className="course-wind-feedback-note" role="status">
    {reason ? <p>{t(reason)}</p> : null}
    <p>{t('course.windDiagnostics', { count: String(diagnostics.acceptedSamples), collected: String(diagnostics.collectedSamples), north: frame,
      spread: number(diagnostics.spreadDegrees) })}</p>
    {diagnostics.coverageSeconds !== null ? <p>{t('course.windCoverage', { coverage: diagnostics.coverageSeconds.toFixed(1), gap: diagnostics.maxGapSeconds?.toFixed(1) ?? '—' })}</p> : null}
  </div>
}

export function CourseSetupView({
  course,
  gps,
  onToggleCoursePoint,
  onWindHeadingChange,
  onWindMeasurement,
  onClearCourse,
  gpsStatusMessage,
}: CourseSetupViewProps) {
  const { t, language } = useTranslation()
  const {
    status: windMeasurementStatus,
    lastMeasurement,
    diagnostics,
    measureWindHeading,
    resetWindHeadingMeasurement,
  } = useWindHeadingMeasurement()

  const displayReference = getCourseDisplayReference(course)
  const windArrowRotation = getWindArrowRotation(course.windHeadingDegrees, displayReference)
  const windRelativeDisplayAngle = course.windHeadingDegrees !== null
    ? shortestAngleDeltaDegrees(course.windHeadingDegrees, displayReference.headingDegrees)
    : null
  const referenceLabel = t(({ 'course-axis': 'course.courseReference', 'start-line': 'course.startLineReference', 'north-fallback': 'course.north' } as const)[displayReference.kind] as TranslationKey)
  const failed = windMeasurementStatus === 'error' || windMeasurementStatus === 'unavailable' || windMeasurementStatus === 'unstable'
  const measurementForDisplay = lastMeasurement ?? course.windMeasurement
  const windAssessment = assessWindReference(course.windHeadingDegrees, measurementForDisplay)
  const qualityKey = ({ good: 'course.qualityGood', ok: 'course.qualityQuestionable', poor: 'course.qualityPoor', unstable: 'course.qualityUnstable', unknown: 'course.qualityUnknown' } as const)[measurementForDisplay?.quality ?? 'unknown']
  const windMeasurementSummary = measurementForDisplay
    ? `${t('course.windSet')}: ${formatDegrees(measurementForDisplay.headingDegrees)} · ${t('course.quality')}: ${t(qualityKey)} · ${t('course.source')}: ${measurementForDisplay.selectedHeadingSource}`
    : null
  const isMeasuringWind = windMeasurementStatus === 'measuring'

  const formatMeasurementValue = (value: number | null | undefined, digits = 1) =>
    typeof value === 'number' && Number.isFinite(value)
      ? value.toFixed(digits).replace('.', language === 'sv' ? ',' : '.')
      : '—'
  const measurementValues = measurementForDisplay
    ? t('course.windMeasurementValues', {
      direction: `${formatMeasurementValue(measurementForDisplay.headingDegrees)}°`,
      spread: `${formatMeasurementValue(measurementForDisplay.spreadDegrees, 2)}°`,
      quality: t(qualityKey),
    })
    : null

  const handleWindArrowClick = async () => {
    if (course.windHeadingDegrees !== null) {
      resetWindHeadingMeasurement()
      onWindMeasurement(null)
      onWindHeadingChange(null)
      return
    }

    const measuredHeading = await measureWindHeading()

    if (measuredHeading !== null) {
      onWindHeadingChange(normalizeDegrees(measuredHeading.headingDegrees))
      onWindMeasurement(measuredHeading)
    }
  }

  const handleMeasureAgain = async () => {
    const measuredHeading = await measureWindHeading()
    if (measuredHeading !== null) {
      onWindHeadingChange(normalizeDegrees(measuredHeading.headingDegrees))
      onWindMeasurement(measuredHeading)
    }
  }

  const handleClearCourse = () => {
    resetWindHeadingMeasurement()
    onClearCourse()
  }

  const statusMessage = isMeasuringWind
    ? t('course.measuringWind')
    : windMeasurementStatus === 'error' || windMeasurementStatus === 'unavailable'
      ? t('course.windMeasurementFailed')
      : gpsStatusMessage === 'heading-unavailable' ? t('start.status.heading_unavailable') : gpsStatusMessage === 'gps-position-unavailable' ? t('course.gpsPositionUnavailable') : gpsStatusMessage
  const gpsStatus = getGpsStatusDisplay(gps)
  const advantage = lineAdvantage(course.points.startA, course.points.startB, assessWindReference(course.windHeadingDegrees, course.windMeasurement).usable ? course.windHeadingDegrees : null)
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
        <p className="course-status">{t('course.bowCapture')}</p>
        {advantage ? <p className="start-advantage">{t('course.advantage')}: {advantage.favored
          ? t('course.favoredEnd', { end: advantage.favored, degrees: String(advantage.degrees) })
          : t('course.neutral')}</p> : startLineQuality === 'poor' ? <p role="status">{t('course.biasPoorGps')}</p> : null}
        <div className="course-gps-status" role="status">
          <span>{gpsStatus.isGood ? gpsStatus.label : 'GPS —'}</span>
          {gpsStatus.status ? <span>{gpsStatus.status === 'missing' ? t('status.gpsUnavailable') : t('status.gpsUnreliable')}</span> : null}
        </div>
        {statusMessage ? (
          <p className="course-status" role="status">
            {statusMessage}
          </p>
        ) : null}
        {failed && course.windMeasurement ? <p role="status">{language === 'sv' ? 'Ommätningen misslyckades. Tidigare vind gäller tills en ny mätning godkänns.' : 'Remeasurement failed. The previous wind remains in use until a new measurement is approved.'}</p> : null}
        {diagnostics && failed ? <WindFailureDiagnostics diagnostics={diagnostics} /> : null}
        {windAssessment.usable ? (
          <div className="course-wind-feedback approved" role="status" aria-live="polite">
            <strong className="course-wind-feedback-title">{t('course.windApproved')}</strong>
            {measurementValues ? <p className="course-wind-measurement-values">{measurementValues}</p> : null}
            {measurementForDisplay ? <p>{t('course.windSampleNorth', { count: String(measurementForDisplay.sampleCount), north: measurementForDisplay.referenceFrame === 'true-north' ? t('course.windNorthTrue') : measurementForDisplay.referenceFrame === 'magnetic-north' ? t('course.windNorthMagnetic') : t('course.windNorthUnknown') })}</p> : null}
            <p className="course-wind-feedback-note">{t('course.windStabilityAccuracyHelp')}</p>
            <p className="course-wind-feedback-note">{t('course.windGpsSeparate')}</p>
            <button type="button" className="wind-remeasure-button" onClick={handleMeasureAgain} disabled={isMeasuringWind}>{t('course.windMeasureAgain')}</button>
          </div>
        ) : null}
        <div className="course-display-debug" aria-label={t('course.debug')}>
          {windMeasurementSummary ? (
            <span>{windMeasurementSummary}</span>
          ) : null}
          {measurementForDisplay?.nativeDebug ? (
            <span>{t('course.trueHeading')}: {measurementForDisplay.nativeDebug.clTrueHeadingDegrees === null ? '—' : formatDegrees(measurementForDisplay.nativeDebug.clTrueHeadingDegrees)} · {t('course.magneticHeading')}: {measurementForDisplay.nativeDebug.clMagneticHeadingDegrees === null ? '—' : formatDegrees(measurementForDisplay.nativeDebug.clMagneticHeadingDegrees)}</span>
          ) : null}
          <span>{t('course.reference')}: {referenceLabel}</span>
          {windRelativeDisplayAngle !== null ? (
            <span>{t('course.windRelative')}: {formatSignedDegrees(windRelativeDisplayAngle)}</span>
          ) : null}
        </div>
        <button type="button" className="primary-button clear-button" onClick={handleClearCourse}>
          {t('course.clear')}
        </button>
      </div>
    </section>
  )
}
