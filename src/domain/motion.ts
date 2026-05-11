import { shortestAngleDeltaDegrees } from './angles'
import type { DeviceAttitudeReading, HeelPitchCalibration, HeelPitchValues } from '../types'

export function calculateHeelPitchRelativeToCalibration(
  attitude: DeviceAttitudeReading,
  calibration: HeelPitchCalibration | null,
): HeelPitchValues | null {
  if (
    !calibration ||
    attitude.heelDegrees === null ||
    attitude.pitchDegrees === null
  ) {
    return null
  }

  return {
    heelDegrees: shortestAngleDeltaDegrees(attitude.heelDegrees, calibration.heelDegrees),
    pitchDegrees: shortestAngleDeltaDegrees(attitude.pitchDegrees, calibration.pitchDegrees),
  }
}
