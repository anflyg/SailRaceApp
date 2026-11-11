import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NavigationBar } from '../components/NavigationBar'
import { EndRaceDialog } from '../components/EndRaceDialog'
import { RaceRecoveryDialog } from '../components/RaceRecoveryDialog'
import { SetupView } from '../features/setup/SetupView'
import { CourseSetupView } from '../features/course/CourseSetupView'
import { StartTimerView } from '../features/timer/StartTimerView'
import { RaceDashboardView } from '../features/race/RaceDashboardView'
import { RecordedRaceAnalysis } from '../features/analysis/RecordedRaceAnalysis'
import { calculateRollPitchRelativeToCalibration } from '../domain/motion'
import { getPointQuality } from '../domain/gps'
import { calculateVelocityMadeGood, getCourseAxisHeading } from '../domain/navigation'
import { isFreshReliableGps, isUsableWindReference } from '../domain/windReference'
import { getManualModeConfig, MANUAL_FIXTURES } from './manualMode'
import {
  createSimulationGpsSource,
  getSimulationCourseState,
  getSimulationLaylineSettings,
  getSimulationModeConfig,
  startSimulationTicker,
} from './simulationMode'
import { createSimulationValidator } from '../simulation/simulationValidator'
import { ensureMetricsValidationRace, validateAnalysisFixture, type AnalysisValidationReport } from '../services/analysisValidation'
import { ensureLoggedRaceAnalysis, type LoggedRaceAnalysisReport } from '../services/loggedRaceAnalysisValidation'
import { getLaylineObservation } from '../features/race/laylineObservation'
import { useDeviceAttitude } from '../hooks/useDeviceAttitude'
import { useFilteredGps } from '../hooks/useFilteredGps'
import { useLiveGps } from '../hooks/useLiveGps'
import { useWakeLock } from '../hooks/useWakeLock'
import {
  markStartGun,
  getActiveCountdownToken,
  getActiveRaceId,
  pausePlannedStart,
  recordSampleIfDue,
  startRaceLogging,
  stopActiveRace,
  updatePlannedStart,
  updatePreStartCourse,
} from '../services/raceLogger'
import { getRace } from '../services/raceStorage'
import type { CountdownToken } from '../services/raceLogger'
import { loadAppSettings, saveAppSettings } from '../services/appSettingsStorage'
import type { CompassDisplayMode } from '../services/appSettingsStorage'
import { LanguageProvider } from '../i18n/LanguageContext'
import type { AppLanguage } from '../i18n/translations'
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
  Race,
} from '../types'
import type { WindHeadingMeasurementResult } from '../services/sensors/windHeadingService'

