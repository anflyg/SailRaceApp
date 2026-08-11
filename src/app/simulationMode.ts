import {
  NORTHBOUND_SIX_KNOTS_SCENARIO,
  NORTHBOUND_VARIABLE_COURSE_SCENARIO,
  NORTHBOUND_VARIABLE_SPEED_SCENARIO,
  COURSE_NOISE_SCENARIO,
  TACK_COURSE_SCENARIO,
  WIND_VMG_SCENARIO,
  LAYLINE_CANDIDATE_SCENARIO,
} from '../simulation/sailingSimulator.fixtures'
import { createSailingSimulator } from '../simulation/sailingSimulator'
import { createSimulatedGpsSource, type SimulatedGpsSource } from '../simulation/simulatedGpsSource'
import { localPositionToGeoPoint } from '../simulation/localCoordinates'
import type { CoursePointState, CourseState, LaylineSettings } from '../types'

const SIMULATION_QUERY_KEY = 'simulation'

export const SIMULATION_TICK_MS = 1_000
const SIMULATION_RATES = [1, 10, 20] as const

export type SimulationScenario = 'straight' | 'variable-speed' | 'variable-course' | 'tack-course' | 'course-noise' | 'wind-vmg' | 'layline-candidate' | 'layline-warning' | 'layline-reactive-tack'
export type SimulationRate = (typeof SIMULATION_RATES)[number]

export interface SimulationModeConfig {
  enabled: boolean
  scenario: SimulationScenario | null
  simulationRate: SimulationRate
  tickIntervalMs: number
}

interface SimulationEnvironment {
  DEV: boolean
  MODE: string
}

export function getSimulationModeConfig(
  manualModeEnabled: boolean,
  environment: SimulationEnvironment = import.meta.env,
  search: URLSearchParams | null = getSearchParams(),
): SimulationModeConfig {
  const requestedScenario = search?.get(SIMULATION_QUERY_KEY)
  const scenario: SimulationScenario | null =
    requestedScenario === 'straight' || requestedScenario === 'variable-speed' || requestedScenario === 'variable-course' || requestedScenario === 'tack-course' || requestedScenario === 'course-noise' || requestedScenario === 'wind-vmg' || requestedScenario === 'layline-candidate' || requestedScenario === 'layline-warning' || requestedScenario === 'layline-reactive-tack'
      ? requestedScenario
      : null
  const simulationBuildAllowed = environment.DEV || environment.MODE === 'simulation'

  if (manualModeEnabled || !simulationBuildAllowed || scenario === null) {
    return { enabled: false, scenario: null, simulationRate: 1, tickIntervalMs: SIMULATION_TICK_MS }
  }

  const simulationRate = getSimulationRate(search?.get('simulationRate') ?? null)

  return {
    enabled: true,
    scenario,
    simulationRate,
    tickIntervalMs: getSimulationTickIntervalMs(simulationRate),
  }
}

export function createSimulationGpsSource(scenario: SimulationScenario): SimulatedGpsSource {
  switch (scenario) {
    case 'straight':
      return createSimulatedGpsSource(createSailingSimulator(NORTHBOUND_SIX_KNOTS_SCENARIO))
    case 'variable-speed':
      return createSimulatedGpsSource(createSailingSimulator(NORTHBOUND_VARIABLE_SPEED_SCENARIO))
    case 'variable-course':
      return createSimulatedGpsSource(createSailingSimulator(NORTHBOUND_VARIABLE_COURSE_SCENARIO))
    case 'tack-course':
      return createSimulatedGpsSource(createSailingSimulator(TACK_COURSE_SCENARIO))
    case 'course-noise':
      return createSimulatedGpsSource(createSailingSimulator(COURSE_NOISE_SCENARIO))
    case 'wind-vmg':
      return createSimulatedGpsSource(createSailingSimulator(WIND_VMG_SCENARIO))
    case 'layline-candidate':
      return createSimulatedGpsSource(createSailingSimulator(LAYLINE_CANDIDATE_SCENARIO))
    case 'layline-warning':
      return createSimulatedGpsSource(createSailingSimulator(LAYLINE_CANDIDATE_SCENARIO))
    case 'layline-reactive-tack':
      return createSimulatedGpsSource(createSailingSimulator(LAYLINE_CANDIDATE_SCENARIO))
  }
}

function createEmptyCoursePoints(): CoursePointState {
  return { startA: null, startB: null, kryss1: null, lans1: null }
}

export function getSimulationCourseState(scenario: SimulationScenario | null): CourseState | null {
  if (scenario === 'wind-vmg') {
    return { points: createEmptyCoursePoints(), windHeadingDegrees: 0 }
  }

  if (scenario === 'layline-candidate' || scenario === 'layline-warning' || scenario === 'layline-reactive-tack') {
    const origin = LAYLINE_CANDIDATE_SCENARIO.origin
    const kryss1 = localPositionToGeoPoint(origin, { xMeters: 0, yMeters: scenario === 'layline-candidate' ? 90 : 89.6 })
    const lans1 = localPositionToGeoPoint(origin, { xMeters: 0, yMeters: -110 })

    return {
      points: {
        startA: null,
        startB: null,
        kryss1: { ...kryss1, quality: 'good' },
        lans1: { ...lans1, quality: 'good' },
      },
      windHeadingDegrees: null,
    }
  }

  return null
}

export function getSimulationLaylineSettings(scenario: SimulationScenario | null): LaylineSettings | null {
  return scenario === 'layline-candidate' || scenario === 'layline-warning' || scenario === 'layline-reactive-tack'
    ? { enabled: true, alphaDegrees: 90 }
    : null
}

export function getSimulationRate(value: string | null): SimulationRate {
  const parsedRate = Number(value)

  return SIMULATION_RATES.includes(parsedRate as SimulationRate) ? parsedRate as SimulationRate : 1
}

export function getSimulationTickIntervalMs(simulationRate: SimulationRate): number {
  return SIMULATION_TICK_MS / simulationRate
}

export function startSimulationTicker(
  source: Pick<SimulatedGpsSource, 'advance'>,
  tickIntervalMs = SIMULATION_TICK_MS,
): () => void {
  const intervalId = globalThis.setInterval(() => {
    source.advance()
  }, tickIntervalMs)

  return () => globalThis.clearInterval(intervalId)
}

function getSearchParams(): URLSearchParams | null {
  if (typeof window === 'undefined') {
    return null
  }

  return new URLSearchParams(window.location.search)
}
