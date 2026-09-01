import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NavigationBar } from '../components/NavigationBar'
import { SetupView } from '../features/setup/SetupView'
import { CourseSetupView } from '../features/course/CourseSetupView'
import { StartTimerView } from '../features/timer/StartTimerView'
import { RaceDashboardView } from '../features/race/RaceDashboardView'
import { RaceAnalysisView } from '../features/analysis/RaceAnalysisView'
import { calculateRollPitchRelativeToCalibration } from '../domain/motion'
import { getPointQuality } from '../domain/gps'
import { calculateVelocityMadeGood, getCourseAxisHeading } from '../domain/navigation'
import { getManualModeConfig, MANUAL_FIXTURES } from './manualMode'
import {
  createSimulationGpsSource,
  getSimulationCourseState,
  getSimulationLaylineSettings,
  getSimulationModeConfig,
  startSimulationTicker,
} from './simulationMode'
import { createSimulationValidator } from '../simulation/simulationValidator'
import { ensureAnalysisValidationRace } from '../services/analysisValidation'
import { getLaylineObservation } from '../features/race/laylineObservation'
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
  FilteredGpsReading,
  RollPitchCalibration,
} from '../types'
import type { WindHeadingMeasurementResult } from '../services/sensors/windHeadingService'

declare global {
  interface Window {
    __SAILRACE_SIMULATION_CONTROL__?: {
      setCommandedCourseDegrees(courseDegrees: number): void
      currentSample(): ReturnType<NonNullable<ReturnType<typeof createSimulationGpsSource>>['currentSample']>
    }
    __SAILRACE_SIMULATION_SPEED_DIAGNOSTICS__?: FilteredGpsReading
  }
}

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
  const simulationMode = useMemo(() => getSimulationModeConfig(manualMode.enabled), [manualMode.enabled])
  const isAnalysisValidation = simulationMode.scenario === 'analysis-validation'
  const analysisValidationRace = useMemo(() => (
    isAnalysisValidation ? ensureAnalysisValidationRace() : null
  ), [isAnalysisValidation])
  const simulationGpsSource = useMemo(() => (
    simulationMode.scenario === null || isAnalysisValidation ? null : createSimulationGpsSource(simulationMode.scenario)
  ), [isAnalysisValidation, simulationMode.scenario])
  const simulationValidator = useMemo(() => (
    simulationMode.scenario === null || isAnalysisValidation ? null : createSimulationValidator({ scenario: simulationMode.scenario })
  ), [isAnalysisValidation, simulationMode.scenario])
  const simulationReportLoggedRef = useRef(false)
  const simulationCourseState = useMemo(() => getSimulationCourseState(simulationMode.scenario), [simulationMode.scenario])
  const simulationLaylineSettings = useMemo(() => getSimulationLaylineSettings(simulationMode.scenario), [simulationMode.scenario])
  const [activeView, setActiveView] = useState<AppView>(
    isAnalysisValidation ? 'analysis' : simulationMode.enabled ? 'race' : (manualMode.initialView ?? 'setup'),
  )
  const [course, setCourse] = useState<CourseState>(() => (
    manualMode.enabled
      ? MANUAL_FIXTURES.course
      : simulationCourseState !== null
        ? simulationCourseState
        : defaultCourseState
  ))
  const [selectedCountdownMinutes, setSelectedCountdownMinutes] = useState<CountdownDuration>(5)
  const [isStartTimerRunning, setIsStartTimerRunning] = useState(false)
  const [courseGpsStatus, setCourseGpsStatus] = useState<string | null>(null)
  const [rollPitchCalibration, setRollPitchCalibration] = useState<RollPitchCalibration | null>(null)
  const [laylineEnabled, setLaylineEnabled] = useState(() => simulationLaylineSettings?.enabled ?? loadAppSettings().layline.enabled)
  const [laylineAlphaDegrees, setLaylineAlphaDegrees] = useState(() => simulationLaylineSettings?.alphaDegrees ?? loadAppSettings().layline.alphaDegrees)
  const [displayMode, setDisplayMode] = useState(() => loadAppSettings().displayMode)
  const liveGpsDevice = useLiveGps(
    !manualMode.enabled && activeView !== 'analysis',
    simulationGpsSource ?? undefined,
  )
  const filteredGpsDevice = useFilteredGps(liveGpsDevice)
  const deviceAttitudeDevice = useDeviceAttitude(!manualMode.enabled && (activeView === 'setup' || activeView === 'race'))
  const liveGps = manualMode.enabled ? MANUAL_FIXTURES.liveGps : liveGpsDevice
  const filteredGps = manualMode.enabled ? MANUAL_FIXTURES.filteredGps : filteredGpsDevice
  const simulationAppVmgKnots = simulationMode.scenario === 'wind-vmg' &&
    filteredGps.speedKnots !== null &&
    filteredGps.courseDegrees !== null &&
    course.windHeadingDegrees !== null
    ? calculateVelocityMadeGood(filteredGps.speedKnots, filteredGps.courseDegrees, course.windHeadingDegrees)
    : null
  const simulationLaylineObservation = simulationMode.scenario === 'layline-candidate' || simulationMode.scenario === 'upwind-to-k1'
    ? getLaylineObservation({ course, gps: filteredGps, enabled: laylineEnabled, alphaDegrees: laylineAlphaDegrees })
    : null
  const deviceAttitude = manualMode.enabled ? MANUAL_FIXTURES.attitude : deviceAttitudeDevice
  const rollPitch = manualMode.enabled
    ? MANUAL_FIXTURES.rollPitch
    : calculateRollPitchRelativeToCalibration(deviceAttitude, rollPitchCalibration)
  const isNavigationLocked = isStartTimerRunning
  const courseDefinition = useMemo(() => getCourseDefinition(course), [course])
  useWakeLock(true)

  useEffect(() => {
    if (simulationGpsSource === null) {
      return
    }

    return startSimulationTicker(simulationGpsSource, simulationMode.tickIntervalMs)
  }, [simulationGpsSource, simulationMode.tickIntervalMs])

  useEffect(() => {
    if ((simulationMode.scenario !== 'layline-reactive-tack' && simulationMode.scenario !== 'upwind-to-k1' && simulationMode.scenario !== 'speed-source-disagreement' && simulationMode.scenario !== 'course-source-disagreement') || simulationGpsSource === null) {
      return
    }

    window.__SAILRACE_SIMULATION_CONTROL__ = {
      setCommandedCourseDegrees: simulationGpsSource.setCommandedCourseDegrees,
      currentSample: simulationGpsSource.currentSample,
    }

    return () => {
      delete window.__SAILRACE_SIMULATION_CONTROL__
    }
  }, [simulationGpsSource, simulationMode.scenario])

  useEffect(() => {
    if (simulationGpsSource === null || simulationValidator === null) {
      return
    }

    simulationValidator.observe(simulationGpsSource.currentSample(), {
      ...filteredGps,
      vmgKnots: simulationAppVmgKnots,
      laylineObservation: simulationLaylineObservation,
    })

    if (!simulationValidator.isComplete() || simulationReportLoggedRef.current) {
      return
    }

    const report = simulationValidator.getReport()
    window.__SAILRACE_SIMULATION_REPORT__ = report
    console.info('SailRace simulation validation report', report)
    simulationReportLoggedRef.current = true
  }, [filteredGps, simulationAppVmgKnots, simulationGpsSource, simulationLaylineObservation, simulationValidator])

  useEffect(() => {
    if (simulationMode.scenario === 'speed-source-disagreement' || simulationMode.scenario === 'course-source-disagreement') {
      window.__SAILRACE_SIMULATION_SPEED_DIAGNOSTICS__ = filteredGps
    }
  }, [filteredGps, simulationMode.scenario])

  useEffect(() => {
    document.documentElement.dataset.theme = displayMode
  }, [displayMode])

  useEffect(() => {
    if (manualMode.enabled || simulationLaylineSettings !== null) {
      return
    }

    saveAppSettings({
      layline: {
        enabled: laylineEnabled,
        alphaDegrees: laylineAlphaDegrees,
      },
      displayMode,
    })
  }, [displayMode, laylineAlphaDegrees, laylineEnabled, manualMode.enabled, simulationLaylineSettings])

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
      windMeasurement: course.windMeasurement,
    })
  }, [course, courseDefinition])

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

  const setWindMeasurement = (measurement: WindHeadingMeasurementResult | null) => {
    setCourse((current) => ({ ...current, windMeasurement: measurement ?? undefined }))
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
        displayMode={displayMode}
        onDisplayModeChange={setDisplayMode}
      />
    ),
    course: (
      <CourseSetupView
        course={course}
        gps={liveGps}
        onToggleCoursePoint={toggleCoursePoint}
        onToggleWindHeading={toggleWindHeading}
        onWindMeasurement={setWindMeasurement}
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
    analysis: <RaceAnalysisView initialRaceId={analysisValidationRace?.id} />,
  }[activeView]

  return (
    <div className={`app-shell ${activeView}`} data-theme={displayMode}>
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
