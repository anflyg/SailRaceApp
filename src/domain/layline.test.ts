import { describe, expect, it } from 'vitest'
import {
  computeLaylineCandidate,
  getLaylineReference,
  isHeadingTowardReference,
} from './layline'
import type { CourseState, GeoPoint } from '../types'

const METERS_PER_DEGREE_LATITUDE = 111_320
const KNOTS_TO_METERS_PER_SECOND = 0.514444

function metersToGeo(origin: GeoPoint, eastMeters: number, northMeters: number): GeoPoint {
  const metersPerDegreeLongitude = METERS_PER_DEGREE_LATITUDE * Math.cos((origin.latitude * Math.PI) / 180)

  return {
    latitude: origin.latitude + (northMeters / METERS_PER_DEGREE_LATITUDE),
    longitude: origin.longitude + (eastMeters / metersPerDegreeLongitude),
  }
}

function createEmptyCourse(): CourseState {
  return {
    points: {
      startA: null,
      startB: null,
      kryss1: null,
      lans1: null,
    },
    windHeadingDegrees: null,
  }
}

describe('computeLaylineCandidate', () => {
  it('väljer +Alpha när bara den varianten ger giltig slagpunkt', () => {
    const origin = { latitude: 59.33, longitude: 18.06 }
    const target = metersToGeo(origin, 140, 120)
    const candidate = computeLaylineCandidate({
      position: origin,
      currentCogDegrees: 0,
      speedKnots: 6.2,
      alphaDegrees: 90,
      targetMark: target,
    })

    expect(candidate).not.toBeNull()
    expect(candidate?.laylineVariant).toBe('plus-alpha')
    expect(candidate?.postTackHeadingDegrees).toBeCloseTo(90, 6)
    expect(candidate?.distanceToTackMeters).toBeCloseTo(120, 1)
  })

  it('väljer -Alpha när bara den varianten ger giltig slagpunkt', () => {
    const origin = { latitude: 59.33, longitude: 18.06 }
    const target = metersToGeo(origin, -130, 95)
    const candidate = computeLaylineCandidate({
      position: origin,
      currentCogDegrees: 0,
      speedKnots: 5.8,
      alphaDegrees: 90,
      targetMark: target,
    })

    expect(candidate).not.toBeNull()
    expect(candidate?.laylineVariant).toBe('minus-alpha')
    expect(candidate?.postTackHeadingDegrees).toBeCloseTo(270, 6)
    expect(candidate?.distanceToTackMeters).toBeCloseTo(95, 1)
  })

  it('returnerar null när slagpunkten hamnar bakom båten', () => {
    const origin = { latitude: 59.33, longitude: 18.06 }
    const target = metersToGeo(origin, 80, -45)
    const candidate = computeLaylineCandidate({
      position: origin,
      currentCogDegrees: 0,
      speedKnots: 6,
      alphaDegrees: 90,
      targetMark: target,
    })

    expect(candidate).toBeNull()
  })

  it('beräknar tid till slagpunkt runt 10 sekunder', () => {
    const origin = { latitude: 59.33, longitude: 18.06 }
    const speedKnots = 10
    const speedMetersPerSecond = speedKnots * KNOTS_TO_METERS_PER_SECOND
    const distanceMeters = speedMetersPerSecond * 10
    const target = metersToGeo(origin, 120, distanceMeters)
    const candidate = computeLaylineCandidate({
      position: origin,
      currentCogDegrees: 0,
      speedKnots,
      alphaDegrees: 90,
      targetMark: target,
    })

    expect(candidate).not.toBeNull()
    expect(candidate?.timeToTackSeconds).toBeCloseTo(10, 3)
  })
})

describe('getLaylineReference + riktning mot K1', () => {
  it('prioriterar L1→K1 och betraktar bara COG nära referensen som mot K1', () => {
    const origin = { latitude: 59.33, longitude: 18.06 }
    const l1 = metersToGeo(origin, 0, -300)
    const k1 = metersToGeo(origin, 0, 300)
    const startA = metersToGeo(origin, -80, -30)
    const startB = metersToGeo(origin, 80, -30)
    const course: CourseState = {
      ...createEmptyCourse(),
      points: {
        startA: { ...startA, quality: 'good' },
        startB: { ...startB, quality: 'good' },
        kryss1: { ...k1, quality: 'good' },
        lans1: { ...l1, quality: 'good' },
      },
    }

    const reference = getLaylineReference(course)

    expect(reference).not.toBeNull()
    expect(reference?.source).toBe('l1-k1')
    expect(reference?.headingDegrees).toBeCloseTo(0, 2)
    expect(isHeadingTowardReference(15, reference?.headingDegrees ?? 180)).toBe(true)
    expect(isHeadingTowardReference(190, reference?.headingDegrees ?? 0)).toBe(false)
  })

  it('faller tillbaka till startlinjens mittpunkt→K1 när L1 saknas', () => {
    const origin = { latitude: 59.33, longitude: 18.06 }
    const startA = metersToGeo(origin, -100, 0)
    const startB = metersToGeo(origin, 100, 0)
    const k1 = metersToGeo(origin, 260, 0)
    const course: CourseState = {
      ...createEmptyCourse(),
      points: {
        startA: { ...startA, quality: 'good' },
        startB: { ...startB, quality: 'good' },
        kryss1: { ...k1, quality: 'good' },
        lans1: null,
      },
    }

    const reference = getLaylineReference(course)

    expect(reference).not.toBeNull()
    expect(reference?.source).toBe('startline-mid-k1')
    expect(reference?.headingDegrees).toBeCloseTo(90, 2)
    expect(isHeadingTowardReference(100, reference?.headingDegrees ?? 0)).toBe(true)
    expect(isHeadingTowardReference(275, reference?.headingDegrees ?? 0)).toBe(false)
  })
})
