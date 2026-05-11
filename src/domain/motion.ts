import { shortestAngleDeltaDegrees } from './angles'
import type { DeviceAttitudeReading, RollPitchCalibration, RollPitchValues } from '../types'

export function calculateRollPitchRelativeToCalibration(
  attitude: DeviceAttitudeReading,
  calibration: RollPitchCalibration | null,
): RollPitchValues | null {
  if (
    !calibration ||
    attitude.rollDegrees === null ||
    attitude.pitchDegrees === null
  ) {
    return null
  }

  return {
    rollDegrees: shortestAngleDeltaDegrees(attitude.rollDegrees, calibration.rollDegrees),
    pitchDegrees: shortestAngleDeltaDegrees(attitude.pitchDegrees, calibration.pitchDegrees),
  }
}
