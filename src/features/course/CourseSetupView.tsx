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

// Normalize angle to 0-359 range
function normalizeDegrees(angle: number): number {
  return ((angle % 360) + 360) % 360
}

// Calculate wind angle relative to course coordinate system
function getRelativeWindAngle(windHeading: number, courseAxisHeading: number): number {
  return normalizeDegrees(windHeading - courseAxisHeading)
}

export function CourseSetupView() {
  const [coursePoints, setCoursePoints] = useState(defaultCourseState)
  const [windCompassHeading, setWindCompassHeading] = useState<number | null>(null)
  
  // Demo current compass heading (50 degrees)
  const currentCompassHeading = 50
  
  // TODO: Calculate from L1 -> K1 GPS coordinates when real coordinates available
  const courseAxisHeading = 40

  const setPoint = (key: CoursePointKey) => {
    setCoursePoints((current) => ({
      ...current,
      [key]: !current[key],
    }))
  }

  // Save current compass heading as wind direction
  // TODO: Replace with real compass heading from device
  const setWindFromCurrentHeading = () => {
    setWindCompassHeading(currentCompassHeading)
  }

  const clearCourse = () => {
    setCoursePoints(defaultCourseState)
    setWindCompassHeading(null)
  }

  const relativeWindAngle = windCompassHeading !== null 
    ? getRelativeWindAngle(windCompassHeading, courseAxisHeading)
    : 0

  return (
    <section className="view-section course-view">
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

        <button
          type="button"
          className={`wind-arrow-button ${windCompassHeading !== null ? 'set' : 'unset'}`}
          onClick={setWindFromCurrentHeading}
          aria-label="Vind"
          style={{
            transform: `translateX(-50%) rotate(${relativeWindAngle}deg)`,
          }}
        >
          ▲
        </button>
      </div>

      <div className="course-footer">
        <button type="button" className="primary-button clear-button" onClick={clearCourse}>
          Rensa bana
        </button>
      </div>
    </section>
  )
}
