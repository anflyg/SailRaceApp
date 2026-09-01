import { buildReplayTimeline, getReplayFrame } from './raceReplay'
import { analyzeRaceStart } from './startAnalysis'
import { createRace, listRaces } from './raceStorage'
import type { Race, RaceSample } from '../types'

export const ANALYSIS_VALIDATION_RACE_NAME = 'Analysis validation fixture'
const FIXTURE_START = Date.parse('2024-06-15T12:00:00.000Z')
const ORIGIN = { latitude: 59.3, longitude: 18 }
const METERS_PER_LATITUDE_DEGREE = 111_320

function fixtureSample(elapsedSeconds: number, latitudeOffsetMeters: number, cogDegrees = 0): RaceSample {
  const timestamp = new Date(FIXTURE_START + elapsedSeconds * 1000).toISOString()

  return {
    timestamp,
    elapsedSeconds,
    latitude: ORIGIN.latitude + latitudeOffsetMeters / METERS_PER_LATITUDE_DEGREE,
    longitude: ORIGIN.longitude + 0.0005,
    accuracy: 2,
    speedKnots: 6,
    nativeSpeedKnots: 6,
    positionSpeedKnots: 6,
    fusedSpeedKnots: 6,
    nativeCourseDegrees: cogDegrees,
    positionCourseDegrees: cogDegrees,
    fusedCourseDegrees: cogDegrees,
    cogDegrees,
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
  samples: [
    fixtureSample(-1, -6),
    fixtureSample(2, -3),
    fixtureSample(3, 3),
    fixtureSample(6, 21, 45),
    fixtureSample(8, 33, 45),
  ],
  events: [],
}

export function ensureAnalysisValidationRace(): Race {
  const existingRace = listRaces().find((race) => race.name === ANALYSIS_VALIDATION_RACE_NAME)

  return existingRace ?? createRace({
    date: ANALYSIS_VALIDATION_RACE.createdAt,
    ...ANALYSIS_VALIDATION_RACE,
  })
}

export type AnalysisValidationReport = {
  fixture: { name: string; sampleCount: number; crossingSeconds: number; crossingPosition: typeof ORIGIN }
  startAnalysis: { status: string; expectedDeltaSeconds: number; actualDeltaSeconds: number | null; deltaErrorSeconds: number | null }
  replay: Array<{ seconds: number; mode: string | null; expectedCourseDegrees: number; actualCourseDegrees: number | null; courseErrorDegrees: number | null }>
}

export function validateAnalysisFixture(): AnalysisValidationReport {
  const race = ANALYSIS_VALIDATION_RACE as Race
  const start = analyzeRaceStart(race)
  const timeline = buildReplayTimeline(race)
  const replayCheckpoints = [0, 2.5, 6, 8]
  const replay = replayCheckpoints.map((seconds) => {
    const frame = getReplayFrame(timeline, seconds)
    const expectedCourseDegrees = seconds >= 6 ? 45 : 0
    const actualCourseDegrees = frame?.sample.cogDegrees ?? null

    return {
      seconds,
      mode: frame?.interpolationMode ?? null,
      expectedCourseDegrees,
      actualCourseDegrees,
      courseErrorDegrees: actualCourseDegrees === null ? null : Math.abs(actualCourseDegrees - expectedCourseDegrees),
    }
  })

  return {
    fixture: {
      name: race.name,
      sampleCount: race.samples.length,
      crossingSeconds: 2.5,
      crossingPosition: { ...ORIGIN },
    },
    startAnalysis: {
      status: start.status,
      expectedDeltaSeconds: 2.5,
      actualDeltaSeconds: start.deltaSeconds ?? null,
      deltaErrorSeconds: start.deltaSeconds === undefined ? null : Math.abs(start.deltaSeconds - 2.5),
    },
    replay,
  }
}
