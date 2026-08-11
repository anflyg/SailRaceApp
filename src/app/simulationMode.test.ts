import { afterEach, describe, expect, it, vi } from 'vitest'
import { gpsReadingFromPosition } from '../hooks/useLiveGps'
import {
  createSimulationGpsSource,
  getSimulationRate,
  getSimulationModeConfig,
  getSimulationCourseState,
  getSimulationLaylineSettings,
  getSimulationTickIntervalMs,
  SIMULATION_TICK_MS,
  startSimulationTicker,
} from './simulationMode'

const developmentEnvironment = { DEV: true, MODE: 'development' }
const productionEnvironment = { DEV: false, MODE: 'production' }

afterEach(() => {
  vi.useRealTimers()
})

describe('simulation mode', () => {
  it('enables the straight scenario only for an allowed build and query', () => {
    expect(getSimulationModeConfig(
      false,
      developmentEnvironment,
      new URLSearchParams('simulation=straight'),
    )).toEqual({ enabled: true, scenario: 'straight', simulationRate: 1, tickIntervalMs: 1_000 })
  })

  it('enables the variable-speed scenario only for an allowed build and query', () => {
    expect(getSimulationModeConfig(
      false,
      developmentEnvironment,
      new URLSearchParams('simulation=variable-speed'),
    )).toEqual({ enabled: true, scenario: 'variable-speed', simulationRate: 1, tickIntervalMs: 1_000 })
  })

  it('enables the variable-course scenario only for an allowed build and query', () => {
    expect(getSimulationModeConfig(
      false,
      developmentEnvironment,
      new URLSearchParams('simulation=variable-course&simulationRate=10'),
    )).toEqual({ enabled: true, scenario: 'variable-course', simulationRate: 10, tickIntervalMs: 100 })
  })

  it('enables the tack-course scenario only for an allowed build and query', () => {
    expect(getSimulationModeConfig(
      false,
      developmentEnvironment,
      new URLSearchParams('simulation=tack-course'),
    )).toEqual({ enabled: true, scenario: 'tack-course', simulationRate: 1, tickIntervalMs: 1_000 })
  })

  it('enables the course-noise scenario only for an allowed build and query', () => {
    expect(getSimulationModeConfig(
      false,
      developmentEnvironment,
      new URLSearchParams('simulation=course-noise'),
    )).toEqual({ enabled: true, scenario: 'course-noise', simulationRate: 1, tickIntervalMs: 1_000 })
  })

  it('enables the wind-vmg scenario only for an allowed build and query', () => {
    expect(getSimulationModeConfig(
      false,
      developmentEnvironment,
      new URLSearchParams('simulation=wind-vmg'),
    )).toEqual({ enabled: true, scenario: 'wind-vmg', simulationRate: 1, tickIntervalMs: 1_000 })
  })

  it('enables the layline-candidate scenario only for an allowed build and query', () => {
    expect(getSimulationModeConfig(
      false,
      developmentEnvironment,
      new URLSearchParams('simulation=layline-candidate'),
    )).toEqual({ enabled: true, scenario: 'layline-candidate', simulationRate: 1, tickIntervalMs: 1_000 })
  })

  it('enables layline-warning only in an allowed simulation build', () => {
    expect(getSimulationModeConfig(false, developmentEnvironment, new URLSearchParams('simulation=layline-warning')))
      .toEqual({ enabled: true, scenario: 'layline-warning', simulationRate: 1, tickIntervalMs: 1_000 })
    expect(getSimulationModeConfig(false, productionEnvironment, new URLSearchParams('simulation=layline-warning')))
      .toEqual({ enabled: false, scenario: null, simulationRate: 1, tickIntervalMs: 1_000 })
  })

  it('ignores the simulation query in a normal production build', () => {
    expect(getSimulationModeConfig(
      false,
      productionEnvironment,
      new URLSearchParams('simulation=straight'),
    )).toEqual({ enabled: false, scenario: null, simulationRate: 1, tickIntervalMs: 1_000 })
  })

  it('ignores the variable-speed query in a normal production build', () => {
    expect(getSimulationModeConfig(
      false,
      productionEnvironment,
      new URLSearchParams('simulation=variable-speed'),
    )).toEqual({ enabled: false, scenario: null, simulationRate: 1, tickIntervalMs: 1_000 })
  })

  it('ignores the variable-course query in a normal production build', () => {
    expect(getSimulationModeConfig(
      false,
      productionEnvironment,
      new URLSearchParams('simulation=variable-course'),
    )).toEqual({ enabled: false, scenario: null, simulationRate: 1, tickIntervalMs: 1_000 })
  })

  it('ignores the tack-course query in a normal production build', () => {
    expect(getSimulationModeConfig(
      false,
      productionEnvironment,
      new URLSearchParams('simulation=tack-course'),
    )).toEqual({ enabled: false, scenario: null, simulationRate: 1, tickIntervalMs: 1_000 })
  })

  it('ignores the course-noise query in a normal production build', () => {
    expect(getSimulationModeConfig(
      false,
      productionEnvironment,
      new URLSearchParams('simulation=course-noise'),
    )).toEqual({ enabled: false, scenario: null, simulationRate: 1, tickIntervalMs: 1_000 })
  })

  it('ignores the wind-vmg query in a normal production build', () => {
    expect(getSimulationModeConfig(
      false,
      productionEnvironment,
      new URLSearchParams('simulation=wind-vmg'),
    )).toEqual({ enabled: false, scenario: null, simulationRate: 1, tickIntervalMs: 1_000 })
  })

  it('ignores the layline-candidate query in a normal production build', () => {
    expect(getSimulationModeConfig(
      false,
      productionEnvironment,
      new URLSearchParams('simulation=layline-candidate'),
    )).toEqual({ enabled: false, scenario: null, simulationRate: 1, tickIntervalMs: 1_000 })
  })

  it('allows the straight scenario in the explicit simulation build mode', () => {
    expect(getSimulationModeConfig(
      false,
      { DEV: false, MODE: 'simulation' },
      new URLSearchParams('simulation=straight'),
    )).toEqual({ enabled: true, scenario: 'straight', simulationRate: 1, tickIntervalMs: 1_000 })
  })

  it('stays disabled without a simulation query', () => {
    expect(getSimulationModeConfig(false, developmentEnvironment, new URLSearchParams())).toEqual({
      enabled: false,
      scenario: null,
      simulationRate: 1,
      tickIntervalMs: 1_000,
    })
  })

  it('gives manual mode precedence over simulation mode', () => {
    expect(getSimulationModeConfig(
      true,
      developmentEnvironment,
      new URLSearchParams('simulation=straight'),
    )).toEqual({ enabled: false, scenario: null, simulationRate: 1, tickIntervalMs: 1_000 })
  })

  it.each([
    [null, 1, 1_000],
    ['1', 1, 1_000],
    ['10', 10, 100],
    ['20', 20, 50],
    ['2', 1, 1_000],
  ] as const)('uses rate %s as %ix / %ims', (rate, expectedRate, expectedIntervalMs) => {
    expect(getSimulationRate(rate)).toBe(expectedRate)
    expect(getSimulationTickIntervalMs(getSimulationRate(rate))).toBe(expectedIntervalMs)
  })

  it('uses the requested rate only when simulation mode is enabled', () => {
    expect(getSimulationModeConfig(
      false,
      developmentEnvironment,
      new URLSearchParams('simulation=straight&simulationRate=10'),
    )).toEqual({ enabled: true, scenario: 'straight', simulationRate: 10, tickIntervalMs: 100 })
    expect(getSimulationModeConfig(
      false,
      productionEnvironment,
      new URLSearchParams('simulation=straight&simulationRate=10'),
    )).toEqual({ enabled: false, scenario: null, simulationRate: 1, tickIntervalMs: 1_000 })
  })

  it('feeds simulated GPS through the GpsSource to useLiveGps mapping', async () => {
    const source = createSimulationGpsSource('straight')
    const callback = vi.fn()
    await source.watchPosition({
      enableHighAccuracy: true,
      timeout: 10_000,
      maximumAge: 1_000,
      minimumUpdateInterval: 1_000,
      interval: 1_000,
    }, callback)

    source.advance()
    const position = callback.mock.calls[0]?.[0]

    expect(gpsReadingFromPosition(position, 'watching')).toMatchObject({
      status: 'watching',
      speedKnots: 6,
      courseDegrees: 0,
      courseReliable: true,
    })
  })

  it('creates the variable-speed GPS source with a stable northbound course', async () => {
    const source = createSimulationGpsSource('variable-speed')
    const callback = vi.fn()
    await source.watchPosition({
      enableHighAccuracy: true,
      timeout: 10_000,
      maximumAge: 1_000,
      minimumUpdateInterval: 1_000,
      interval: 1_000,
    }, callback)

    for (let second = 0; second < 30; second += 1) {
      source.advance()
    }

    expect(source.currentSample()).toMatchObject({
      elapsedTimeSeconds: 30,
      targetSpeedKnots: 5,
      courseDegrees: 0,
      accuracyMeters: 3,
    })
    expect(source.currentSample().groundTruthSpeedKnots).toBeCloseTo(5, 10)
  })

  it('creates the wind-vmg GPS source with a stable 6 kn 315° physical course', () => {
    const source = createSimulationGpsSource('wind-vmg')

    for (let second = 0; second < 6; second += 1) {
      source.advance()
    }

    expect(source.currentSample()).toMatchObject({
      elapsedTimeSeconds: 6,
      targetSpeedKnots: 6,
      targetCourseDegrees: 315,
      accuracyMeters: 3,
    })
    expect(source.currentSample().groundTruthSpeedKnots).toBeCloseTo(6, 10)
    expect(source.currentSample().groundTruthCourseDegrees).toBeCloseTo(315, 10)
  })

  it('sets scenario-specific simulation course and layline state without affecting other scenarios', () => {
    expect(getSimulationCourseState('wind-vmg')?.windHeadingDegrees).toBe(0)
    expect(getSimulationCourseState('layline-candidate')).toMatchObject({
      windHeadingDegrees: null,
      points: { startA: null, startB: null, kryss1: { quality: 'good' }, lans1: { quality: 'good' } },
    })
    expect(getSimulationLaylineSettings('layline-candidate')).toEqual({ enabled: true, alphaDegrees: 90 })
    expect(getSimulationCourseState('straight')).toBeNull()
  })

  it('keeps layline-candidate at K1 y=90 and configures layline-warning at K1 y=89.6', () => {
    const candidate = getSimulationCourseState('layline-candidate')
    const warning = getSimulationCourseState('layline-warning')

    expect(candidate?.points.kryss1?.latitude).toBeCloseTo(59.3293 + 90 / 111_320, 10)
    expect(warning?.points.kryss1?.latitude).toBeCloseTo(59.3293 + 89.6 / 111_320, 10)
    expect(warning?.points.lans1?.latitude).toBeCloseTo(59.3293 - 110 / 111_320, 10)
    expect(warning?.windHeadingDegrees).toBeNull()
    expect(getSimulationLaylineSettings('layline-warning')).toEqual({ enabled: true, alphaDegrees: 90 })
  })

  it('creates the layline candidate source at the prescribed local position and heading', () => {
    const source = createSimulationGpsSource('layline-candidate')

    expect(source.currentSample()).toMatchObject({
      localXmeters: 20,
      localYmeters: 0,
      targetSpeedKnots: 6,
      targetCourseDegrees: 315,
      accuracyMeters: 3,
    })
  })

  it('advances once per second and stops after cleanup', () => {
    vi.useFakeTimers()
    const source = { advance: vi.fn() }
    const cleanup = startSimulationTicker(source)

    vi.advanceTimersByTime(SIMULATION_TICK_MS * 3)
    expect(source.advance).toHaveBeenCalledTimes(3)

    cleanup()
    vi.advanceTimersByTime(SIMULATION_TICK_MS * 2)
    expect(source.advance).toHaveBeenCalledTimes(3)
  })

  it('accelerates only the wall-clock ticker interval, not simulator advances', () => {
    vi.useFakeTimers()
    const source = createSimulationGpsSource('straight')
    const cleanup = startSimulationTicker(source, getSimulationTickIntervalMs(10))

    vi.advanceTimersByTime(100)
    expect(source.currentSample().elapsedTimeSeconds).toBe(1)

    cleanup()
  })
})
