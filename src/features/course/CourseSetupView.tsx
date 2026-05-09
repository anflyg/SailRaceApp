import { getCourseAxisHeading, normalizeDegrees } from '../../domain/navigation'
import type { CoursePointKey, CourseState } from '../../types'

interface CourseSetupViewProps {
  course: CourseState
  onToggleCoursePoint: (key: CoursePointKey) => void
  onSetWindHeading: (headingDegrees: number) => void
  onClearCourse: () => void
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
  onSetWindHeading,
  onClearCourse,
}: CourseSetupViewProps) {
  // Demo current compass heading (50 degrees)
  const currentCompassHeading = 50

  // Save current compass heading as wind direction
  // TODO: Replace with real compass heading from device
  const setWindFromCurrentHeading = () => {
    onSetWindHeading(normalizeDegrees(currentCompassHeading))
  }

  const courseAxisHeading = getCourseAxisHeading(course)
  const windArrowRotation = getWindArrowRotation(course.windHeadingDegrees, courseAxisHeading)

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
          className={`wind-arrow-button ${course.windHeadingDegrees !== null ? 'set' : 'unset'}`}
          onClick={setWindFromCurrentHeading}
          aria-label="Vind"
          style={{
            transform: `translateX(-50%) rotate(${windArrowRotation}deg)`,
          }}
        >
          ▲
        </button>
      </div>

      <div className="course-footer">
        <button type="button" className="primary-button clear-button" onClick={onClearCourse}>
          Rensa bana
        </button>
      </div>
    </section>
  )
}
