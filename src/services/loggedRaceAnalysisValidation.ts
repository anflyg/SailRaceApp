import { markStartGun, recordSampleIfDue, startRaceLogging, stopActiveRace } from './raceLogger'
import { getRace, listRaces } from './raceStorage'
import {
  ANALYSIS_VALIDATION_RACE_NAME,
  getFixtureTrajectoryPosition,
  validateAnalysisRace,
  type AnalysisValidationReport,
} from './analysisValidation'
import type { CourseDefinition, FilteredGpsReading, Race } from '../types'

const LOGGED_RACE_NAME = 'Logged race analysis fixture'
const START_GUN_TIME = Date.parse('2024-06-15T12:00:00.000Z')
const LOGGER_START_TIME = new Date(START_GUN_TIME - 2_500)
const COURSE: CourseDefinition = {
  startLine: {
    port: { latitude: 59.3, longitude: 18 },
    starboard: { latitude: 59.3, longitude: 18.001 },
  },
}

export type LoggedRaceAnalysisReport = {
  scenario: 'logged-race-analysis'
  logging: { observationCount: number; storedSampleCount: number; storedTimestamps: string[]; startGunTime: string | null; endTime: string | null; pass: boolean }
  storage: { raceReloaded: boolean; coursePreserved: boolean; diagnosticsPreserved: boolean; summaryCreated: boolean; pass: boolean }
  analysis: AnalysisValidationReport
  maxErrors: { positionMeters: number; speedKnots: number; courseDegrees: number }
  pass: boolean
}

function toFilteredGpsReading(elapsedSeconds: number): FilteredGpsReading {
  const position = getFixtureTrajectoryPosition(elapsedSeconds)
  const courseDegrees = elapsedSeconds >= 6 ? 45 : 0

  return {
    status: 'watching', error: null, ...position, accuracyMeters: 2, speedKnots: 6, courseDegrees, courseReliable: true,
    timestamp: START_GUN_TIME + elapsedSeconds * 1000,
    nativeCourseDegrees: courseDegrees, positionCourseDegrees: courseDegrees, fusedCourseDegrees: courseDegrees,
    nativeSpeedKnots: 6, positionSpeedKnots: 6, fusedSpeedKnots: 6, sampleCount: 1,
    displayCourseDegrees: courseDegrees, presentationTimestamp: START_GUN_TIME + elapsedSeconds * 1000,
  }
}

export function ensureLoggedRaceAnalysis(): { race: Race; report: LoggedRaceAnalysisReport } {
  const existingRace = listRaces().find((race) => race.name === LOGGED_RACE_NAME)
  if (existingRace) return createReport(existingRace, 0)

  const startedRace = startRaceLogging({ countdownDurationSeconds: 2.5, course: COURSE, name: LOGGED_RACE_NAME, now: LOGGER_START_TIME })
  markStartGun(new Date(START_GUN_TIME))
  const observationTimes = Array.from({ length: 9 }, (_, index) => index)
  for (const elapsedSeconds of observationTimes) {
    recordSampleIfDue({ gps: toFilteredGpsReading(elapsedSeconds), course: COURSE, now: new Date(START_GUN_TIME + elapsedSeconds * 1000) })
  }
  stopActiveRace({ now: new Date(START_GUN_TIME + 8_500) })
  const storedRace = getRace(startedRace.id)
  if (!storedRace) throw new Error('Logged analysis race was not persisted')
  return createReport(storedRace, observationTimes.length)
}

function createReport(race: Race, observationCount: number): { race: Race; report: LoggedRaceAnalysisReport } {
  const analysis = validateAnalysisRace(race)
  const coursePreserved = race.course?.startLine?.port.latitude === COURSE.startLine?.port.latitude && race.course?.startLine?.starboard.longitude === COURSE.startLine?.starboard.longitude
  const diagnosticsPreserved = race.samples.length > 0 && race.samples.every((sample) => sample.speedKnots === 6 && sample.cogDegrees !== undefined && sample.accuracy === 2)
  const storagePass = race.id.length > 0 && Boolean(race.summary) && coursePreserved && diagnosticsPreserved
  const loggingPass = race.samples.length > 0 && race.startGunTime === new Date(START_GUN_TIME).toISOString() && race.endTime !== undefined && race.samples.every((sample, index, samples) => index === 0 || sample.timestamp >= samples[index - 1].timestamp)
  const replayErrors = analysis.replayChecks.map((check) => ({ position: check.actualPosition?.errorMeters ?? Infinity, speed: check.speed.error ?? Infinity, course: check.course.error ?? Infinity }))

  return {
    race,
    report: {
      scenario: 'logged-race-analysis',
      logging: { observationCount, storedSampleCount: race.samples.length, storedTimestamps: race.samples.map((sample) => sample.timestamp), startGunTime: race.startGunTime ?? null, endTime: race.endTime ?? null, pass: loggingPass },
      storage: { raceReloaded: Boolean(getRace(race.id)), coursePreserved, diagnosticsPreserved, summaryCreated: Boolean(race.summary), pass: storagePass },
      analysis,
      maxErrors: {
        positionMeters: Math.max(...replayErrors.map((error) => error.position)),
        speedKnots: Math.max(...replayErrors.map((error) => error.speed)),
        courseDegrees: Math.max(...replayErrors.map((error) => error.course)),
      },
      pass: loggingPass && storagePass && analysis.pass,
    },
  }
}

export { ANALYSIS_VALIDATION_RACE_NAME }
