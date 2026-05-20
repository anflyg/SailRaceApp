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
import { getManualModeConfig, MANUAL_FIXTURES } from './manualMode'
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
import { loadAppSettings, saveAppSettings } from '../services/appSettingsStorage'
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
  const manualMode = useMemo(getManualModeConfig, [])
  const [activeView, setActiveView] = useState<AppView>(manualMode.initialView ?? 'setup')
  const [course, setCourse] = useState<CourseState>(() => (
    manualMode.enabled ? MANUAL_FIXTURES.course : defaultCourseState
  ))
  const [selectedCountdownMinutes, setSelectedCountdownMinutes] = useState<CountdownDuration>(5)
  const [isStartTimerRunning, setIsStartTimerRunning] = useState(false)
  const [courseGpsStatus, setCourseGpsStatus] = useState<string | null>(null)
  const [rollPitchCalibration, setRollPitchCalibration] = useState<RollPitchCalibration | null>(null)
  const [laylineEnabled, setLaylineEnabled] = useState(() => loadAppSettings().layline.enabled)
  const [laylineAlphaDegrees, setLaylineAlphaDegrees] = useState(() => loadAppSettings().layline.alphaDegrees)
  const liveGpsDevice = useLiveGps(!manualMode.enabled && activeView !== 'analysis')
  const filteredGpsDevice = useFilteredGps(liveGpsDevice)
  const deviceAttitudeDevice = useDeviceAttitude(!manualMode.enabled && (activeView === 'setup' || activeView === 'race'))
  const liveGps = manualMode.enabled ? MANUAL_FIXTURES.liveGps : liveGpsDevice
  const filteredGps = manualMode.enabled ? MANUAL_FIXTURES.filteredGps : filteredGpsDevice
  const deviceAttitude = manualMode.enabled ? MANUAL_FIXTURES.attitude : deviceAttitudeDevice
  const rollPitch = manualMode.enabled
    ? MANUAL_FIXTURES.rollPitch
    : calculateRollPitchRelativeToCalibration(deviceAttitude, rollPitchCalibration)
  const isNavigationLocked = isStartTimerRunning
  const courseDefinition = useMemo(() => getCourseDefinition(course), [course])
  useWakeLock(true)

  useEffect(() => {
    if (manualMode.enabled) {
      return
    }

    saveAppSettings({
      layline: {
        enabled: laylineEnabled,
        alphaDegrees: laylineAlphaDegrees,
      },
    })
  }, [laylineAlphaDegrees, laylineEnabled, manualMode.enabled])

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
    if (manualMode.enabled || activeView === 'analysis') {
      return
    }

    recordSampleIfDue({
      gps: filteredGps,
      course: courseDefinition,
    })
  }, [activeView, courseDefinition, filteredGps, manualMode.enabled])

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
        laylineEnabled={laylineEnabled}
        laylineAlphaDegrees={laylineAlphaDegrees}
        onLaylineEnabledChange={setLaylineEnabled}
        onLaylineAlphaDegreesChange={setLaylineAlphaDegrees}
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
    race: (
      <RaceDashboardView
        course={course}
        gps={filteredGps}
        rollPitch={rollPitch}
        laylineEnabled={laylineEnabled}
        laylineAlphaDegrees={laylineAlphaDegrees}
        manualLaylineCountdownValue={manualMode.enabled ? manualMode.laylineCountdownValue : null}
      />
    ),
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
