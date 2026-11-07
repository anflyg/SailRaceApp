import { describe, expect, it } from 'vitest'
import { isFreshReliableGps, isUsableWindReference } from './windReference'
import type { FilteredGpsReading } from '../types'
import type { WindHeadingMeasurementResult } from '../services/sensors/windHeadingService'

const wind: WindHeadingMeasurementResult = {
  headingDegrees: 0, selectedHeadingDegrees: 0, selectedHeadingSource: 'back-vector-row',
  sampleCount: 40, referenceFrame: 'true-north', quality: 'good', accuracyDegrees: 3, spreadDegrees: 2, nativeDebug: null,
}
const gps: FilteredGpsReading = {
  status: 'watching', error: null, latitude: 0, longitude: 0, accuracyMeters: 2,
  speedKnots: 5, courseDegrees: 359, courseReliable: true, timestamp: 10_000,
  nativeCourseDegrees: 359, positionCourseDegrees: 359, fusedCourseDegrees: 359,
  nativeSpeedKnots: 5, positionSpeedKnots: 5, fusedSpeedKnots: 5, sampleCount: 1,
  displayCourseDegrees: 359, presentationTimestamp: 10_000,
}

describe('usable wind reference', () => {
  it('accepts good true north with consistent headings including 360/0', () => {
    expect(isUsableWindReference(360, wind)).toBe(true)
    expect(isUsableWindReference(359, { ...wind, headingDegrees: 359, selectedHeadingDegrees: 359 })).toBe(true)
    expect(isUsableWindReference(359, wind)).toBe(false)
  })
  it.each(['magnetic-north', 'mock', undefined])('rejects reference frame %s', (referenceFrame) => {
    expect(isUsableWindReference(0, { ...wind, referenceFrame } as WindHeadingMeasurementResult)).toBe(false)
  })
  it.each(['poor', 'unknown', 'ok', 'unstable', undefined])('rejects quality %s', (quality) => {
    expect(isUsableWindReference(0, { ...wind, quality } as WindHeadingMeasurementResult)).toBe(false)
  })
  it('rejects missing, mismatched and invalid heading metadata', () => {
    expect(isUsableWindReference(0, undefined)).toBe(false)
    expect(isUsableWindReference(null, wind)).toBe(false)
    expect(isUsableWindReference(NaN, wind)).toBe(false)
    expect(isUsableWindReference(0, { ...wind, selectedHeadingDegrees: 1 })).toBe(false)
    expect(isUsableWindReference(0, { ...wind, headingDegrees: NaN })).toBe(false)
    expect(isUsableWindReference(0, { ...wind, accuracyDegrees: null })).toBe(false)
    expect(isUsableWindReference(0, { ...wind, accuracyDegrees: 11 })).toBe(false)
    expect(isUsableWindReference(0, { ...wind, spreadDegrees: 11 })).toBe(false)
    expect(isUsableWindReference(0, { ...wind, sampleCount: 29 })).toBe(false)
    expect(isUsableWindReference(0, { ...wind, selectedHeadingSource: 'mock' })).toBe(false)
  })
  it('requires valid reliable GPS and a fresh timestamp', () => {
    expect(isFreshReliableGps(gps, 359, gps.timestamp, 15_000)).toBe(true)
    expect(isFreshReliableGps(gps, 359, gps.timestamp, 15_001)).toBe(false)
    expect(isFreshReliableGps({ ...gps, courseReliable: false }, 359, gps.timestamp, 10_000)).toBe(false)
    expect(isFreshReliableGps({ ...gps, speedKnots: NaN }, 359, gps.timestamp, 10_000)).toBe(false)
    expect(isFreshReliableGps(gps, null, gps.timestamp, 10_000)).toBe(false)
  })
})
