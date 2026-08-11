import { describe, expect, it } from 'vitest'
import { calculateGroundTruthLaylineCandidate, calculateGroundTruthLaylineCandidates } from './groundTruthLayline'
import groundTruthLaylineSource from './groundTruthLayline.ts?raw'

const target = { xMeters: 0, yMeters: 90 }

function candidateAt(boat: { xMeters: number; yMeters: number }, courseDegrees = 315) {
  return calculateGroundTruthLaylineCandidate({
    boat,
    target,
    groundTruthCourseDegrees: courseDegrees,
    groundTruthSpeedKnots: 6,
    alphaDegrees: 90,
  })
}

describe('independent simulation layline ground truth', () => {
  it('finds the plus-alpha 045° tack from the prescribed initial geometry', () => {
    const candidate = candidateAt({ xMeters: 20, yMeters: 0 })

    expect(candidate).toMatchObject({ laylineVariant: 'plus-alpha', postTackHeadingDegrees: 45 })
    expect(candidate?.distanceToTackMeters).toBeCloseTo(77.7817, 3)
    expect(candidate?.timeToTackSeconds).toBeCloseTo(25.2, 1)
  })

  it('reduces time to tack as the boat moves forward along 315°', () => {
    const initial = candidateAt({ xMeters: 20, yMeters: 0 })
    const moved = candidateAt({ xMeters: 20 - 6 * 0.514444 * Math.sin(Math.PI / 4) * 6, yMeters: 6 * 0.514444 * Math.cos(Math.PI / 4) * 6 })

    expect(moved?.timeToTackSeconds).toBeCloseTo((initial?.timeToTackSeconds ?? 0) - 6, 6)
  })

  it('returns null when the candidate lies behind the boat', () => {
    expect(candidateAt({ xMeters: -20, yMeters: 120 })).toBeNull()
  })

  it('rejects a post-tack heading that leaves the target behind it', () => {
    const candidates = calculateGroundTruthLaylineCandidates({
      boat: { xMeters: 20, yMeters: 0 },
      target,
      groundTruthCourseDegrees: 315,
      groundTruthSpeedKnots: 6,
      alphaDegrees: 90,
    })

    expect(candidates).toHaveLength(1)
    expect(candidates[0]?.laylineVariant).toBe('plus-alpha')
  })

  it('normalizes headings across 0/360', () => {
    const candidate = candidateAt({ xMeters: 20, yMeters: 0 }, 315)
    const wrappedCandidate = calculateGroundTruthLaylineCandidate({
      boat: { xMeters: 20, yMeters: 0 },
      target,
      groundTruthCourseDegrees: -45,
      groundTruthSpeedKnots: 6,
      alphaDegrees: 90,
    })

    expect(wrappedCandidate?.postTackHeadingDegrees).toBe(candidate?.postTackHeadingDegrees)
    expect(wrappedCandidate?.distanceToTackMeters).toBeCloseTo(candidate?.distanceToTackMeters ?? 0, 8)
  })

  it('does not import production layline geometry', () => {
    expect(groundTruthLaylineSource).not.toContain('computeLaylineCandidate')
    expect(groundTruthLaylineSource).not.toContain('getLaylineReference')
  })
})
