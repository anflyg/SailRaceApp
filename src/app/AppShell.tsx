import { useState } from 'react'
import { NavigationBar } from '../components/NavigationBar'
import { CourseSetupView } from '../features/course/CourseSetupView'
import { StartTimerView } from '../features/timer/StartTimerView'
import { RaceDashboardView } from '../features/race/RaceDashboardView'
import { RaceAnalysisView } from '../features/analysis/RaceAnalysisView'
import { useLiveGps } from '../hooks/useLiveGps'
import type {
  AppView,
  CountdownDuration,
  CoursePointKey,
  CoursePointState,
  CourseState,
  GeoPoint,
} from '../types'

const emptyCoursePoints: CoursePointState = {
  startA: null,
  startB: null,
  kryss1: null,
  kryss2: null,
  lans1: null,
  lans2: null,
}

const defaultCourseState: CourseState = {
  points: emptyCoursePoints,
  windHeadingDegrees: null,
}

export function AppShell() {
  const [activeView, setActiveView] = useState<AppView>('course')
  const [course, setCourse] = useState<CourseState>(defaultCourseState)
  const [selectedCountdownMinutes, setSelectedCountdownMinutes] = useState<CountdownDuration>(5)
  const [courseGpsStatus, setCourseGpsStatus] = useState<string | null>(null)
  const liveGps = useLiveGps(activeView === 'course' || activeView === 'race')

  const getLiveGpsPosition = (): GeoPoint | null => {
    if (liveGps.latitude === null || liveGps.longitude === null) {
      return null
    }

    return {
      latitude: liveGps.latitude,
      longitude: liveGps.longitude,
    }
  }

  const toggleCoursePoint = (key: CoursePointKey) => {
    if (course.points[key]) {
      setCourseGpsStatus(null)
      setCourse((current) => ({
        ...current,
        points: {
          ...current.points,
          [key]: null,
        },
      }))
      return
    }

    const gpsPosition = getLiveGpsPosition()

    if (!gpsPosition) {
      setCourseGpsStatus('GPS-position saknas')
      return
    }

    setCourseGpsStatus(null)
    setCourse((current) => ({
      ...current,
      points: {
        ...current.points,
        [key]: gpsPosition,
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
    setCourseGpsStatus(null)
    setCourse(defaultCourseState)
  }

  const activeViewContent = {
    course: (
      <CourseSetupView
        course={course}
        onToggleCoursePoint={toggleCoursePoint}
        onToggleWindHeading={toggleWindHeading}
        onClearCourse={clearCourse}
        gpsStatusMessage={courseGpsStatus}
      />
    ),
    timer: (
      <StartTimerView
        selectedMinutes={selectedCountdownMinutes}
        onSelectedMinutesChange={setSelectedCountdownMinutes}
        onFinish={() => setActiveView('race')}
      />
    ),
    race: <RaceDashboardView course={course} gps={liveGps} />,
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
