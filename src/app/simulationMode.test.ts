import { afterEach, describe, expect, it, vi } from 'vitest'
import { gpsReadingFromPosition } from '../hooks/useLiveGps'
import {
  createSimulationGpsSource,
  getSimulationModeConfig,
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
    )).toEqual({ enabled: true, scenario: 'straight' })
  })

  it('enables the variable-speed scenario only for an allowed build and query', () => {
    expect(getSimulationModeConfig(
      false,
      developmentEnvironment,
      new URLSearchParams('simulation=variable-speed'),
    )).toEqual({ enabled: true, scenario: 'variable-speed' })
  })

  it('ignores the simulation query in a normal production build', () => {
    expect(getSimulationModeConfig(
      false,
      productionEnvironment,
      new URLSearchParams('simulation=straight'),
    )).toEqual({ enabled: false, scenario: null })
  })

  it('ignores the variable-speed query in a normal production build', () => {
    expect(getSimulationModeConfig(
      false,
      productionEnvironment,
      new URLSearchParams('simulation=variable-speed'),
    )).toEqual({ enabled: false, scenario: null })
  })

  it('allows the straight scenario in the explicit simulation build mode', () => {
    expect(getSimulationModeConfig(
      false,
      { DEV: false, MODE: 'simulation' },
      new URLSearchParams('simulation=straight'),
    )).toEqual({ enabled: true, scenario: 'straight' })
  })

  it('stays disabled without a simulation query', () => {
    expect(getSimulationModeConfig(false, developmentEnvironment, new URLSearchParams())).toEqual({
      enabled: false,
      scenario: null,
    })
  })

  it('gives manual mode precedence over simulation mode', () => {
    expect(getSimulationModeConfig(
      true,
      developmentEnvironment,
      new URLSearchParams('simulation=straight'),
    )).toEqual({ enabled: false, scenario: null })
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
})