declare global {
  interface Window {
    __SAILRACE_SIMULATION_CONTROL__?: {
      setCommandedCourseDegrees(courseDegrees: number): void
      currentSample(): ReturnType<NonNullable<ReturnType<typeof createSimulationGpsSource>>['currentSample']>
    }
    __SAILRACE_SIMULATION_SPEED_DIAGNOSTICS__?: FilteredGpsReading
    __SAILRACE_ANALYSIS_VALIDATION_REPORT__?: AnalysisValidationReport
    __SAILRACE_LOGGED_RACE_ANALYSIS_REPORT__?: LoggedRaceAnalysisReport
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

function raceReference(race: Race | null): Pick<Race, 'course' | 'windMeasurement'> | null {
  return race ? { course: race.course, windMeasurement: race.windMeasurement } : null
}

function restoreCourse(race: Race): CourseState {
  const point = (value: { latitude: number; longitude: number } | undefined): CoursePoint | null =>
    value ? { ...value, quality: 'poor' } : null
  return {
    points: { startA: point(race.course?.startLine?.port), startB: point(race.course?.startLine?.starboard),
      kryss1: point(race.course?.windwardMark), lans1: point(race.course?.leewardMark) },
    windHeadingDegrees: race.course?.windDirectionDegrees ?? null,
    windMeasurement: race.windMeasurement,
  }
}

export function AppShell() {
  const manualMode = useMemo(getManualModeConfig, [])
  const simulationMode = useMemo(() => getSimulationModeConfig(manualMode.enabled), [manualMode.enabled])
  const isAnalysisValidation = simulationMode.scenario === 'analysis-validation'
  const isLoggedRaceAnalysis = simulationMode.scenario === 'logged-race-analysis'
  const analysisValidationRace = useMemo(() => (
    isAnalysisValidation ? ensureMetricsValidationRace() : null
  ), [isAnalysisValidation])
  const loggedRaceAnalysis = useMemo(() => (
    isLoggedRaceAnalysis ? ensureLoggedRaceAnalysis() : null
  ), [isLoggedRaceAnalysis])
  const simulationGpsSource = useMemo(() => (
    simulationMode.scenario === null || isAnalysisValidation || isLoggedRaceAnalysis ? null : createSimulationGpsSource(simulationMode.scenario)
  ), [isAnalysisValidation, isLoggedRaceAnalysis, simulationMode.scenario])
  const simulationValidator = useMemo(() => (
    simulationMode.scenario === null || isAnalysisValidation || isLoggedRaceAnalysis ? null : createSimulationValidator({ scenario: simulationMode.scenario })
  ), [isAnalysisValidation, isLoggedRaceAnalysis, simulationMode.scenario])
  const simulationReportLoggedRef = useRef(false)
  const simulationCourseState = useMemo(() => getSimulationCourseState(simulationMode.scenario), [simulationMode.scenario])
  const simulationLaylineSettings = useMemo(() => getSimulationLaylineSettings(simulationMode.scenario), [simulationMode.scenario])
  const [activeView, setActiveView] = useState<AppView>(
    isAnalysisValidation || isLoggedRaceAnalysis ? 'analysis' : simulationMode.enabled ? 'race' : (manualMode.initialView ?? 'setup'),
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
  const [endRaceDialogOpen, setEndRaceDialogOpen] = useState(false)
  const [timerResetVersion, setTimerResetVersion] = useState(0)
  const [activeRaceId, setActiveRaceId] = useState<string | null>(() => getActiveRaceId())
  const [activeRaceReference, setActiveRaceReference] = useState<Pick<Race, 'course' | 'windMeasurement'> | null>(() => {
    const id = getActiveRaceId()
    return raceReference(id ? getRace(id) : null)
  })
  const [recoveryPending, setRecoveryPending] = useState(() => getActiveRaceId() !== null)
  const recoveryResumedAtRef = useRef<number | null>(null)
  const skipRestoredCourseSync = useRef(false)
  const [recordingMessageKey, setRecordingMessageKey] = useState<'recording.saved' | null>(null)
  const activeRaceIdRef = useRef(activeRaceId)
  const [courseGpsStatus, setCourseGpsStatus] = useState<string | null>(null)
  const [rollPitchCalibration, setRollPitchCalibration] = useState<RollPitchCalibration | null>(null)
  // Legacy settings cannot re-enable layline warnings for a normal race.
  const laylineEnabled = simulationLaylineSettings?.enabled ?? false
  const [laylineAlphaDegrees, setLaylineAlphaDegrees] = useState(() => simulationLaylineSettings?.alphaDegrees ?? loadAppSettings().layline.alphaDegrees)
  const [language, setLanguage] = useState<AppLanguage>(() => loadAppSettings().language)
  const [compassDisplayMode, setCompassDisplayMode] = useState<CompassDisplayMode>(() => loadAppSettings().compassDisplayMode)
  const liveGpsDevice = useLiveGps(
    !manualMode.enabled && (activeView !== 'analysis' || (activeRaceId !== null && !recoveryPending)),
    simulationGpsSource ?? undefined,
  )
  const filteredGpsDevice = useFilteredGps(liveGpsDevice)
  const deviceAttitudeDevice = useDeviceAttitude(!manualMode.enabled && (activeView === 'setup' || activeView === 'race'))
  const liveGps = manualMode.enabled ? MANUAL_FIXTURES.liveGps : liveGpsDevice
  const filteredGps = manualMode.enabled ? MANUAL_FIXTURES.filteredGps : filteredGpsDevice
  const simulationAppVmgKnots = simulationMode.scenario === 'wind-vmg' &&
    isUsableWindReference(course.windHeadingDegrees, course.windMeasurement) &&
    isFreshReliableGps(filteredGps, filteredGps.courseDegrees, filteredGps.timestamp) &&
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

  useEffect(() => {
    if (skipRestoredCourseSync.current) { skipRestoredCourseSync.current = false; return }
    if (activeRaceId && !recoveryPending) {
      const race = updatePreStartCourse(courseDefinition, course.windMeasurement)
      if (race) setActiveRaceReference(raceReference(race))
    }
  }, [course, courseDefinition, activeRaceId, recoveryPending])
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
    if (isAnalysisValidation) {
      window.__SAILRACE_ANALYSIS_VALIDATION_REPORT__ = validateAnalysisFixture()
    }
    if (isLoggedRaceAnalysis && loggedRaceAnalysis) {
      window.__SAILRACE_LOGGED_RACE_ANALYSIS_REPORT__ = loggedRaceAnalysis.report
    }

    return () => {
      delete window.__SAILRACE_ANALYSIS_VALIDATION_REPORT__
      delete window.__SAILRACE_LOGGED_RACE_ANALYSIS_REPORT__
    }
  }, [isAnalysisValidation, isLoggedRaceAnalysis, loggedRaceAnalysis])

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
    if (manualMode.enabled || simulationLaylineSettings !== null) {
      return
    }

    saveAppSettings({
      layline: {
        enabled: laylineEnabled,
        alphaDegrees: laylineAlphaDegrees,
      },
      language,
      compassDisplayMode,
    })
  }, [compassDisplayMode, language, laylineAlphaDegrees, laylineEnabled, manualMode.enabled, simulationLaylineSettings])

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
    const race = startRaceLogging({
      countdownDurationSeconds: durationSeconds,
      course: courseDefinition,
      windMeasurement: course.windMeasurement,
    })
    activeRaceIdRef.current = race.id
    setActiveRaceId(race.id)
    setActiveRaceReference(raceReference(race))
    setRecordingMessageKey(null)
    return getActiveCountdownToken()
  }, [course, courseDefinition])

  const handleStartGun = useCallback((token: CountdownToken) => {
    return markStartGun(new Date(), token)?.id === token.raceId
  }, [])

  const refreshActiveRace = useCallback(() => {
    const nextActiveRaceId = getActiveRaceId()
    const previousActiveRaceId = activeRaceIdRef.current
    activeRaceIdRef.current = nextActiveRaceId
    setActiveRaceId(nextActiveRaceId)
    if (previousActiveRaceId !== nextActiveRaceId) {
      setActiveRaceReference(raceReference(nextActiveRaceId ? getRace(nextActiveRaceId) : null))
    }

    if (previousActiveRaceId && !nextActiveRaceId) {
      setRecordingMessageKey('recording.saved')
    }
  }, [])

  const handleStopRecording = useCallback(() => {
    setEndRaceDialogOpen(false)
    const stoppedRace = stopActiveRace()
    setRecoveryPending(false)
    recoveryResumedAtRef.current = null
    setIsStartTimerRunning(false)
    setTimerResetVersion((version) => version + 1)
    refreshActiveRace()
    if (stoppedRace) setRecordingMessageKey('recording.saved')
  }, [refreshActiveRace])

  useEffect(() => {
    if (recoveryPending) pausePlannedStart()
  }, [recoveryPending])

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refreshActiveRace()
    }
    document.addEventListener('visibilitychange', refreshWhenVisible)
    window.addEventListener('pageshow', refreshWhenVisible)
    window.addEventListener('focus', refreshWhenVisible)

    return () => {
      document.removeEventListener('visibilitychange', refreshWhenVisible)
      window.removeEventListener('pageshow', refreshWhenVisible)
      window.removeEventListener('focus', refreshWhenVisible)
    }
  }, [refreshActiveRace])

  useEffect(() => {
    activeRaceIdRef.current = activeRaceId
  }, [activeRaceId])

  useEffect(() => {
    refreshActiveRace()
  }, [refreshActiveRace])

  useEffect(() => {
    if (manualMode.enabled || activeRaceId === null || recoveryPending) {
      return
    }

    if (recoveryResumedAtRef.current !== null) {
      if (filteredGps.timestamp === null || filteredGps.timestamp <= recoveryResumedAtRef.current) return
      recoveryResumedAtRef.current = null
    }

    recordSampleIfDue({
      gps: filteredGps,
      course: courseDefinition,
      windMeasurement: course.windMeasurement,
    })
    refreshActiveRace()
  }, [activeRaceId, course.windMeasurement, courseDefinition, filteredGps, manualMode.enabled, recoveryPending, refreshActiveRace])

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
      setCourseGpsStatus('gps-position-unavailable')
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

  const setWindHeading = (headingDegrees: number | null) => {
    setCourse((current) => ({ ...current, windHeadingDegrees: headingDegrees }))
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
        attitude={deviceAttitude}
        rollPitch={rollPitch}
        isCalibrated={rollPitchCalibration !== null}
        onCalibrate={calibrateRollPitch}
        laylineAlphaDegrees={laylineAlphaDegrees}
        onLaylineAlphaDegreesChange={setLaylineAlphaDegrees}
        compassDisplayMode={compassDisplayMode}
        onCompassDisplayModeChange={setCompassDisplayMode}
      />
    ),
    course: (
      <CourseSetupView
        course={course}
        gps={liveGps}
        onToggleCoursePoint={toggleCoursePoint}
        onWindHeadingChange={setWindHeading}
        onWindMeasurement={setWindMeasurement}
        onClearCourse={clearCourse}
        gpsStatusMessage={courseGpsStatus}
      />
    ),
    timer: (
      <StartTimerView
        key={timerResetVersion}
        selectedMinutes={selectedCountdownMinutes}
        course={course}
        gps={liveGps}
        filteredGps={filteredGps}
        onSelectedMinutesChange={setSelectedCountdownMinutes}
        onCountdownStart={handleCountdownStart}
        onCountdownResume={updatePlannedStart}
        onCountdownPause={pausePlannedStart}
        onStartGun={handleStartGun}
        onRunningChange={setIsStartTimerRunning}
        onFinish={handleTimerFinish}
        recordingActive={activeRaceId !== null}
        recordingMessageKey={recordingMessageKey}
        onStopRecording={() => setEndRaceDialogOpen(true)}
      />
    ),
    race: (
      <RaceDashboardView
        course={course}
        gps={filteredGps}
        compassDisplayMode={compassDisplayMode}
        laylineAlphaDegrees={laylineAlphaDegrees}
        recordingActive={activeRaceId !== null}
        raceReference={activeRaceReference}
        onStopRecording={() => setEndRaceDialogOpen(true)}
      />
    ),
    analysis: <RecordedRaceAnalysis enabled={!manualMode.enabled && !simulationMode.enabled}
      recordingActive={activeRaceId !== null}
      recordingMessageKey={recordingMessageKey}
      onStopRecording={() => setEndRaceDialogOpen(true)}
      initialRaceId={analysisValidationRace?.id ?? loggedRaceAnalysis?.race.id} initialRace={loggedRaceAnalysis?.race} />,
  }[activeView]

  return (
    <LanguageProvider language={language} setLanguage={setLanguage}>
    <div className={`app-shell ${activeView}`}>
      <NavigationBar
        currentView={activeView}
        isLocked={isNavigationLocked}
        onChange={handleManualViewChange}
      />

      <main className="app-panel">
        {activeViewContent}
      </main>
      {recoveryPending && !endRaceDialogOpen ? <RaceRecoveryDialog
        onContinue={() => { const race = activeRaceId ? getRace(activeRaceId) : null; if (race) { skipRestoredCourseSync.current = true; setCourse(restoreCourse(race)); setActiveRaceReference(raceReference(race)) }; pausePlannedStart(); recoveryResumedAtRef.current = Date.now(); setRecoveryPending(false) }}
        onEnd={() => setEndRaceDialogOpen(true)} /> : null}
      {endRaceDialogOpen ? <EndRaceDialog onCancel={() => setEndRaceDialogOpen(false)} onConfirm={handleStopRecording} /> : null}
    </div>
    </LanguageProvider>
  )
}
