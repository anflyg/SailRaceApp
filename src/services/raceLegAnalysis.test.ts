import { describe, expect, it } from 'vitest'
import { analyzeRaceLegs } from './raceLegAnalysis'
import type { Race } from '../types'

const origin = { latitude: 59.3, longitude: 18 }
const k1 = { latitude: 59.301, longitude: 18 }
const l1 = { latitude: 59.301, longitude: 18.001 }

function sample(seconds: number, latitude: number, longitude: number): Race['samples'][number] {
  return { timestamp: new Date(Date.parse('2024-01-01T12:00:00Z') + seconds * 1000).toISOString(), latitude, longitude }
}

function fixture(samples: Race['samples']): Race {
  return { id: 'legs', dayId: 'day', name: 'legs', createdAt: samples[0].timestamp, startGunTime: '2024-01-01T12:00:00Z', course: { windwardMark: k1, leewardMark: l1 }, samples, events: [] }
}

const route = [
  sample(0, origin.latitude, origin.longitude), sample(10, 59.3006, 18.00001), sample(20, 59.30095, 18.00002),
  sample(30, 59.30105, 18.0001), sample(40, 59.30102, 18.0006), sample(50, 59.30101, 18.00095),
  sample(60, 59.30102, 18.00105), sample(70, 59.3009, 18.00098), sample(80, 59.3005, 18.0005),
  sample(90, 59.30095, 18.0001), sample(100, 59.30102, 18.00002), sample(110, 59.30112, 18.00001),
]

describe('race leg analysis', () => {
  it('detects START → K1 → L1 → K1 in the expected order', () => {
    const result = analyzeRaceLegs(fixture(route))
    expect(result.status).toBe('ok')
    expect(result.markerSequence).toEqual(['K1', 'L1', 'K1'])
    expect(result.legs.map((leg) => leg.type)).toEqual(['start-to-k1', 'k1-to-l1', 'l1-to-k1'])
    expect(result.legs.map((leg) => [leg.startTime, leg.endTime])).toEqual([
      [route[0].timestamp, route[2].timestamp], [route[2].timestamp, route[5].timestamp], [route[5].timestamp, route[10].timestamp],
    ])
    expect(result.legs.every((leg) => leg.distanceMeters > 0 && leg.durationSeconds > 0)).toBe(true)
  })

  it('does not double-detect light GPS noise at the marks', () => {
    const noisy = route.map((point, index) => ({ ...point, latitude: point.latitude + (index % 2 === 0 ? 0.000003 : -0.000003), longitude: point.longitude + (index % 3 === 0 ? 0.000003 : 0) }))
    const result = analyzeRaceLegs(fixture(noisy))
    expect(result.markerSequence).toEqual(['K1', 'L1', 'K1'])
    expect(result.legs).toHaveLength(3)
  })

  it('does not create a boundary for a near miss', () => {
    const nearMiss = [
      sample(0, origin.latitude, origin.longitude),
      sample(10, 59.3004, 18.0002),
      sample(20, 59.3007, 18.0005),
      sample(30, 59.3008, 18.0006),
      sample(40, 59.3013, 18.0008),
    ]
    const result = analyzeRaceLegs(fixture(nearMiss))
    expect(result.markerSequence).toEqual([])
    expect(result.legs).toEqual([])
  })
})
