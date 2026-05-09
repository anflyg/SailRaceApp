import { useMemo, useState } from 'react'

type CoursePointKey = 'startA' | 'startB' | 'kryss1' | 'kryss2' | 'lans1' | 'lans2'

const pointLabels: Record<CoursePointKey, string> = {
  startA: 'Startlinje punkt A',
  startB: 'Startlinje punkt B',
  kryss1: 'Kryssmärke 1',
  kryss2: 'Kryssmärke 2 (valfri)',
  lans1: 'Länsmärke 1',
  lans2: 'Länsmärke 2 (valfri)',
}

const fakeCoordinates: Record<CoursePointKey, string> = {
  startA: '59.3293 N, 18.0686 Ö',
  startB: '59.3295 N, 18.0698 Ö',
  kryss1: '59.3310 N, 18.0700 Ö',
  kryss2: '59.3322 N, 18.0680 Ö',
  lans1: '59.3270 N, 18.0710 Ö',
  lans2: '59.3260 N, 18.0690 Ö',
}

const defaultCourseState: Record<CoursePointKey, string | null> = {
  startA: null,
  startB: null,
  kryss1: null,
  kryss2: null,
  lans1: null,
  lans2: null,
}

export function CourseSetupView() {
  const [coursePoints, setCoursePoints] = useState(defaultCourseState)
  const [windDirection, setWindDirection] = useState(270)

  const points = useMemo(
    () => Object.keys(pointLabels) as CoursePointKey[],
    [],
  )

  const setPoint = (key: CoursePointKey) => {
    setCoursePoints((current) => ({
      ...current,
      [key]: fakeCoordinates[key],
    }))
  }

  const clearCourse = () => {
    setCoursePoints(defaultCourseState)
    setWindDirection(270)
  }

  return (
    <section className="view-section course-view">
      <div className="course-setup-grid">
        <div className="course-controls">
          <div className="course-card">
            <h2>Bana</h2>
            {points.map((point) => (
              <div key={point} className="course-row">
                <div>
                  <p className="course-label">{pointLabels[point]}</p>
                  <p className="course-value">
                    {coursePoints[point] ?? 'Inte satt'}
                  </p>
                </div>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setPoint(point)}
                >
                  {coursePoints[point] ? 'Uppdatera punkt' : 'Sätt punkt'}
                </button>
              </div>
            ))}
          </div>

          <div className="course-card wind-card">
            <h2>Vind</h2>
            <div className="wind-controls">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setWindDirection((dir) => (dir + 350) % 360)}
              >
                -10°
              </button>
              <span className="wind-value">Vind: {windDirection}°</span>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setWindDirection((dir) => (dir + 10) % 360)}
              >
                +10°
              </button>
            </div>
          </div>

          <button type="button" className="primary-button clear-button" onClick={clearCourse}>
            Rensa bana
          </button>
        </div>

        <div className="course-schematic">
          <div className="schematic-title">Kursöversikt</div>
          <div className="schematic-canvas">
            <div className="wind-arrow" style={{ transform: `rotate(${windDirection}deg)` }}>
              Vind
            </div>
            <div className="mark windward mark-1">K1</div>
            <div className="mark windward mark-2">K2</div>
            <div className="mark leeward mark-3">L1</div>
            <div className="mark leeward mark-4">L2</div>
            <div className="start-line">
              <span>A</span>
              <span>B</span>
            </div>
          </div>
          <p className="placeholder-note">
            En förenklad kursbild med startlinje, kryss- och länsmärken. Koordinater visas när en punkt är satt.
          </p>
        </div>
      </div>
    </section>
  )
}
