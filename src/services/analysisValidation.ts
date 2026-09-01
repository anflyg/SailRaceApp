import { buildReplayTimeline, getReplayFrame } from './raceReplay'
import { analyzeRaceStart } from './startAnalysis'
import { createRace, listRaces } from './raceStorage'
import type { Race, RaceSample } from '../types'

export const ANALYSIS_VALIDATION_RACE_NAME = 'Analysis validation fixture'
const FIXTURE_START = Date.parse('2024-06-15T12:00:00.000Z')
const ORIGIN = { latitude: 59.3, longitude: 18 }
const METERS_PER_LATITUDE_DEGREE = 111_320
const METERS_PER_LONGITUDE_DEGREE = METERS_PER_LATITUDE_DEGREE * Math.cos(ORIGIN.latitude * Math.PI / 180)
const PHYSICAL_SPEED_KNOTS = 6
const PHYSICAL_SPEED_METERS_PER_SECOND = PHYSICAL_SPEED_KNOTS / 1.943844
const CROSSING_SECONDS = 2.5

type GeoPoint = { latitude: number; longitude: number }

export const ANALYSIS_VALIDATION_TRUTH = {
  crossingTimeSeconds: CROSSING_SECONDS,
  crossingPosition: { ...ORIGIN, longitude: ORIGIN.longitude + 0.0005 },
  crossingSpeedKnots: PHYSICAL_SPEED_KNOTS,
  crossingCourseDegrees: 0,
  replay: [
    { timeSeconds: 0, position: { latitude: 59.299930680303, longitude: 18.0005 }, speedKnots: 6, courseDegrees: 0 },
    { timeSeconds: 2, position: { latitude: 59.299986136061, longitude: 18.0005 }, speedKnots: 6, courseDegrees: 0 },
    { timeSeconds: 2.5, position: { latitude: 59.3, longitude: 18.0005 }, speedKnots: 6, courseDegrees: 0 },
    { timeSeconds: 6, position: { latitude: 59.300097047575, longitude: 18.0005 }, speedKnots: 6, courseDegrees: 45 },
    { timeSeconds: 7, position: { latitude: 59.300116654146, longitude: 18.000538403375 }, speedKnots: 6, courseDegrees: 45 },
    { timeSeconds: 8, position: { latitude: 59.300136260717, longitude: 18.00057680675 }, speedKnots: 6, courseDegrees: 45 },
  ],
} as const

export function getFixtureTrajectoryPosition(elapsedSeconds: number): GeoPoint {
  const elapsedAfterTurn = Math.max(0, elapsedSeconds - 6)
  const turnDistanceMeters = (6 - CROSSING_SECONDS) * PHYSICAL_SPEED_METERS_PER_SECOND
  const postTurnDistanceMeters = elapsedAfterTurn * PHYSICAL_SPEED_METERS_PER_SECOND
  const eastMeters = postTurnDistanceMeters / Math.sqrt(2)
  const northMeters = elapsedSeconds <= 6
    ? (elapsedSeconds - CROSSING_SECONDS) * PHYSICAL_SPEED_METERS_PER_SECOND
    : turnDistanceMeters + postTurnDistanceMeters / Math.sqrt(2)

  return {
    latitude: ORIGIN.latitude + northMeters / METERS_PER_LATITUDE_DEGREE,
    longitude: ORIGIN.longitude + 0.0005 + eastMeters / METERS_PER_LONGITUDE_DEGREE,
  }
}

function fixtureSample(elapsedSeconds: number, courseDegrees: number): RaceSample {
  const position = getFixtureTrajectoryPosition(elapsedSeconds)

  return {
    timestamp: new Date(FIXTURE_START + elapsedSeconds * 1000).toISOString(),
    elapsedSeconds,
    ...position,
    accuracy: 2,
    speedKnots: PHYSICAL_SPEED_KNOTS,
    nativeSpeedKnots: PHYSICAL_SPEED_KNOTS,
    positionSpeedKnots: PHYSICAL_SPEED_KNOTS,
    fusedSpeedKnots: PHYSICAL_SPEED_KNOTS,
    nativeCourseDegrees: courseDegrees,
    positionCourseDegrees: courseDegrees,
    fusedCourseDegrees: courseDegrees,
    cogDegrees: courseDegrees,
  }
}

export const ANALYSIS_VALIDATION_RACE: Omit<Race, 'id' | 'dayId' | 'summary'> = {
  name: ANALYSIS_VALIDATION_RACE_NAME,
  createdAt: new Date(FIXTURE_START).toISOString(),
  startGunTime: new Date(FIXTURE_START).toISOString(),
  endTime: new Date(FIXTURE_START + 8_000).toISOString(),
  course: {
    startLine: {
      port: ORIGIN,
      starboard: { latitude: ORIGIN.latitude, longitude: ORIGIN.longitude + 0.001 },
    },
  },
  samples: [fixtureSample(0, 0), fixtureSample(2, 0), fixtureSample(3, 0), fixtureSample(6, 45), fixtureSample(8, 45)],
  events: [],
}

export function ensureAnalysisValidationRace(): Race {
  const existingRace = listRaces().find((race) => race.name === ANALYSIS_VALIDATION_RACE_NAME)
  return existingRace ?? createRace({ date: ANALYSIS_VALIDATION_RACE.createdAt, ...ANALYSIS_VALIDATION_RACE })
}

