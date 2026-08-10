import { describe, expect, it } from 'vitest'
import { NORTHBOUND_SIX_KNOTS_SCENARIO } from './sailingSimulator.fixtures'
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
})
