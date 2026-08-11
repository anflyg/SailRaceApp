function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

export function calculateGroundTruthVmgKnots(
  groundTruthSpeedKnots: number,
  groundTruthCourseDegrees: number,
  referenceHeadingDegrees: number,
): number {
  return groundTruthSpeedKnots * Math.cos(toRadians(groundTruthCourseDegrees - referenceHeadingDegrees))
}
