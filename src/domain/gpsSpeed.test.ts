import { describe, expect, it } from 'vitest'
import {
  calculatePositionSpeedKnots,
  filterGpsSpeedKnots,
  fuseGpsSpeedKnots,
  GPS_SPEED_MAX_POSITION_BASELINE_MS,
  GPS_SPEED_MIN_POSITION_BASELINE_MS,
  isReliableGpsSpeedPosition,
  type GpsSpeedPosition,
} from './gpsSpeed'

const METERS_PER_DEGREE_LATITUDE = 111_320
const KNOTS_TO_METERS_PER_SECOND = 0.514444
const FILTER_WINDOW_MS = 3000

interface SpeedInput {
  coordsSpeedKnots: number | null
  positionSpeedKnots: number
  elapsedMs?: number
  jumpMeters?: number
  accuracyMeters?: number
}

interface SimulatedSpeedSample extends GpsSpeedPosition {
  fusedSpeedKnots: number | null
}

function simulateSpeed(inputs: SpeedInput[]): {
  displayedSpeeds: Array<number | null>
  positionSpeeds: Array<number | null>
} {
  let latitude = 59.33
  let timestamp = 1_000_000
  let previousFusedSpeedKnots: number | null = null
  let samples: SimulatedSpeedSample[] = []
  const displayedSpeeds: Array<number | null> = []
  const positionSpeeds: Array<number | null> = []

  inputs.forEach((input, index) => {
    const elapsedMs = index === 0 ? 0 : (input.elapsedMs ?? 1000)

    if (index > 0) {
      const elapsedSeconds = elapsedMs / 1000
      const distanceMeters =
        input.jumpMeters ?? input.positionSpeedKnots * KNOTS_TO_METERS_PER_SECOND * elapsedSeconds

      latitude += distanceMeters / METERS_PER_DEGREE_LATITUDE
      timestamp += elapsedMs
    }

    const position: GpsSpeedPosition = {
      latitude,
      longitude: 18.06,
      accuracyMeters: input.accuracyMeters ?? 5,
      timestamp,
    }
    let previousPosition: GpsSpeedPosition | null = null

    for (let sampleIndex = samples.length - 1; sampleIndex >= 0; sampleIndex -= 1) {
      const candidate = samples[sampleIndex]

      if (isReliableGpsSpeedPosition(candidate)) {
        const baselineMs = timestamp - candidate.timestamp

        if (
          baselineMs >= GPS_SPEED_MIN_POSITION_BASELINE_MS &&
          baselineMs <= GPS_SPEED_MAX_POSITION_BASELINE_MS
        ) {
          previousPosition = candidate
          break
        }
      }
    }

    const positionSpeedKnots = calculatePositionSpeedKnots(previousPosition, position)
    const fusedSpeedKnots = fuseGpsSpeedKnots(
      input.coordsSpeedKnots,
      positionSpeedKnots,
      previousFusedSpeedKnots,
    )

    samples = [
      ...samples.filter((sample) => sample.timestamp! >= timestamp - FILTER_WINDOW_MS),
      { ...position, fusedSpeedKnots },
    ]
    displayedSpeeds.push(
      filterGpsSpeedKnots(samples.map((sample) => sample.fusedSpeedKnots)),
    )
    positionSpeeds.push(positionSpeedKnots)

    if (fusedSpeedKnots !== null) {
      previousFusedSpeedKnots = fusedSpeedKnots
    }
  })

  return { displayedSpeeds, positionSpeeds }
}

