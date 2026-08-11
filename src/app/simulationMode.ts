import {
  NORTHBOUND_SIX_KNOTS_SCENARIO,
  NORTHBOUND_VARIABLE_COURSE_SCENARIO,
  NORTHBOUND_VARIABLE_SPEED_SCENARIO,
  TACK_COURSE_SCENARIO,
} from '../simulation/sailingSimulator.fixtures'
import { createSailingSimulator } from '../simulation/sailingSimulator'
import { createSimulatedGpsSource, type SimulatedGpsSource } from '../simulation/simulatedGpsSource'

const SIMULATION_QUERY_KEY = 'simulation'

export const SIMULATION_TICK_MS = 1_000
const SIMULATION_RATES = [1, 10, 20] as const

export type SimulationScenario = 'straight' | 'variable-speed' | 'variable-course' | 'tack-course'
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
    requestedScenario === 'straight' || requestedScenario === 'variable-speed' || requestedScenario === 'variable-course' || requestedScenario === 'tack-course'
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
  }
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
