import { describe, expect, it } from 'vitest'
import { COURSE_NOISE_SCENARIO } from './sailingSimulator.fixtures'
import { createSailingSimulator } from './sailingSimulator'
import { createSimulationValidator } from './simulationValidator'
import { analyzeCourseNoiseChecks } from './courseNoiseAnalysis'

describe('course noise analysis', () => {
  it('measures raw GPS and app course errors and circular step jitter', () => {
    const simulator = createSailingSimulator(COURSE_NOISE_SCENARIO)
    const validator = createSimulationValidator({ scenario: 'course-noise' })

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
    const analysis = analyzeCourseNoiseChecks(report.checks)

    expect(report.plannedChecks).toBe(19)
    expect(analysis.rawGpsMeanAbsoluteCourseErrorDegrees).not.toBeNull()
    expect(analysis.rawGpsMaxCourseErrorDegrees).toBeLessThanOrEqual(5)
    expect(analysis.appMeanAbsoluteCourseErrorDegrees).toBe(analysis.rawGpsMeanAbsoluteCourseErrorDegrees)
    expect(analysis.rawGpsMeanStepChangeDegrees).not.toBeNull()
    expect(analysis.appMaxStepChangeDegrees).toBe(analysis.rawGpsMaxStepChangeDegrees)
    expect(analysis.noisyGpsCheckCount).toBeGreaterThanOrEqual(3)
    expect(analysis.finalCourseErrorDegrees).toBeLessThanOrEqual(2)
    expect(analysis.measurementPassed).toBe(true)
    expect(analysis.regressionPassed).toBe(false)
  })
})