describe('GPS speed fusion and filtering', () => {
  it('does not use position speed from positions only one second apart', () => {
    const result = simulateSpeed([
      { coordsSpeedKnots: 5, positionSpeedKnots: 5 },
      { coordsSpeedKnots: 5, positionSpeedKnots: 5, elapsedMs: 1000 },
    ])

    expect(result.positionSpeeds).toEqual([null, null])
    expect(result.displayedSpeeds.at(-1)).toBe(5)
  })

  it('calculates about 5 kn from a position baseline between three and five seconds', () => {
    const result = simulateSpeed([
      { coordsSpeedKnots: null, positionSpeedKnots: 5 },
      { coordsSpeedKnots: null, positionSpeedKnots: 5, elapsedMs: 4000 },
    ])

    expect(result.positionSpeeds[1]).toBeCloseTo(5, 1)
    expect(result.displayedSpeeds[1]).toBeCloseTo(5, 1)
  })

  it('keeps stable speed around 5 kn calm with normal noise', () => {
    const result = simulateSpeed([
      { coordsSpeedKnots: 5.0, positionSpeedKnots: 5.0 },
      { coordsSpeedKnots: 4.9, positionSpeedKnots: 5.1 },
      { coordsSpeedKnots: 5.1, positionSpeedKnots: 4.9 },
      { coordsSpeedKnots: 4.8, positionSpeedKnots: 5.0 },
      { coordsSpeedKnots: 5.0, positionSpeedKnots: 5.1 },
    ])

    expect(result.displayedSpeeds.at(-1)).toBeCloseTo(4.97, 1)
  })

  it('rejects one low coords.speed while position movement remains around 5 kn', () => {
    const result = simulateSpeed([
      { coordsSpeedKnots: 5.0, positionSpeedKnots: 5.0 },
      { coordsSpeedKnots: 4.9, positionSpeedKnots: 5.0 },
      { coordsSpeedKnots: 2.0, positionSpeedKnots: 5.0 },
      { coordsSpeedKnots: 5.1, positionSpeedKnots: 5.0 },
      { coordsSpeedKnots: 4.8, positionSpeedKnots: 5.0 },
    ])

    expect(result.displayedSpeeds[2]).toBeGreaterThanOrEqual(4.9)
    expect(result.displayedSpeeds.at(-1)).toBeGreaterThanOrEqual(4.8)
  })

  it('rejects one high coords.speed spike', () => {
    const result = simulateSpeed([
      { coordsSpeedKnots: 5.0, positionSpeedKnots: 5.0 },
      { coordsSpeedKnots: 5.1, positionSpeedKnots: 5.0 },
      { coordsSpeedKnots: 24, positionSpeedKnots: 5.0 },
      { coordsSpeedKnots: 4.9, positionSpeedKnots: 5.0 },
    ])

    expect(result.displayedSpeeds[2]).toBeLessThan(5.2)
    expect(result.displayedSpeeds.at(-1)).toBeCloseTo(5, 1)
  })

  it('uses reliable position movement when coords.speed is null', () => {
    const result = simulateSpeed([
      { coordsSpeedKnots: null, positionSpeedKnots: 5.0 },
      { coordsSpeedKnots: null, positionSpeedKnots: 5.0 },
      { coordsSpeedKnots: null, positionSpeedKnots: 5.0 },
      { coordsSpeedKnots: null, positionSpeedKnots: 5.0 },
    ])

    expect(result.positionSpeeds.slice(0, 3)).toEqual([null, null, null])
    expect(result.displayedSpeeds.slice(0, 3)).toEqual([null, null, null])
    expect(result.positionSpeeds[3]).toBeCloseTo(5, 1)
    expect(result.displayedSpeeds.at(-1)).toBeCloseTo(5, 1)
  })

  it('keeps coords.speed stable while short-baseline positions are noisy', () => {
    const result = simulateSpeed([
      { coordsSpeedKnots: 5.0, positionSpeedKnots: 5.0 },
      { coordsSpeedKnots: 4.9, positionSpeedKnots: 5.0, jumpMeters: 15 },
      { coordsSpeedKnots: 5.1, positionSpeedKnots: 5.0, jumpMeters: 0.5 },
    ])

    expect(result.positionSpeeds).toEqual([null, null, null])
    expect(result.displayedSpeeds.at(-1)).toBeCloseTo(5, 1)
  })

  it('rejects an unreasonable position jump and uses reasonable coords.speed', () => {
    const result = simulateSpeed([
      { coordsSpeedKnots: 5.0, positionSpeedKnots: 5.0 },
      { coordsSpeedKnots: 5.0, positionSpeedKnots: 5.0 },
      { coordsSpeedKnots: 5.0, positionSpeedKnots: 5.0 },
      { coordsSpeedKnots: 5.1, positionSpeedKnots: 5.0, jumpMeters: 500 },
    ])

    expect(result.positionSpeeds[3]).toBeNull()
    expect(result.displayedSpeeds[3]).toBeCloseTo(5, 1)
  })

  it('follows real acceleration from about 3 to 5 kn within a few samples', () => {
    const result = simulateSpeed([
      { coordsSpeedKnots: 3, positionSpeedKnots: 3 },
      { coordsSpeedKnots: 3, positionSpeedKnots: 3 },
      { coordsSpeedKnots: 4, positionSpeedKnots: 4 },
      { coordsSpeedKnots: 5, positionSpeedKnots: 5 },
      { coordsSpeedKnots: 5, positionSpeedKnots: 5 },
      { coordsSpeedKnots: 5, positionSpeedKnots: 5 },
      { coordsSpeedKnots: 5, positionSpeedKnots: 5 },
      { coordsSpeedKnots: 5, positionSpeedKnots: 5 },
    ])

    expect(result.displayedSpeeds.at(-1)).toBeCloseTo(5, 1)
    expect(result.displayedSpeeds.at(-1)!).toBeGreaterThan(result.displayedSpeeds[1]!)
  })

  it('follows real braking from about 5 to 2 kn within a few samples', () => {
    const result = simulateSpeed([
      { coordsSpeedKnots: 5, positionSpeedKnots: 5 },
      { coordsSpeedKnots: 5, positionSpeedKnots: 5 },
      { coordsSpeedKnots: 2, positionSpeedKnots: 2 },
      { coordsSpeedKnots: 2, positionSpeedKnots: 2 },
      { coordsSpeedKnots: 2, positionSpeedKnots: 2 },
      { coordsSpeedKnots: 2, positionSpeedKnots: 2 },
    ])

    expect(result.displayedSpeeds.at(-1)).toBeCloseTo(2, 1)
    expect(result.displayedSpeeds.at(-1)!).toBeLessThan(result.displayedSpeeds[1]!)
  })

  it('uses the actual varying time interval for position speed', () => {
    const result = simulateSpeed([
      { coordsSpeedKnots: null, positionSpeedKnots: 5 },
      { coordsSpeedKnots: null, positionSpeedKnots: 5, elapsedMs: 700 },
      { coordsSpeedKnots: null, positionSpeedKnots: 5, elapsedMs: 1600 },
      { coordsSpeedKnots: null, positionSpeedKnots: 5, elapsedMs: 2400 },
      { coordsSpeedKnots: null, positionSpeedKnots: 5, elapsedMs: 900 },
    ])

    expect(result.positionSpeeds.slice(0, 3)).toEqual([null, null, null])
    expect(result.positionSpeeds[3]).toBeCloseTo(5, 1)
    expect(result.positionSpeeds[4]).toBeCloseTo(5, 1)
    expect(result.displayedSpeeds.at(-1)).toBeCloseTo(5, 1)
  })

  it('does not use a position baseline longer than five seconds', () => {
    const result = simulateSpeed([
      { coordsSpeedKnots: null, positionSpeedKnots: 5 },
      { coordsSpeedKnots: null, positionSpeedKnots: 5, elapsedMs: 6000 },
    ])

    expect(result.positionSpeeds).toEqual([null, null])
    expect(result.displayedSpeeds).toEqual([null, null])
  })

  it('does not let one bad sample cause a large jump in final speedKnots', () => {
    const result = simulateSpeed([
      { coordsSpeedKnots: 5, positionSpeedKnots: 5 },
      { coordsSpeedKnots: 5, positionSpeedKnots: 5 },
      { coordsSpeedKnots: 5, positionSpeedKnots: 5 },
      { coordsSpeedKnots: 2, positionSpeedKnots: 2 },
      { coordsSpeedKnots: 5, positionSpeedKnots: 5 },
      { coordsSpeedKnots: 5, positionSpeedKnots: 5 },
      { coordsSpeedKnots: 5, positionSpeedKnots: 5 },
      { coordsSpeedKnots: 5, positionSpeedKnots: 5 },
      { coordsSpeedKnots: 5, positionSpeedKnots: 5 },
    ])
    const speedBeforeBadSample = result.displayedSpeeds[2]!
    const speedAtBadSample = result.displayedSpeeds[3]!

    expect(Math.abs(speedAtBadSample - speedBeforeBadSample)).toBeLessThanOrEqual(0.2)
    expect(result.displayedSpeeds.at(-1)).toBeCloseTo(5, 1)
  })
})
