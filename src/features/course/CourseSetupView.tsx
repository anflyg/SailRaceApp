import { normalizeDegrees } from '../../domain/angles'
import { formatDegrees } from '../../domain/format'
import { getGpsStatusDisplay, getStartLineQuality } from '../../domain/gps'
import { getCourseAxisHeading } from '../../domain/navigation'
import { useWindHeadingMeasurement } from '../../hooks/useWindHeadingMeasurement'
import type { WindHeadingMeasurementResult } from '../../services/sensors/windHeadingService'
import type { CoursePoint, CoursePointKey, CourseState, LiveGpsReading } from '../../types'

interface CourseSetupViewProps {
  course: CourseState
  gps: LiveGpsReading
  onToggleCoursePoint: (key: CoursePointKey) => void
  onToggleWindHeading: (headingDegrees: number) => void
  onClearCourse: () => void
  gpsStatusMessage: string | null
}

function getWindArrowRotation(windHeadingDegrees: number | null, courseAxisHeading: number | null): number {
  if (windHeadingDegrees === null) {
    return 0
  }

  return normalizeDegrees(windHeadingDegrees - (courseAxisHeading ?? 0))
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
    lastMeasurement,
    measureWindHeading,
    resetWindHeadingMeasurement,
  } = useWindHeadingMeasurement()

  const courseAxisHeading = getCourseAxisHeading(course)
  const windArrowRotation = getWindArrowRotation(course.windHeadingDegrees, courseAxisHeading)
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
    measuring: 'Mäter vind...',
    success: 'Vind satt',
    error: 'Kunde inte mäta vind',
    unavailable: 'Kunde inte mäta vind',
    idle: null,
  }[windMeasurementStatus]
  const statusMessage = windStatusMessage ?? gpsStatusMessage
  const gpsStatus = getGpsStatusDisplay(gps)
  const startLineQuality = getStartLineQuality(course.points.startA, course.points.startB)

  return (
    <section className="view-section course-view">
      <div className={`course-schematic start-line-${startLineQuality}`}>
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
              <span>Samples</span>
              <strong>{lastMeasurement.sampleCount}</strong>
            </div>
          ) : (
            <p className="course-sensor-debug-empty">Tryck vindpilen för att mäta heading.</p>
          )}
        </div>
        <button type="button" className="primary-button clear-button" onClick={handleClearCourse}>
          Rensa bana
        </button>
      </div>
    </section>
  )
}
