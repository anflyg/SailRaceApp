import type { LaylineVariant } from '../types'

const KNOTS_TO_METERS_PER_SECOND = 0.514444
const EPSILON = 1e-6

export const LAYLINE_CANDIDATE_TARGET_LOCAL: LocalLaylinePoint = { xMeters: 0, yMeters: 90 }

export interface LocalLaylinePoint {
  xMeters: number
  yMeters: number
}

export interface GroundTruthLaylineCandidate {
  laylineVariant: LaylineVariant
  postTackHeadingDegrees: number
  tackPointLocalXmeters: number
  tackPointLocalYmeters: number
  distanceToTackMeters: number
  timeToTackSeconds: number
}

export interface GroundTruthLaylineInput {
  boat: LocalLaylinePoint
  target: LocalLaylinePoint
  groundTruthCourseDegrees: number
  groundTruthSpeedKnots: number
  alphaDegrees: number
}

export function calculateGroundTruthLaylineCandidate(input: GroundTruthLaylineInput): GroundTruthLaylineCandidate | null {
  const candidates = calculateGroundTruthLaylineCandidates(input)
  return candidates.reduce<GroundTruthLaylineCandidate | null>((best, candidate) => (
    best === null || candidate.distanceToTackMeters < best.distanceToTackMeters ? candidate : best
  ), null)
}

export function calculateGroundTruthLaylineCandidates({
  boat,
  target,
  groundTruthCourseDegrees,
  groundTruthSpeedKnots,
  alphaDegrees,
}: GroundTruthLaylineInput): GroundTruthLaylineCandidate[] {
  if (!Number.isFinite(groundTruthSpeedKnots) || groundTruthSpeedKnots <= 0) {
    return []
  }

  const currentUnit = headingToUnitVector(groundTruthCourseDegrees)
  const relativeTarget = { xMeters: target.xMeters - boat.xMeters, yMeters: target.yMeters - boat.yMeters }
  const candidates: GroundTruthLaylineCandidate[] = [
    { laylineVariant: 'plus-alpha', postTackHeadingDegrees: normalizeDegrees(groundTruthCourseDegrees + alphaDegrees) },
    { laylineVariant: 'minus-alpha', postTackHeadingDegrees: normalizeDegrees(groundTruthCourseDegrees - alphaDegrees) },
  ].map(({ laylineVariant, postTackHeadingDegrees }) => {
    const postTackUnit = headingToUnitVector(postTackHeadingDegrees)
    const denominator = cross(currentUnit, postTackUnit)

    if (Math.abs(denominator) < EPSILON) {
      return null
    }

    const distanceToTackMeters = cross(relativeTarget, postTackUnit) / denominator
    const distanceAfterTackMeters = cross(currentUnit, relativeTarget) / denominator

    if (distanceToTackMeters <= EPSILON || distanceAfterTackMeters <= EPSILON) {
      return null
    }

    return {
      laylineVariant,
      postTackHeadingDegrees,
      tackPointLocalXmeters: boat.xMeters + currentUnit.xMeters * distanceToTackMeters,
      tackPointLocalYmeters: boat.yMeters + currentUnit.yMeters * distanceToTackMeters,
      distanceToTackMeters,
      timeToTackSeconds: distanceToTackMeters / (groundTruthSpeedKnots * KNOTS_TO_METERS_PER_SECOND),
    }
  }).filter((candidate): candidate is GroundTruthLaylineCandidate => candidate !== null)

  return candidates
}

function normalizeDegrees(degrees: number): number {
  return ((degrees % 360) + 360) % 360
}

function headingToUnitVector(headingDegrees: number): LocalLaylinePoint {
  const radians = (normalizeDegrees(headingDegrees) * Math.PI) / 180
  return { xMeters: Math.sin(radians), yMeters: Math.cos(radians) }
}

function cross(first: LocalLaylinePoint, second: LocalLaylinePoint): number {
  return first.xMeters * second.yMeters - first.yMeters * second.xMeters
}
