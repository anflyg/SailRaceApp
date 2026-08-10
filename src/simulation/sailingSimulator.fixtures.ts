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

export const NORTHBOUND_VARIABLE_SPEED_SCENARIO: SailingSimulatorConfig = {
  origin: { latitude: 59.3293, longitude: 18.0686 },
  initialPosition: { xMeters: 0, yMeters: 0 },
  courseDegrees: 0,
  speedProfile: [
    { elapsedTimeSeconds: 0, speedKnots: 4 },
    { elapsedTimeSeconds: 30, speedKnots: 5 },
    { elapsedTimeSeconds: 60, speedKnots: 6 },
    { elapsedTimeSeconds: 90, speedKnots: 5 },
    { elapsedTimeSeconds: 120, speedKnots: 4 },
  ],
  timeStepSeconds: 1,
  startTimestamp: 1_700_000_000_000,
  accuracyMeters: 3,
}
