import type { SailingSimulatorConfig } from './sailingSimulator'

export const NORTHBOUND_SIX_KNOTS_SCENARIO: SailingSimulatorConfig = {
  origin: { latitude: 59.3293, longitude: 18.0686 },
  initialPosition: { xMeters: 0, yMeters: 0 },
  courseDegrees: 0,
  targetSpeedKnots: 6,
  timeStepSeconds: 1,
  startTimestamp: 1_700_000_000_000,
  accuracyMeters: 3,
}
