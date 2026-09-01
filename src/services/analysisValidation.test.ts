import { describe, expect, it } from 'vitest'
import { ANALYSIS_VALIDATION_RACE, ANALYSIS_VALIDATION_TRUTH, getFixtureTrajectoryPosition, validateAnalysisFixture } from './analysisValidation'
import { analyzeRaceStart } from './startAnalysis'
import { buildReplayTimeline, getReplayFrame } from './raceReplay'
import type { Race } from '../types'

describe('analysis validation fixture', () => {
  it('crosses the known start line at the independent ground truth', () => {
    const result = analyzeRaceStart(ANALYSIS_VALIDATION_RACE as Race)

    expect(result.status).toBe('ok')
    expect(result.deltaSeconds).toBe(2.5)
    expect(result.crossingSpeedKnots).toBeCloseTo(6, 5)
    expect(result.crossingCogDegrees).toBeCloseTo(0, 5)
    expect(result.crossingPoint?.latitude).toBeCloseTo(59.3, 7)
    expect(result.crossingPoint?.longitude).toBeCloseTo(18.0005, 7)
  })

  it('replays exact and interpolated checkpoints, including the later course change', () => {
    const timeline = buildReplayTimeline(ANALYSIS_VALIDATION_RACE as Race)
    const atTwo = getReplayFrame(timeline, 2)
    const atTwoPointFive = getReplayFrame(timeline, 2.5)
    const atSix = getReplayFrame(timeline, 6)

    expect(atTwo?.interpolationMode).toBe('exact')
    expect(atTwoPointFive?.interpolationMode).toBe('interpolated')
    expect(atTwoPointFive?.sample.latitude).toBeCloseTo(59.3, 7)
    expect(atTwoPointFive?.sample.cogDegrees).toBe(0)
    expect(atSix?.sample.cogDegrees).toBe(45)
  })

  it('produces a machine-readable validation report', () => {
    const report = validateAnalysisFixture()

    expect(report.startAnalysis.deltaErrorSeconds).toBe(0)
    expect(report.replayChecks.every((checkpoint) => checkpoint.course.error === 0)).toBe(true)
    expect(report.pass).toBe(true)
  })

  it('keeps the independent physical trajectory continuous at the turn', () => {
    const beforeTurn = getFixtureTrajectoryPosition(5.999)
    const atTurn = getFixtureTrajectoryPosition(6)
    const afterTurn = getFixtureTrajectoryPosition(6.001)
    const expectedTurn = ANALYSIS_VALIDATION_TRUTH.replay.find((checkpoint) => checkpoint.timeSeconds === 6)?.position

    expect(atTurn.latitude).toBeCloseTo(expectedTurn?.latitude ?? 0, 10)
    expect(atTurn.longitude).toBeCloseTo(expectedTurn?.longitude ?? 0, 10)
    expect(distanceMeters(beforeTurn, atTurn)).toBeCloseTo(6 / 1.943844 * 0.001, 4)
    expect(distanceMeters(atTurn, afterTurn)).toBeCloseTo(6 / 1.943844 * 0.001, 4)
  })

  it('has independent 6-knot displacement and bearing on both trajectory legs', () => {
    const samples = ANALYSIS_VALIDATION_RACE.samples
    const before = displacementMetrics(samples[1], samples[2])
    const after = displacementMetrics(samples[3], samples[4])

    expect(before.speedKnots).toBeCloseTo(6, 3)
    expect(before.bearingDegrees).toBeCloseTo(0, 3)
    expect(after.speedKnots).toBeCloseTo(6, 3)
    expect(after.bearingDegrees).toBeCloseTo(45, 3)
  })
})

function distanceMeters(first: { latitude: number; longitude: number }, second: { latitude: number; longitude: number }): number {
  const latitudeMeters = (second.latitude - first.latitude) * 111_320
  const longitudeMeters = (second.longitude - first.longitude) * 111_320 * Math.cos(59.3 * Math.PI / 180)
  return Math.sqrt(latitudeMeters ** 2 + longitudeMeters ** 2)
}

function displacementMetrics(first: typeof ANALYSIS_VALIDATION_RACE.samples[number], second: typeof first) {
  const seconds = (Date.parse(second.timestamp) - Date.parse(first.timestamp)) / 1000
  const northMeters = (second.latitude - first.latitude) * 111_320
  const eastMeters = (second.longitude - first.longitude) * 111_320 * Math.cos(59.3 * Math.PI / 180)
  return {
    speedKnots: Math.sqrt(northMeters ** 2 + eastMeters ** 2) / seconds * 1.943844,
    bearingDegrees: (Math.atan2(eastMeters, northMeters) * 180 / Math.PI + 360) % 360,
  }
}
