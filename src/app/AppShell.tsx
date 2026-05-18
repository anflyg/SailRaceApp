import { useCallback, useEffect, useMemo, useState } from 'react'
import { NavigationBar } from '../components/NavigationBar'
import { SetupView } from '../features/setup/SetupView'
import { CourseSetupView } from '../features/course/CourseSetupView'
import { StartTimerView } from '../features/timer/StartTimerView'
import { RaceDashboardView } from '../features/race/RaceDashboardView'
import { RaceAnalysisView } from '../features/analysis/RaceAnalysisView'
import { calculateRollPitchRelativeToCalibration } from '../domain/motion'
import { getPointQuality } from '../domain/gps'
import { getCourseAxisHeading } from '../domain/navigation'
import { useDeviceAttitude } from '../hooks/useDeviceAttitude'
import { useFilteredGps } from '../hooks/useFilteredGps'
import { useLiveGps } from '../hooks/useLiveGps'
import { useWakeLock } from '../hooks/useWakeLock'
import {
  markStartGun,
  recordSampleIfDue,
  startRaceLogging,
  stopActiveRace,
} from '../services/raceLogger'
import type {
  AppView,
  CountdownDuration,
  CourseDefinition,
  CoursePoint,
  CoursePointKey,
  CoursePointState,
  CourseState,
  RollPitchCalibration,
} from '../types'

const emptyCoursePoints: CoursePointState = {
  startA: null,
  startB: null,
  kryss1: null,
  lans1: null,
}

const defaultCourseState: CourseState = {
  points: emptyCoursePoints,
  windHeadingDegrees: null,
}

function getCourseDefinition(course: CourseState): CourseDefinition | undefined {
  const courseDefinition: CourseDefinition = {}

  if (course.points.startA && course.points.startB) {
    courseDefinition.startLine = {
      port: {
        latitude: course.points.startA.latitude,
        longitude: course.points.startA.longitude,
      },
      starboard: {
        latitude: course.points.startB.latitude,
        longitude: course.points.startB.longitude,
      },
    }
  }

  if (course.points.kryss1) {
    courseDefinition.windwardMark = {
      latitude: course.points.kryss1.latitude,
      longitude: course.points.kryss1.longitude,
    }
  }

  if (course.points.lans1) {
    courseDefinition.leewardMark = {
      latitude: course.points.lans1.latitude,
      longitude: course.points.lans1.longitude,
    }
  }

  if (course.windHeadingDegrees !== null) {
    courseDefinition.windDirectionDegrees = course.windHeadingDegrees
  }

  const courseAxisDegrees = getCourseAxisHeading(course)

  if (courseAxisDegrees !== null) {
    courseDefinition.courseAxisDegrees = courseAxisDegrees
  }

  return Object.keys(courseDefinition).length > 0 ? courseDefinition : undefined
}

export function AppShell() {
  const [activeView, setActiveView] = useState<AppView>('setup')
  const [course, setCourse] = useState<CourseState>(defaultCourseState)
  const [selectedCountdownMinutes, setSelectedCountdownMinutes] = useState<CountdownDuration>(5)
  const [isStartTimerRunning, setIsStartTimerRunning] = useState(false)
  const [courseGpsStatus, setCourseGpsStatus] = useState<string | null>(null)
  const [rollPitchCalibration, setRollPitchCalibration] = useState<RollPitchCalibration | null>(null)
  const liveGps = useLiveGps(activeView !== 'analysis')
  const filteredGps = useFilteredGps(liveGps)
  const deviceAttitude = useDeviceAttitude(activeView === 'setup' || activeView === 'race')
  const rollPitch = calculateRollPitchRelativeToCalibration(deviceAttitude, rollPitchCalibration)
  const isNavigationLocked = isStartTimerRunning
  const courseDefinition = useMemo(() => getCourseDefinition(course), [course])
  useWakeLock(true)

  const handleManualViewChange = useCallback((nextView: AppView) => {
    if (isNavigationLocked && nextView !== activeView) {
      return
    }

    setActiveView(nextView)
  }, [activeView, isNavigationLocked])

  const handleTimerFinish = useCallback(() => {
    setIsStartTimerRunning(false)
    setActiveView('race')
  }, [])

  const handleCountdownStart = useCallback((durationSeconds: number) => {
    startRaceLogging({
      countdownDurationSeconds: durationSeconds,
      course: courseDefinition,
    })
  }, [courseDefinition])

  const handleStartGun = useCallback(() => {
    markStartGun()
  }, [])

  const handleTimerReset = useCallback(() => {
    stopActiveRace()
  }, [])

  useEffect(() => {
    if (activeView === 'analysis') {
      return
    }

    recordSampleIfDue({
      gps: filteredGps,
      course: courseDefinition,
    })
  }, [activeView, courseDefinition, filteredGps])

  const getLiveGpsPosition = (): CoursePoint | null => {
    if (liveGps.latitude === null || liveGps.longitude === null) {
      return null
    }

    const coursePoint: CoursePoint = {
      latitude: liveGps.latitude,
      longitude: liveGps.longitude,
      quality: getPointQuality(liveGps.accuracyMeters),
    }

    if (liveGps.accuracyMeters !== null) {
      coursePoint.accuracyAtSet = liveGps.accuracyMeters
    }

    return coursePoint
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

  const calibrateRollPitch = () => {
    if (deviceAttitude.rollDegrees === null || deviceAttitude.pitchDegrees === null) {
      return
    }

    setRollPitchCalibration({
      rollDegrees: deviceAttitude.rollDegrees,
      pitchDegrees: deviceAttitude.pitchDegrees,
    })
  }

  const activeViewContent = {
    setup: (
      <SetupView
        gps={liveGps}
        filteredGps={filteredGps}
        attitude={deviceAttitude}
        rollPitch={rollPitch}
        isCalibrated={rollPitchCalibration !== null}
        onCalibrate={calibrateRollPitch}
      />
    ),
    course: (
      <CourseSetupView
        course={course}
        gps={liveGps}
        onToggleCoursePoint={toggleCoursePoint}
        onToggleWindHeading={toggleWindHeading}
        onClearCourse={clearCourse}
        gpsStatusMessage={courseGpsStatus}
      />
    ),
    timer: (
      <StartTimerView
        selectedMinutes={selectedCountdownMinutes}
        course={course}
        gps={liveGps}
        filteredGps={filteredGps}
        onSelectedMinutesChange={setSelectedCountdownMinutes}
        onCountdownStart={handleCountdownStart}
        onStartGun={handleStartGun}
        onReset={handleTimerReset}
        onRunningChange={setIsStartTimerRunning}
        onFinish={handleTimerFinish}
      />
    ),
    race: <RaceDashboardView course={course} gps={filteredGps} rollPitch={rollPitch} />,
    analysis: <RaceAnalysisView />,
  }[activeView]

  return (
    <div className={`app-shell ${activeView}`}>
      <NavigationBar
        currentView={activeView}
        isLocked={isNavigationLocked}
        onChange={handleManualViewChange}
      />

      <main className="app-panel">
        {activeViewContent}
      </main>
    </div>
  )
}
