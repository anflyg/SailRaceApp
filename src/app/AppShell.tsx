import { useState } from 'react'
import { NavigationBar } from '../components/NavigationBar'
import { CourseSetupView } from '../features/course/CourseSetupView'
import { StartTimerView } from '../features/timer/StartTimerView'
import { RaceDashboardView } from '../features/race/RaceDashboardView'
import { RaceAnalysisView } from '../features/analysis/RaceAnalysisView'
import type { AppView, CoursePointKey, CoursePointState, CourseState, GeoPoint } from '../types'

const emptyCoursePoints: CoursePointState = {
  startA: null,
  startB: null,
  kryss1: null,
  kryss2: null,
  lans1: null,
  lans2: null,
}

const demoBoatPosition: GeoPoint = {
  latitude: 59.327,
  longitude: 18.071,
}

const demoCoursePoints: Record<CoursePointKey, GeoPoint> = {
  startA: { latitude: 59.3257, longitude: 18.0672 },
  startB: { latitude: 59.3253, longitude: 18.0707 },
  kryss1: { latitude: 59.3317, longitude: 18.0766 },
  kryss2: { latitude: 59.3313, longitude: 18.0788 },
  lans1: { latitude: 59.3239, longitude: 18.0645 },
  lans2: { latitude: 59.3235, longitude: 18.067 },
}

const defaultCourseState: CourseState = {
  points: emptyCoursePoints,
  windHeadingDegrees: null,
}

export function AppShell() {
  const [activeView, setActiveView] = useState<AppView>('course')
  const [course, setCourse] = useState<CourseState>(defaultCourseState)

  const toggleCoursePoint = (key: CoursePointKey) => {
    setCourse((current) => ({
      ...current,
      points: {
        ...current.points,
        [key]: current.points[key] ? null : demoCoursePoints[key],
      },
    }))
  }

  const toggleWindHeading = (headingDegrees: number) => {
    setCourse((current) => ({
      ...current,
      windHeadingDegrees: current.windHeadingDegrees === null ? headingDegrees : null,
    }))
  }

  const clearCourse = () => {
    setCourse(defaultCourseState)
  }

  const activeViewContent = {
    course: (
      <CourseSetupView
        course={course}
        onToggleCoursePoint={toggleCoursePoint}
        onToggleWindHeading={toggleWindHeading}
        onClearCourse={clearCourse}
      />
    ),
    timer: <StartTimerView onFinish={() => setActiveView('race')} />,
    race: <RaceDashboardView course={course} boatPosition={demoBoatPosition} />,
    analysis: <RaceAnalysisView />,
  }[activeView]

  return (
    <div className={`app-shell ${activeView}`}>
      <NavigationBar currentView={activeView} onChange={setActiveView} />

      <main className="app-panel">
        {activeViewContent}
      </main>
    </div>
  )
}
