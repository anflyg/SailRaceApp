import { describe, expect, it } from 'vitest'
import { TACK_COURSE_SCENARIO } from './sailingSimulator.fixtures'
import { createSailingSimulator } from './sailingSimulator'
import { createSimulationValidator } from './simulationValidator'
import { analyzeTackCourseChecks } from './tackCourseAnalysis'

describe('tack course analysis', () => {
  it('finds pre-tack and recovery measurements using circular course errors', () => {
    const simulator = createSailingSimulator(TACK_COURSE_SCENARIO)
    const validator = createSimulationValidator({ scenario: 'tack-course' })

    for (let second = 0; second <= 60; second += 1) {
      const sample = second === 0 ? simulator.currentSample() : simulator.step()
      validator.observe(sample, {
        speedKnots: sample.groundTruthSpeedKnots,
        displayCourseDegrees: sample.courseDegrees,
        timestamp: sample.timestamp,
        presentationTimestamp: sample.timestamp,
      })
    }

    const report = validator.getReport()
    const analysis = analyzeTackCourseChecks(report.checks)

    expect(report.plannedChecks).toBe(19)
    expect(analysis.preTackCourseErrorDegrees).toBeCloseTo(0, 10)
    expect(analysis.firstWithin5DegreesSeconds).toBe(21)
    expect(analysis.firstWithin2DegreesSeconds).toBe(21)
    expect(analysis.finalCourseErrorDegrees).toBeCloseTo(0, 10)
    expect(analysis.hasLongWayCourseError).toBe(false)
    expect(analysis.measurementPassed).toBe(true)
  })
})
