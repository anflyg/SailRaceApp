import { describe, expect, it } from 'vitest'
import { calculateGroundTruthVmgKnots } from './groundTruthVmg'
import groundTruthVmgSource from './groundTruthVmg.ts?raw'

describe('simulation ground-truth VMG', () => {
  it.each([
    [315, 4.242640687],
    [45, 4.242640687],
    [0, 6],
    [90, 0],
    [180, -6],
  ])('calculates 6 kn on course %i against a 000° reference', (courseDegrees, expectedVmgKnots) => {
    expect(calculateGroundTruthVmgKnots(6, courseDegrees, 0)).toBeCloseTo(expectedVmgKnots, 8)
  })

  it('does not import the production VMG helper', () => {
    expect(groundTruthVmgSource).not.toContain('calculateVelocityMadeGood')
  })
})
