import { NORTHBOUND_SIX_KNOTS_SCENARIO } from '../simulation/sailingSimulator.fixtures'
import { createSailingSimulator } from '../simulation/sailingSimulator'
import { createSimulatedGpsSource, type SimulatedGpsSource } from '../simulation/simulatedGpsSource'

const SIMULATION_QUERY_KEY = 'simulation'

export const SIMULATION_TICK_MS = 1_000

export type SimulationScenario = 'straight'

export interface SimulationModeConfig {
  enabled: boolean
  scenario: SimulationScenario | null
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
  const scenario = search?.get(SIMULATION_QUERY_KEY) === 'straight' ? 'straight' : null
  const simulationBuildAllowed = environment.DEV || environment.MODE === 'simulation'

  if (manualModeEnabled || !simulationBuildAllowed || scenario === null) {
    return { enabled: false, scenario: null }
  }

  return { enabled: true, scenario }
}

export function createSimulationGpsSource(scenario: SimulationScenario): SimulatedGpsSource {
  switch (scenario) {
    case 'straight':
      return createSimulatedGpsSource(createSailingSimulator(NORTHBOUND_SIX_KNOTS_SCENARIO))
  }
}

export function startSimulationTicker(source: Pick<SimulatedGpsSource, 'advance'>): () => void {
  const intervalId = globalThis.setInterval(() => {
    source.advance()
  }, SIMULATION_TICK_MS)

  return () => globalThis.clearInterval(intervalId)
}

function getSearchParams(): URLSearchParams | null {
  if (typeof window === 'undefined') {
    return null
  }

  return new URLSearchParams(window.location.search)
}
