import { describe, expect, it } from 'vitest'
import { MANUAL_FIXTURES } from './manualMode'
import { getDevelopmentTacticalHeading } from './tacticalHeadingSource'

describe('explicit development tactical heading source', () => {
  it('keeps manual GUI heading available from its explicit fixture', () => {
    expect(getDevelopmentTacticalHeading(true, MANUAL_FIXTURES.filteredGps, MANUAL_FIXTURES.filteredGps.presentationTimestamp!))
      .toEqual({ degrees: 18, timestamp: MANUAL_FIXTURES.filteredGps.presentationTimestamp })
  })
  it('uses simulation course only when explicitly allowed and fresh', () => {
    const gps = { ...MANUAL_FIXTURES.filteredGps, displayCourseDegrees: 315 }
    expect(getDevelopmentTacticalHeading(true, gps, gps.presentationTimestamp!)).toMatchObject({ degrees: 315 })
    expect(getDevelopmentTacticalHeading(false, gps, gps.presentationTimestamp!)).toEqual({ degrees: null, timestamp: null })
    expect(getDevelopmentTacticalHeading(true, { ...gps, presentationTimestamp: 1 }, 10_000)).toEqual({ degrees: null, timestamp: null })
  })
  it('never uses GPS as a fallback when HDG fixture data is absent', () => {
    expect(getDevelopmentTacticalHeading(true, { ...MANUAL_FIXTURES.filteredGps, displayCourseDegrees: null }, Date.now()))
      .toEqual({ degrees: null, timestamp: null })
  })
})
