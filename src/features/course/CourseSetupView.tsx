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
  const [windDirection, setWindDirection] = useState(270)

  const setPoint = (key: CoursePointKey) => {
    setCoursePoints((current) => ({
      ...current,
      [key]: true,
    }))
  }

  const clearCourse = () => {
    setCoursePoints(defaultCourseState)
    setWindDirection(270)
  }

  return (
    <section className="view-section course-view">
      <div className="course-header">
        <button
          type="button"
          className="secondary-button wind-button"
          onClick={() => setWindDirection((dir) => (dir + 350) % 360)}
        >
          -10°
        </button>
        <div className="wind-status">Vind {windDirection}°</div>
        <button
          type="button"
          className="secondary-button wind-button"
          onClick={() => setWindDirection((dir) => (dir + 10) % 360)}
        >
          +10°
        </button>
      </div>

      <div className="course-schematic">
        <button
          type="button"
          className={`course-mark start-point ${coursePoints.startA ? 'set' : 'unset'}`}
          onClick={() => setPoint('startA')}
        >
          <span>A</span>
          <span className="mark-status">{coursePoints.startA ? 'Satt' : 'Ej satt'}</span>
        </button>

        <button
          type="button"
          className={`course-mark start-point ${coursePoints.startB ? 'set' : 'unset'}`}
          onClick={() => setPoint('startB')}
        >
          <span>B</span>
          <span className="mark-status">{coursePoints.startB ? 'Satt' : 'Ej satt'}</span>
        </button>

        <button
          type="button"
          className={`course-mark windward ${coursePoints.kryss1 ? 'set' : 'unset'}`}
          onClick={() => setPoint('kryss1')}
        >
          <span>K1</span>
          <span className="mark-status">{coursePoints.kryss1 ? 'Satt' : 'Ej satt'}</span>
        </button>

        <button
          type="button"
          className={`course-mark windward ${coursePoints.kryss2 ? 'set' : 'unset'}`}
          onClick={() => setPoint('kryss2')}
        >
          <span>K2</span>
          <span className="mark-status">{coursePoints.kryss2 ? 'Satt' : 'Ej satt'}</span>
        </button>

        <button
          type="button"
          className={`course-mark leeward ${coursePoints.lans1 ? 'set' : 'unset'}`}
          onClick={() => setPoint('lans1')}
        >
          <span>L1</span>
          <span className="mark-status">{coursePoints.lans1 ? 'Satt' : 'Ej satt'}</span>
        </button>

        <button
          type="button"
          className={`course-mark leeward ${coursePoints.lans2 ? 'set' : 'unset'}`}
          onClick={() => setPoint('lans2')}
        >
          <span>L2</span>
          <span className="mark-status">{coursePoints.lans2 ? 'Satt' : 'Ej satt'}</span>
        </button>

        <div
          className="course-arrow"
          style={{ transform: `translateX(-50%) rotate(${windDirection}deg)` }}
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
