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

export const NORTHBOUND_VARIABLE_COURSE_SCENARIO: SailingSimulatorConfig = {
  origin: { latitude: 59.3293, longitude: 18.0686 },
  initialPosition: { xMeters: 0, yMeters: 0 },
  courseProfile: [
    { elapsedTimeSeconds: 0, courseDegrees: 350 },
    { elapsedTimeSeconds: 10, courseDegrees: 350 },
    { elapsedTimeSeconds: 40, courseDegrees: 10 },
    { elapsedTimeSeconds: 60, courseDegrees: 10 },
    { elapsedTimeSeconds: 90, courseDegrees: 350 },
    { elapsedTimeSeconds: 120, courseDegrees: 350 },
  ],
  targetSpeedKnots: 6,
  timeStepSeconds: 1,
  startTimestamp: 1_700_000_000_000,
  accuracyMeters: 3,
}

export const TACK_COURSE_SCENARIO: SailingSimulatorConfig = {
  origin: { latitude: 59.3293, longitude: 18.0686 },
  initialPosition: { xMeters: 0, yMeters: 0 },
  courseProfile: [
    { elapsedTimeSeconds: 0, courseDegrees: 315 },
    { elapsedTimeSeconds: 15, courseDegrees: 315 },
    { elapsedTimeSeconds: 21, courseDegrees: 45 },
    { elapsedTimeSeconds: 60, courseDegrees: 45 },
  ],
  targetSpeedKnots: 6,
  timeStepSeconds: 1,
  startTimestamp: 1_700_000_000_000,
  accuracyMeters: 3,
}

export const COURSE_NOISE_SCENARIO: SailingSimulatorConfig = {
  origin: { latitude: 59.3293, longitude: 18.0686 },
  initialPosition: { xMeters: 0, yMeters: 0 },
  courseDegrees: 315,
  courseNoiseDegrees: [0, 4, -3, 5, -4, 2, -5, 3, -2, 4, -1],
  targetSpeedKnots: 6,
  timeStepSeconds: 1,
  startTimestamp: 1_700_000_000_000,
  accuracyMeters: 3,
}

export const WIND_VMG_SCENARIO: SailingSimulatorConfig = {
  origin: { latitude: 59.3293, longitude: 18.0686 },
  initialPosition: { xMeters: 0, yMeters: 0 },
  courseDegrees: 315,
  targetSpeedKnots: 6,
  timeStepSeconds: 1,
  startTimestamp: 1_700_000_000_000,
  accuracyMeters: 3,
}

export const LAYLINE_CANDIDATE_SCENARIO: SailingSimulatorConfig = {
  origin: { latitude: 59.3293, longitude: 18.0686 },
  initialPosition: { xMeters: 20, yMeters: 0 },
  courseDegrees: 315,
  targetSpeedKnots: 6,
  timeStepSeconds: 1,
  startTimestamp: 1_700_000_000_000,
  accuracyMeters: 3,
}
