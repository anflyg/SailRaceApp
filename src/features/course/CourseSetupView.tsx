import { normalizeDegrees, shortestAngleDeltaDegrees } from '../../domain/angles'
import { formatDegrees, formatSignedDegrees } from '../../domain/format'
import { getGpsStatusDisplay, getStartLineQuality } from '../../domain/gps'
import {
  getCourseDisplayReference,
  getStartLineAdvantageMeters,
  type CourseDisplayReference,
  type StartLineAdvantage,
} from '../../domain/navigation'
import { useWindHeadingMeasurement } from '../../hooks/useWindHeadingMeasurement'
import type { WindHeadingMeasurementResult, WindHeadingQuality } from '../../services/sensors/windHeadingService'
import type { CoursePoint, CoursePointKey, CourseState, LiveGpsReading } from '../../types'

interface CourseSetupViewProps {
  course: CourseState
  gps: LiveGpsReading
  onToggleCoursePoint: (key: CoursePointKey) => void
  onToggleWindHeading: (headingDegrees: number) => void
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

function getReferenceFrameLabel(referenceFrame: WindHeadingMeasurementResult['referenceFrame']): string {
  return {
    'true-north': 'true-north',
    'magnetic-north': 'magnetic-north',
    mock: 'mock',
  }[referenceFrame]
}

function formatAccuracyDegrees(accuracyDegrees: number | null): string {
  return accuracyDegrees !== null
    ? `±${Math.round(accuracyDegrees)}°`
    : 'saknas'
}

function formatSpreadDegrees(spreadDegrees: number | null): string {
  return spreadDegrees !== null
    ? `${spreadDegrees.toFixed(1).replace('.', ',')}°`
    : 'saknas'
}

function formatOptionalDegrees(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? formatDegrees(value)
    : 'saknas'
}

function getDisplayReferenceLabel(reference: CourseDisplayReference): string {
  return {
    'course-axis': 'bana',
    'start-line': 'startlinje',
    'north-fallback': 'nord',
  }[reference.kind]
}

function getWindQualityLabel(measurement: WindHeadingMeasurementResult): string {
  if (measurement.quality === 'good' && measurement.accuracyDegrees !== null) {
    return measurement.accuracyDegrees <= 5 ? 'mycket bra' : 'bra'
  }

  const labels: Record<WindHeadingQuality, string> = {
    good: 'bra',
    ok: 'tveksam',
    poor: 'dålig',
    unstable: 'ostabil',
    unknown: 'okänd',
  }

  return labels[measurement.quality]
}

function formatStartLineAdvantage(advantage: StartLineAdvantage | null): string | null {
  if (!advantage) {
    return null
  }

  if (advantage.favoredEnd === 'neutral') {
    return 'Startlinjefördel: neutral'
  }

  return `Startlinjefördel: ${advantage.favoredEnd} +${Math.round(advantage.meters)} m`
}

export function CourseSetupView({
  course,
  gps,
  onToggleCoursePoint,
  onToggleWindHeading,
  onClearCourse,
  gpsStatusMessage,
}: CourseSetupViewProps) {
  const {
    status: windMeasurementStatus,
    error: windMeasurementError,
    lastMeasurement,
    measureWindHeading,
    resetWindHeadingMeasurement,
  } = useWindHeadingMeasurement()

  const displayReference = getCourseDisplayReference(course)
  const startLineAdvantage = getStartLineAdvantageMeters(course)
  const startLineAdvantageLabel = formatStartLineAdvantage(startLineAdvantage)
  const windArrowRotation = getWindArrowRotation(course.windHeadingDegrees, displayReference)
  const windRelativeDisplayAngle = course.windHeadingDegrees !== null
    ? shortestAngleDeltaDegrees(course.windHeadingDegrees, displayReference.headingDegrees)
    : null
  const isMeasuringWind = windMeasurementStatus === 'measuring'

  const handleWindArrowClick = async () => {
    if (course.windHeadingDegrees !== null) {
      resetWindHeadingMeasurement()
      onToggleWindHeading(0)
      return
    }

    const measuredHeading = await measureWindHeading()

    if (measuredHeading !== null) {
      onToggleWindHeading(normalizeDegrees(measuredHeading.headingDegrees))
    }
  }

  const handleClearCourse = () => {
    resetWindHeadingMeasurement()
    onClearCourse()
  }

  const windStatusMessage = {
    measuring: 'Mäter vind i 8 sekunder...',
    success: 'Vind satt',
    unstable: 'Vindmätning ostabil. Håll båten i vindögat och försök igen.',
    error: 'Kunde inte mäta vind',
    unavailable: 'Kunde inte mäta vind',
    idle: null,
  }[windMeasurementStatus]
  const statusMessage = windMeasurementError ?? windStatusMessage ?? gpsStatusMessage
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
          aria-label="Vind"
          style={{
            transform: `translateX(-50%) rotate(${windArrowRotation}deg)`,
          }}
        >
          ▲
        </button>
      </div>

      <div className="course-footer">
        <div className="course-gps-status" role="status">
          <span>{gpsStatus.label}</span>
          {gpsStatus.statusText ? <span>{gpsStatus.statusText}</span> : null}
        </div>
        {statusMessage ? (
          <p className="course-status" role="status">
            {statusMessage}
          </p>
        ) : null}
        <div className="course-sensor-debug" aria-label="Vindmätning debug">
          <div className="course-sensor-debug-title">Montering: baksida mot fören</div>
          {lastMeasurement ? (
            <div className="course-sensor-debug-grid">
              <span>Back-vector</span>
              <strong>{formatDegrees(lastMeasurement.headingDegrees)}</strong>
              <span>Referens</span>
              <strong>{getReferenceFrameLabel(lastMeasurement.referenceFrame)}</strong>
              <span>Accuracy</span>
              <strong>{formatAccuracyDegrees(lastMeasurement.accuracyDegrees)}</strong>
              <span>Spridning</span>
              <strong>{formatSpreadDegrees(lastMeasurement.spreadDegrees)}</strong>
              <span>Kvalitet</span>
              <strong>{getWindQualityLabel(lastMeasurement)}</strong>
              <span>Samples</span>
              <strong>{lastMeasurement.sampleCount}</strong>
              <span>Back vektor (vald row-alt)</span>
              <strong>{formatDegrees(lastMeasurement.headingDegrees)}</strong>
              <span>Back vektor (row-alt)</span>
              <strong>{formatOptionalDegrees(lastMeasurement.nativeDebug?.headings.backVectorHeadingRowDegrees)}</strong>
              <span>Front vektor</span>
              <strong>{formatOptionalDegrees(lastMeasurement.nativeDebug?.headings.frontVectorHeadingDegrees)}</strong>
              <span>Ovankant (+Y)</span>
              <strong>{formatOptionalDegrees(lastMeasurement.nativeDebug?.headings.topEdgeHeadingDegrees)}</strong>
              <span>Högerkant (+X)</span>
              <strong>{formatOptionalDegrees(lastMeasurement.nativeDebug?.headings.rightEdgeHeadingDegrees)}</strong>
              <span>CL True</span>
              <strong>{formatOptionalDegrees(lastMeasurement.nativeDebug?.clTrueHeadingDegrees)}</strong>
              <span>CL Magnetic</span>
              <strong>{formatOptionalDegrees(lastMeasurement.nativeDebug?.clMagneticHeadingDegrees)}</strong>
              <span>M13/M23</span>
              <strong>
                {lastMeasurement.nativeDebug
                  ? `${lastMeasurement.nativeDebug.matrix.m13.toFixed(3)} / ${lastMeasurement.nativeDebug.matrix.m23.toFixed(3)}`
                  : 'saknas'}
              </strong>
              <span>M31/M32</span>
              <strong>
                {lastMeasurement.nativeDebug
                  ? `${lastMeasurement.nativeDebug.matrix.m31.toFixed(3)} / ${lastMeasurement.nativeDebug.matrix.m32.toFixed(3)}`
                  : 'saknas'}
              </strong>
            </div>
          ) : (
            <p className="course-sensor-debug-empty">Tryck vindpilen för att mäta heading.</p>
          )}
        </div>
        <div className="course-display-debug" aria-label="Banvy debug">
          <span>Referens: {getDisplayReferenceLabel(displayReference)}</span>
          {windRelativeDisplayAngle !== null ? (
            <span>Vind relativt referens: {formatSignedDegrees(windRelativeDisplayAngle)}</span>
          ) : null}
          {startLineAdvantageLabel ? (
            <span>{startLineAdvantageLabel}</span>
          ) : null}
        </div>
        <button type="button" className="primary-button clear-button" onClick={handleClearCourse}>
          Rensa bana
        </button>
      </div>
    </section>
  )
}
