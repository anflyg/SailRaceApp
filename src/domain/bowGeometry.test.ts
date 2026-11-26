import { describe, expect, it } from 'vitest'
import { bowPosition, captureStartPoint, isValidBowDistance, lineAdvantage } from './bowGeometry'
import { calculateStartMetrics, calculateTimeToLine, KNOTS_TO_METERS_PER_SECOND } from './startLine'
import { TacticalHeadingFilter } from '../hooks/useTacticalHeading'

const now = Date.now()
const heading = (degrees = 0, timestamp = now) => ({ degrees, timestamp })
const point = (east: number, north: number) => ({ latitude: north / 111320, longitude: east / 111320, quality: 'good' as const })
const phone = point(0, 0)
const base = { boatPosition: phone, currentAccuracyMeters: 3, startA: point(-10, 20), startB: point(10, 20), courseDegrees: 0, speedKnots: 2 / KNOTS_TO_METERS_PER_SECOND, countdownSeconds: 60, heading: heading() }

describe('bow geometry and saved-point compatibility', () => {
  it('moves the origin, preserves GPS COG/SOG, and increases BURN', () => {
    expect(calculateStartMetrics({ ...base, phoneToBowMeters: 0 })).toMatchObject({ ttlSeconds: 10, burnSeconds: 50 })
    expect(calculateStartMetrics({ ...base, phoneToBowMeters: 4 })).toMatchObject({ ttlSeconds: 8, burnSeconds: 52 })
    expect(calculateStartMetrics({ ...base, heading: heading(90), phoneToBowMeters: 4 }).ttlSeconds).toBe(10)
    expect(calculateStartMetrics({ ...base, phoneToBowMeters: .1 }).ttlSeconds).toBe(10)
  })
  it('recomputes oblique finite-segment intersections instead of subtracting distance', () => {
    const oblique = { ...base, startA: point(0, 20), startB: point(20, 40) }
    expect(calculateStartMetrics({ ...oblique, phoneToBowMeters: 4, heading: heading(90) }).ttlSeconds).toBe(12)
    expect(calculateStartMetrics({ ...oblique, phoneToBowMeters: 4, heading: heading(270) }).ttlSeconds).toBeNull()
  })
  it.each([0, 4, 15])('withholds both metrics without current HDG even at distance %s', distance => {
    for (const h of [heading(0, now - 2000), heading(0, now + 10000), { degrees: null, timestamp: null }, heading(NaN)]) {
      expect(calculateStartMetrics({ ...base, heading: h, phoneToBowMeters: distance })).toMatchObject({ ttlSeconds: null, burnSeconds: null, status: 'heading_unavailable' })
    }
  })
  it('uses native quality rejection and expiry, never COG as replacement heading', () => {
    const filter = new TacticalHeadingFilter()
    for (const sample of [{ valid: false }, { valid: true, headingDegrees: 0, motionTimestamp: 1, ageMs: 1001 }]) {
      const h = filter.add(sample, now)
      expect(captureStartPoint(phone, 4, h, now)).toBeNull()
      expect(calculateStartMetrics({ ...base, heading: h }).burnSeconds).toBeNull()
    }
  })
  it('corrects new points once and never mutates legacy or captured endpoints on distance edits', () => {
    const legacy = structuredClone(base.startA)
    const mark = captureStartPoint(phone, 4, heading(), now)!
    expect(mark.latitude * 111320).toBeCloseTo(4)
    const saved = structuredClone(mark)
    calculateStartMetrics({ ...base, startA: mark, phoneToBowMeters: 15 })
    expect(mark).toEqual(saved)
    const startA = captureStartPoint(point(-10, 16), 4, heading(), now)!
    const startB = captureStartPoint(point(10, 16), 4, heading(), now)!
    expect(calculateStartMetrics({ ...base, startA, startB, phoneToBowMeters: 4 }).ttlSeconds).toBe(8)
    expect(base.startA).toEqual(legacy)
    expect(captureStartPoint(phone, 0, { degrees: null, timestamp: null }, now)).toEqual(phone)
    expect(captureStartPoint(phone, 4, { degrees: null, timestamp: null }, now)).toBeNull()
  })
  it.each([-1, 15.1, NaN, Infinity])('rejects invalid distance %s', distance => {
    expect(isValidBowDistance(distance)).toBe(false)
    expect(captureStartPoint(phone, distance, heading(), now)).toBeNull()
    expect(calculateStartMetrics({ ...base, phoneToBowMeters: distance }).ttlSeconds).toBeNull()
  })
  it('handles wraparound, parallel/away rays, coincident endpoints and bad GPS', () => {
    expect(bowPosition(phone, 4, heading(359), now)!.longitude).toBeLessThan(0)
    expect(bowPosition(phone, 4, heading(1), now)!.longitude).toBeGreaterThan(0)
    expect(calculateStartMetrics({ ...base, courseDegrees: 90 }).ttlSeconds).toBeNull()
    expect(calculateStartMetrics({ ...base, courseDegrees: 180 }).ttlSeconds).toBeNull()
    expect(calculateStartMetrics({ ...base, startB: base.startA }).ttlSeconds).toBeNull()
    for (const accuracy of [6, -1, NaN, Infinity]) expect(calculateStartMetrics({ ...base, currentAccuracyMeters: accuracy }).ttlSeconds).toBeNull()
    expect(captureStartPoint({ ...phone, longitude: 179.999999 }, 15, heading(90), now)).toBeNull()
    expect(calculateStartMetrics({ ...base, speedKnots: NaN }).ttlSeconds).toBeNull()
    expect(calculateTimeToLine({ ...base, boatPosition: phone, startA: base.startA, startB: base.startB })).toBe(10)
  })
})

describe('Course wind-FROM start advantage', () => {
  const end = (degrees: number) => point(100 * Math.cos(degrees * Math.PI / 180), 100 * Math.sin(degrees * Math.PI / 180))
  it('uses A/B identities, wind-FROM, wraparound and whole degrees', () => {
    expect(lineAdvantage(phone, end(0), 0)).toEqual({ favored: null, degrees: 0 })
    expect(lineAdvantage(phone, end(6), 0)).toEqual({ favored: 'B', degrees: 6 })
    expect(lineAdvantage(end(6), phone, 0)).toEqual({ favored: 'A', degrees: 6 })
    expect(lineAdvantage(phone, end(6), 360)).toEqual(lineAdvantage(phone, end(6), 0))
    expect(lineAdvantage(phone, end(6), 180)).toEqual({ favored: 'A', degrees: 6 })
  })
  it('applies the neutral threshold before rounding', () => {
    expect(lineAdvantage(phone, end(2), 0)?.favored).toBeNull()
    expect(lineAdvantage(phone, end(2.01), 0)).toEqual({ favored: 'B', degrees: 2 })
    expect(lineAdvantage(phone, end(6.6), 0)?.degrees).toBe(7)
  })
  it('withholds missing, poor, degenerate and unsupported geometry', () => {
    expect(lineAdvantage(null, end(6), 0)).toBeNull()
    expect(lineAdvantage(phone, end(6), null)).toBeNull()
    expect(lineAdvantage(phone, phone, 0)).toBeNull()
    expect(lineAdvantage(phone, { ...end(6), quality: 'poor' }, 0)).toBeNull()
    expect(lineAdvantage(phone, { ...end(6), latitude: NaN }, 0)).toBeNull()
  })
})
