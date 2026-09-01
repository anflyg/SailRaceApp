import { describe, expect, it } from 'vitest'
import { ANALYSIS_VALIDATION_RACE, validateAnalysisFixture } from './analysisValidation'
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
})
