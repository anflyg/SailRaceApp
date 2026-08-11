import { describe, expect, it } from 'vitest'
import {
  NORTHBOUND_SIX_KNOTS_SCENARIO,
  NORTHBOUND_VARIABLE_COURSE_SCENARIO,
  NORTHBOUND_VARIABLE_SPEED_SCENARIO,
  TACK_COURSE_SCENARIO,
} from './sailingSimulator.fixtures'
import { createSailingSimulator } from './sailingSimulator'

const KNOTS_PER_METER_PER_SECOND = 1.943844

describe('SailingSimulator', () => {
  it('moves the northbound fixture for 60 deterministic one-second steps', () => {
    const simulator = createSailingSimulator(NORTHBOUND_SIX_KNOTS_SCENARIO)
    let sample = simulator.currentSample()

    for (let second = 0; second < 60; second += 1) {
      sample = simulator.step()
    }

    const expectedDistanceMeters = (6 / KNOTS_PER_METER_PER_SECOND) * 60

    expect(sample.elapsedTimeSeconds).toBe(60)
    expect(sample.localXmeters).toBeCloseTo(0, 10)
    expect(sample.localYmeters).toBeCloseTo(expectedDistanceMeters, 10)
    expect(sample.latitude).toBeGreaterThan(NORTHBOUND_SIX_KNOTS_SCENARIO.origin.latitude)
    expect(sample.longitude).toBeCloseTo(NORTHBOUND_SIX_KNOTS_SCENARIO.origin.longitude, 10)
    expect(sample.groundTruthSpeedKnots).toBeCloseTo(6, 10)
    expect(sample.groundTruthCourseDegrees).toBeCloseTo(0, 10)
    expect(sample.speedMetersPerSecond).toBeCloseTo(6 / KNOTS_PER_METER_PER_SECOND, 10)
    expect(sample.accuracyMeters).toBe(3)
  })

  it.each([
    [0, 0, 1],
    [90, 1, 0],
    [180, 0, -1],
    [270, -1, 0],
    [45, Math.SQRT1_2, Math.SQRT1_2],
  ])('uses heading %i° as the expected local east/north vector', (courseDegrees, expectedX, expectedY) => {
    const simulator = createSailingSimulator({
      ...NORTHBOUND_SIX_KNOTS_SCENARIO,
      courseDegrees,
      targetSpeedKnots: KNOTS_PER_METER_PER_SECOND,
    })

    const sample = simulator.step()

    expect(sample.localXmeters).toBeCloseTo(expectedX, 10)
    expect(sample.localYmeters).toBeCloseTo(expectedY, 10)
  })

  it('derives ground-truth speed from the actual local movement', () => {
    const simulator = createSailingSimulator({
      ...NORTHBOUND_SIX_KNOTS_SCENARIO,
      targetSpeedKnots: 6,
      timeStepSeconds: 2,
    })
    const initialSample = simulator.currentSample()
    const movedSample = simulator.step()
    const movedDistanceMeters = Math.hypot(
      movedSample.localXmeters - initialSample.localXmeters,
      movedSample.localYmeters - initialSample.localYmeters,
    )
    const independentlyCalculatedKnots =
      (movedDistanceMeters / 2) * KNOTS_PER_METER_PER_SECOND

    expect(movedDistanceMeters).toBeCloseTo((6 / KNOTS_PER_METER_PER_SECOND) * 2, 10)
    expect(movedSample.groundTruthSpeedKnots).toBeCloseTo(independentlyCalculatedKnots, 10)
    expect(movedSample.groundTruthSpeedKnots).toBeCloseTo(6, 10)
  })

  it('keeps the straight scenario unchanged when no speed profile is configured', () => {
    const simulator = createSailingSimulator(NORTHBOUND_SIX_KNOTS_SCENARIO)

    for (let second = 0; second < 60; second += 1) {
      simulator.step()
    }

    expect(simulator.currentSample()).toMatchObject({ elapsedTimeSeconds: 60, targetSpeedKnots: 6, courseDegrees: 0 })
    expect(simulator.currentSample().groundTruthSpeedKnots).toBeCloseTo(6, 10)
    expect(simulator.currentSample().groundTruthCourseDegrees).toBeCloseTo(0, 10)
  })

  it('linearly interpolates the variable speed profile at control points and midpoints', () => {
    const simulator = createSailingSimulator(NORTHBOUND_VARIABLE_SPEED_SCENARIO)
    const samples = new Map<number, ReturnType<typeof simulator.currentSample>>([
      [0, simulator.currentSample()],
    ])

    for (let second = 1; second <= 120; second += 1) {
      const sample = simulator.step()
      samples.set(second, sample)
    }

    expect(samples.get(0)?.targetSpeedKnots).toBeCloseTo(4, 10)
    expect(samples.get(15)?.targetSpeedKnots).toBeCloseTo(4.5, 10)
    expect(samples.get(30)?.targetSpeedKnots).toBeCloseTo(5, 10)
    expect(samples.get(45)?.targetSpeedKnots).toBeCloseTo(5.5, 10)
    expect(samples.get(60)?.targetSpeedKnots).toBeCloseTo(6, 10)
    expect(samples.get(75)?.targetSpeedKnots).toBeCloseTo(5.5, 10)
    expect(samples.get(90)?.targetSpeedKnots).toBeCloseTo(5, 10)
    expect(samples.get(105)?.targetSpeedKnots).toBeCloseTo(4.5, 10)
    expect(samples.get(120)?.targetSpeedKnots).toBeCloseTo(4, 10)
  })

  it('moves according to each variable target speed and derives ground truth from displacement', () => {
    const simulator = createSailingSimulator(NORTHBOUND_VARIABLE_SPEED_SCENARIO)
    const initialSample = simulator.currentSample()

    for (let second = 1; second <= 15; second += 1) {
      const previousSample = simulator.currentSample()
      const sample = simulator.step()
      const movedDistanceMeters = Math.hypot(
        sample.localXmeters - previousSample.localXmeters,
        sample.localYmeters - previousSample.localYmeters,
      )
      const independentlyCalculatedKnots = movedDistanceMeters * KNOTS_PER_METER_PER_SECOND

      expect(movedDistanceMeters).toBeCloseTo(sample.targetSpeedKnots / KNOTS_PER_METER_PER_SECOND, 10)
      expect(sample.groundTruthSpeedKnots).toBeCloseTo(independentlyCalculatedKnots, 10)
      expect(sample.courseDegrees).toBe(0)
    }

    expect(simulator.currentSample().localYmeters).toBeGreaterThan(initialSample.localYmeters)
  })

  it.each([
    [350, 10],
    [10, 350],
  ])('interpolates course profiles across the 0/360 boundary in the shortest direction', (start, end) => {
    const simulator = createSailingSimulator({
      ...NORTHBOUND_SIX_KNOTS_SCENARIO,
      courseProfile: [
        { elapsedTimeSeconds: 0, courseDegrees: start },
        { elapsedTimeSeconds: 10, courseDegrees: end },
      ],
    })

    for (let second = 0; second < 5; second += 1) {
      simulator.step()
    }

    const targetCourse = simulator.currentSample().targetCourseDegrees
    expect(targetCourse).toBeCloseTo(0, 10)
    expect(simulator.currentSample().groundTruthCourseDegrees).toBeCloseTo(targetCourse, 10)
  })

  it('derives ground-truth course independently from local displacement', () => {
    const simulator = createSailingSimulator({
      ...NORTHBOUND_SIX_KNOTS_SCENARIO,
      courseDegrees: 90,
    })
    const initialSample = simulator.currentSample()
    const movedSample = simulator.step()
    const deltaX = movedSample.localXmeters - initialSample.localXmeters
    const deltaY = movedSample.localYmeters - initialSample.localYmeters
    const expectedBearing = (Math.atan2(deltaX, deltaY) * 180) / Math.PI

    expect(movedSample.targetCourseDegrees).toBe(90)
    expect(movedSample.groundTruthCourseDegrees).toBeCloseTo(expectedBearing, 10)
    expect(movedSample.groundTruthCourseDegrees).toBeCloseTo(90, 10)
    expect(movedSample.courseDegrees).toBeCloseTo(movedSample.groundTruthCourseDegrees!, 10)
  })

  it('runs the variable-course fixture at constant speed with derived course truth', () => {
    const simulator = createSailingSimulator(NORTHBOUND_VARIABLE_COURSE_SCENARIO)

    for (let second = 0; second < 120; second += 1) {
      simulator.step()
    }

    const sample = simulator.currentSample()
    expect(sample.targetSpeedKnots).toBe(6)
    expect(sample.groundTruthSpeedKnots).toBeCloseTo(6, 10)
    expect(sample.targetCourseDegrees).toBe(350)
    expect(sample.groundTruthCourseDegrees).toBeCloseTo(350, 10)
  })

  it('runs the tack profile through 0° at constant speed instead of the long way around', () => {
    const simulator = createSailingSimulator(TACK_COURSE_SCENARIO)
    const samples = new Map([[0, simulator.currentSample()]])

    for (let second = 1; second <= 60; second += 1) {
      samples.set(second, simulator.step())
    }

    expect(samples.get(12)?.targetCourseDegrees).toBeCloseTo(315, 10)
    expect(samples.get(15)?.targetCourseDegrees).toBeCloseTo(315, 10)
    expect(samples.get(18)?.targetCourseDegrees).toBeCloseTo(0, 10)
    expect(samples.get(21)?.targetCourseDegrees).toBeCloseTo(45, 10)
    expect(samples.get(60)?.targetCourseDegrees).toBeCloseTo(45, 10)
    expect(samples.get(18)?.groundTruthCourseDegrees).toBeCloseTo(0, 10)
    expect(samples.get(18)?.groundTruthSpeedKnots).toBeCloseTo(6, 10)
    expect(samples.get(18)?.courseDegrees).toBeCloseTo(samples.get(18)?.groundTruthCourseDegrees!, 10)
  })
})
