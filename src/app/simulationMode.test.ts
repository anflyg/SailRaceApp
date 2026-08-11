import { afterEach, describe, expect, it, vi } from 'vitest'
import { gpsReadingFromPosition } from '../hooks/useLiveGps'
import {
  createSimulationGpsSource,
  getSimulationRate,
  getSimulationModeConfig,
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