type PositionReport = { latitude: number; longitude: number; errorMeters: number }
type NumericReport = { expected: number; actual: number | null; error: number | null }

export type AnalysisValidationReport = {
  scenario: 'analysis-validation'
  startAnalysis: {
    expectedCrossingDeltaSeconds: number; actualCrossingDeltaSeconds: number | null; deltaErrorSeconds: number | null
    expectedCrossingPosition: GeoPoint; actualCrossingPosition: GeoPoint | null; positionErrorMeters: number | null
    expectedSpeedKnots: number; actualSpeedKnots: number | null; speedErrorKnots: number | null
    expectedCourseDegrees: number; actualCourseDegrees: number | null; courseErrorDegrees: number | null
    actualAccuracyMeters: number | null; actualUncertaintySeconds: number | null; actualUncertaintyMeters: number | null; pass: boolean
  }
  replayChecks: Array<{ timeSeconds: number; interpolationMode: string | null; expectedPosition: GeoPoint; actualPosition: PositionReport | null; speed: NumericReport; course: NumericReport; pass: boolean }>
  pass: boolean
}

function positionErrorMeters(expected: GeoPoint, actual: GeoPoint): number {
  const latitudeMeters = (actual.latitude - expected.latitude) * METERS_PER_LATITUDE_DEGREE
  const longitudeMeters = (actual.longitude - expected.longitude) * METERS_PER_LONGITUDE_DEGREE
  return Math.sqrt(latitudeMeters ** 2 + longitudeMeters ** 2)
}

function angleErrorDegrees(expected: number, actual: number | null): number | null {
  if (actual === null) return null
  return Math.abs((((actual - expected) + 540) % 360) - 180)
}

function numericReport(expected: number, actual: number | undefined, error: number | null): NumericReport {
  return { expected, actual: actual ?? null, error }
}

export function validateAnalysisFixture(): AnalysisValidationReport {
  const race = ANALYSIS_VALIDATION_RACE as Race
  const start = analyzeRaceStart(race)
  const timeline = buildReplayTimeline(race)
  const startPosition = start.crossingPoint ?? null
  const startPositionError = startPosition ? positionErrorMeters(ANALYSIS_VALIDATION_TRUTH.crossingPosition, startPosition) : null
  const startSpeedError = start.crossingSpeedKnots === undefined ? null : Math.abs(start.crossingSpeedKnots - ANALYSIS_VALIDATION_TRUTH.crossingSpeedKnots)
  const startCourseError = angleErrorDegrees(ANALYSIS_VALIDATION_TRUTH.crossingCourseDegrees, start.crossingCogDegrees ?? null)
  const startPass = start.status === 'ok' && start.deltaSeconds !== undefined && Math.abs(start.deltaSeconds - ANALYSIS_VALIDATION_TRUTH.crossingTimeSeconds) <= 0.5 && startPositionError !== null && startPositionError <= 1 && startSpeedError !== null && startSpeedError <= 0.1 && startCourseError !== null && startCourseError <= 1
  const replayChecks = ANALYSIS_VALIDATION_TRUTH.replay.map((truth) => {
    const frame = getReplayFrame(timeline, truth.timeSeconds)
    const actual = frame?.sample
    const actualPosition = actual ? { latitude: actual.latitude, longitude: actual.longitude, errorMeters: positionErrorMeters(truth.position, actual) } : null
    const speedError = actual?.speedKnots === undefined ? null : Math.abs(actual.speedKnots - truth.speedKnots)
    const courseError = angleErrorDegrees(truth.courseDegrees, actual?.cogDegrees ?? null)
    return {
      timeSeconds: truth.timeSeconds, interpolationMode: frame?.interpolationMode ?? null,
      expectedPosition: truth.position, actualPosition,
      speed: numericReport(truth.speedKnots, actual?.speedKnots, speedError),
      course: numericReport(truth.courseDegrees, actual?.cogDegrees, courseError),
      pass: actualPosition !== null && actualPosition.errorMeters <= 1 && speedError !== null && speedError <= 0.1 && courseError !== null && courseError <= 1,
    }
  })
  return {
    scenario: 'analysis-validation',
    startAnalysis: {
      expectedCrossingDeltaSeconds: ANALYSIS_VALIDATION_TRUTH.crossingTimeSeconds, actualCrossingDeltaSeconds: start.deltaSeconds ?? null,
      deltaErrorSeconds: start.deltaSeconds === undefined ? null : Math.abs(start.deltaSeconds - ANALYSIS_VALIDATION_TRUTH.crossingTimeSeconds),
      expectedCrossingPosition: ANALYSIS_VALIDATION_TRUTH.crossingPosition, actualCrossingPosition: startPosition, positionErrorMeters: startPositionError,
      expectedSpeedKnots: ANALYSIS_VALIDATION_TRUTH.crossingSpeedKnots, actualSpeedKnots: start.crossingSpeedKnots ?? null, speedErrorKnots: startSpeedError,
      expectedCourseDegrees: ANALYSIS_VALIDATION_TRUTH.crossingCourseDegrees, actualCourseDegrees: start.crossingCogDegrees ?? null, courseErrorDegrees: startCourseError,
      actualAccuracyMeters: start.crossingAccuracyMeters ?? null, actualUncertaintySeconds: start.uncertaintySeconds ?? null, actualUncertaintyMeters: start.uncertaintyMeters ?? null, pass: startPass,
    }, replayChecks, pass: startPass && replayChecks.every((check) => check.pass),
  }
}
