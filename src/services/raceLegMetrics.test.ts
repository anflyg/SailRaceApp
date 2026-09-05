import { describe, expect, it } from 'vitest'
import { calculateRaceLegMetrics, selectBestLeg, type RaceLegMetric } from './raceLegMetrics'
import type { Race } from '../types'

const origin = { latitude: 59.3, longitude: 18 }
const k1 = { latitude: 59.301, longitude: 18 }
const l1 = { latitude: 59.301, longitude: 18.001 }
const timestamp = (seconds: number) => new Date(Date.parse('2024-01-01T12:00:00Z') + seconds * 1000).toISOString()
const point = (seconds: number, latitude: number, longitude: number, speed: number | undefined, vmgWind: number | undefined, vmgCourse: number | undefined) => ({ timestamp: timestamp(seconds), latitude, longitude, speedKnots: speed, vmgWindKnots: vmgWind, vmgCourseKnots: vmgCourse })
const metric = (label: string, averageSpeedKnots: number | null, durationSeconds: number): RaceLegMetric => ({
  id: label,
  type: 'k1-to-l1',
  label: { kind: 'downwind', number: 1 },
  startSampleIndex: 0,
  endSampleIndex: 1,
  startTime: timestamp(0),
  endTime: timestamp(durationSeconds),
  startPosition: origin,
  endPosition: l1,
  durationSeconds,
  distanceMeters: 100,
  endMarker: 'L1',
  averageSpeedKnots,
  maxSpeedKnots: averageSpeedKnots,
  averageVmgWindKnots: null,
  averageVmgCourseKnots: null,
  sampleCount: 2,
  isBest: false,
})

const race: Race = {
  id: 'metrics', dayId: 'day', name: 'metrics', createdAt: timestamp(0), startGunTime: timestamp(0), course: { windwardMark: k1, leewardMark: l1 }, events: [], samples: [
    point(0, origin.latitude, origin.longitude, 4, 3, 2), point(10, 59.3006, 18.00001, 5, 3, 2), point(20, 59.30095, 18.00002, 6, 3, 2), point(30, 59.30105, 18.0001, 7, undefined, undefined),
    point(40, 59.30102, 18.0006, 5, undefined, undefined), point(50, 59.30101, 18.00095, 6, undefined, undefined), point(60, 59.30102, 18.00105, 7, undefined, undefined),
    point(70, 59.3009, 18.00098, 5, undefined, undefined), point(80, 59.3005, 18.0005, 6, undefined, undefined), point(90, 59.30095, 18.0001, 6, 4, 3), point(100, 59.30102, 18.00002, 6, 4, 3), point(110, 59.30112, 18.00001, 6, 4, 3), point(120, 59.3011, 18.0003, 6, 4, 3),
  ],
}

describe('race leg metrics', () => {
  it('calculates persisted metrics, labels and best legs', () => {
    const result = calculateRaceLegMetrics(race)
    expect(result.legs.map((leg) => leg.label)).toEqual([
      { kind: 'upwind', number: 1 },
      { kind: 'downwind', number: 1 },
      { kind: 'upwind', number: 2 },
    ])
    expect(result.legs.map((leg) => leg.durationSeconds)).toEqual([20, 30, 50])
    expect(result.legs[0].averageSpeedKnots).toBe(5)
    expect(result.legs[0].maxSpeedKnots).toBe(6)
    expect(result.legs[0].averageVmgWindKnots).toBe(3)
    expect(result.legs[1].averageVmgWindKnots).toBeNull()
    expect(result.legs[1].averageSpeedKnots).toBeCloseTo(6)
    expect(result.bestUpwind?.label).toEqual({ kind: 'upwind', number: 2 })
    expect(result.bestDownwind?.label).toEqual({ kind: 'downwind', number: 1 })
    expect(result.legs.filter((leg) => leg.isBest).map((leg) => leg.label)).toEqual([{ kind: 'downwind', number: 1 }, { kind: 'upwind', number: 2 }])
  })

  it('does not treat missing values as zero', () => {
    const result = calculateRaceLegMetrics({ ...race, samples: race.samples.map((sample) => ({ ...sample, speedKnots: undefined, vmgWindKnots: undefined, vmgCourseKnots: undefined })) })
    expect(result.legs.every((leg) => leg.averageSpeedKnots === null && leg.maxSpeedKnots === null && leg.averageVmgWindKnots === null)).toBe(true)
  })

  it('selects the fastest downwind leg before considering duration', () => {
    const slowerShorter = metric('Läns 2', 5.8, 60)
    const fasterLonger = metric('Läns 1', 6.2, 80)
    expect(selectBestLeg([fasterLonger, slowerShorter], false)?.id).toBe('Läns 1')
    expect(selectBestLeg([fasterLonger, metric('Läns 2', 6.2, 60)], false)?.id).toBe('Läns 2')
  })
})
