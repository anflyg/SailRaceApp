import { useState } from 'react'

type CoursePointKey = 'startA' | 'startB' | 'kryss1' | 'kryss2' | 'lans1' | 'lans2'

const defaultCourseState: Record<CoursePointKey, boolean> = {
  startA: false,
  startB: false,
  kryss1: false,
  kryss2: false,
  lans1: false,
  lans2: false,
}

export function CourseSetupView() {
  const [coursePoints, setCoursePoints] = useState(defaultCourseState)
  const [windDirection, setWindDirection] = useState<number | null>(null)
  const [demoHeading] = useState(270)

  const setPoint = (key: CoursePointKey) => {
    setCoursePoints((current) => ({
      ...current,
      [key]: !current[key],
    }))
  }

  // Save current demo heading as wind direction
  // TODO: Replace with real compass heading from device
  const setWindFromCurrentHeading = () => {
    setWindDirection(demoHeading)
  }

  const clearCourse = () => {
    setCoursePoints(defaultCourseState)
    setWindDirection(null)
  }

  return (
    <section className="view-section course-view">
      <div className="course-header">
        <button
          type="button"
          className={`primary-button wind-button ${windDirection !== null ? 'set' : 'unset'}`}
          onClick={setWindFromCurrentHeading}
        >
          Vind
        </button>
        <div className="wind-status">
          {windDirection !== null ? `${windDirection}°` : 'Ej satt'}
        </div>
      </div>

      <div className="course-schematic">
        <button
          type="button"
          className={`course-mark start-point ${coursePoints.startA ? 'set' : 'unset'}`}
          onClick={() => setPoint('startA')}
        >
          A
        </button>

        <button
          type="button"
          className={`course-mark start-point ${coursePoints.startB ? 'set' : 'unset'}`}
          onClick={() => setPoint('startB')}
        >
          B
        </button>

        <button
          type="button"
          className={`course-mark windward ${coursePoints.kryss1 ? 'set' : 'unset'}`}
          onClick={() => setPoint('kryss1')}
        >
          K1
        </button>

        <button
          type="button"
          className={`course-mark windward ${coursePoints.kryss2 ? 'set' : 'unset'}`}
          onClick={() => setPoint('kryss2')}
        >
          K2
        </button>

        <button
          type="button"
          className={`course-mark leeward ${coursePoints.lans1 ? 'set' : 'unset'}`}
          onClick={() => setPoint('lans1')}
        >
          L1
        </button>

        <button
          type="button"
          className={`course-mark leeward ${coursePoints.lans2 ? 'set' : 'unset'}`}
          onClick={() => setPoint('lans2')}
        >
          L2
        </button>

        <div
          className="course-arrow"
          style={{
            transform: `translateX(-50%) rotate(${windDirection ?? 0}deg)`,
            opacity: windDirection !== null ? 1 : 0.2,
          }}
        >
          Vind
        </div>
      </div>

      <div className="course-footer">
        <button type="button" className="primary-button clear-button" onClick={clearCourse}>
          Rensa bana
        </button>
      </div>
    </section>
  )
}
