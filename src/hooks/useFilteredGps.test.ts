import { describe, expect, it } from 'vitest'
import { getLatestProcessedGpsTimestamp } from './useFilteredGps'

describe('filtered GPS presentation metadata', () => {
  it('uses the latest processed GPS sample timestamp rather than a raw reading outside the sample pipeline', () => {
    expect(getLatestProcessedGpsTimestamp([
      { gpsTimestamp: 1_000 },
      { gpsTimestamp: 2_000 },
    ])).toBe(2_000)
  })

  it('remains unavailable until the filtering pipeline has a processed sample timestamp', () => {
    expect(getLatestProcessedGpsTimestamp([])).toBeNull()
    expect(getLatestProcessedGpsTimestamp([{ gpsTimestamp: null }])).toBeNull()
  })
})
