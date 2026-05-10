import { normalizeDegrees } from '../../domain/angles'
import { getCourseAxisHeading } from '../../domain/navigation'
import { useWindHeadingMeasurement } from '../../hooks/useWindHeadingMeasurement'
import type { CoursePointKey, CourseState } from '../../types'

interface CourseSetupViewProps {
  course: CourseState
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

export function CourseSetupView({
  course,
  onToggleCoursePoint,
  onToggleWindHeading,
  onClearCourse,
  gpsStatusMessage,
}: CourseSetupViewProps) {
  const {
    status: windMeasurementStatus,
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
      onToggleWindHeading(normalizeDegrees(measuredHeading))
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

  return (
    <section className="view-section course-view">
      <div className="course-schematic">
        <button
          type="button"
          className={`course-mark start-point ${course.points.startA ? 'set' : 'unset'}`}
          onClick={() => onToggleCoursePoint('startA')}
        >
          A
        </button>

        <button
          type="button"
          className={`course-mark start-point ${course.points.startB ? 'set' : 'unset'}`}
          onClick={() => onToggleCoursePoint('startB')}
        >
          B
        </button>

        <button
          type="button"
          className={`course-mark windward ${course.points.kryss1 ? 'set' : 'unset'}`}
          onClick={() => onToggleCoursePoint('kryss1')}
        >
          K1
        </button>

        <button
          type="button"
          className={`course-mark windward ${course.points.kryss2 ? 'set' : 'unset'}`}
          onClick={() => onToggleCoursePoint('kryss2')}
        >
          K2
        </button>

        <button
          type="button"
          className={`course-mark leeward ${course.points.lans1 ? 'set' : 'unset'}`}
          onClick={() => onToggleCoursePoint('lans1')}
        >
          L1
        </button>

        <button
          type="button"
          className={`course-mark leeward ${course.points.lans2 ? 'set' : 'unset'}`}
          onClick={() => onToggleCoursePoint('lans2')}
        >
          L2
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
        {statusMessage ? (
          <p className="course-status" role="status">
            {statusMessage}
          </p>
        ) : null}
        <button type="button" className="primary-button clear-button" onClick={handleClearCourse}>
          Rensa bana
        </button>
      </div>
    </section>
  )
}
