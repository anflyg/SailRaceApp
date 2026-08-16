import { describe, expect, it } from 'vitest'
import {
  calculatePositionSpeedKnots,
  createGpsSpeedFusionState,
  filterGpsSpeedKnots,
  fuseGpsSpeedKnots,
  GPS_SPEED_LAST_KNOWN_GRACE_MS,
  GPS_SPEED_MAX_POSITION_BASELINE_MS,
  GPS_SPEED_MIN_POSITION_BASELINE_MS,
  isReliableGpsSpeedPosition,
  keepLastKnownGpsSpeedKnots,
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
  const fusionState = createGpsSpeedFusionState()
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
      fusionState,
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
  it('keeps a 0.4 kn coords speed visible below the course reliability threshold', () => {
    const result = simulateSpeed([{ coordsSpeedKnots: 0.4, positionSpeedKnots: 0.4 }])

    expect(result.displayedSpeeds[0]).toBeCloseTo(0.4, 1)
  })

  it('keeps a 1.0 kn coords speed visible below the course reliability threshold', () => {
    const result = simulateSpeed([{ coordsSpeedKnots: 1.0, positionSpeedKnots: 1.0 }])

    expect(result.displayedSpeeds[0]).toBeCloseTo(1.0, 1)
  })

  it('keeps a 1.4 kn coords speed visible below the course reliability threshold', () => {
    const result = simulateSpeed([{ coordsSpeedKnots: 1.4, positionSpeedKnots: 1.4 }])

    expect(result.displayedSpeeds[0]).toBeCloseTo(1.4, 1)
  })

  it('keeps the last stable low speed through a brief dropout', () => {
    const result = simulateSpeed([
      { coordsSpeedKnots: 0.8, positionSpeedKnots: 0.8 },
      { coordsSpeedKnots: 0.8, positionSpeedKnots: 0.8 },
    ])
    const lastKnownSpeed = result.displayedSpeeds.at(-1)!

    expect(
      keepLastKnownGpsSpeedKnots(null, { speedKnots: lastKnownSpeed, observedAt: 1_000 }, 4_999),
    ).toBeCloseTo(0.8, 1)
  })

  it('keeps the last stable sailing speed through a brief dropout', () => {
    const result = simulateSpeed([
      { coordsSpeedKnots: 5, positionSpeedKnots: 5 },
      { coordsSpeedKnots: 5, positionSpeedKnots: 5 },
    ])
    const lastKnownSpeed = result.displayedSpeeds.at(-1)!

    expect(
      keepLastKnownGpsSpeedKnots(null, { speedKnots: lastKnownSpeed, observedAt: 1_000 }, 4_999),
    ).toBeCloseTo(5, 1)
  })

  it('clears the displayed speed after the last-known-speed grace period', () => {
    expect(
      keepLastKnownGpsSpeedKnots(
        null,
        { speedKnots: 5, observedAt: 1_000 },
        1_000 + GPS_SPEED_LAST_KNOWN_GRACE_MS + 1,
      ),
    ).toBeNull()
  })

  it('treats zero knots as a valid displayed speed', () => {
    expect(filterGpsSpeedKnots([0, null])).toBe(0)
    expect(
      keepLastKnownGpsSpeedKnots(0, { speedKnots: 5, observedAt: 1_000 }, 2_000),
    ).toBe(0)
  })

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

  it('recovers from persistently stale low native speed using reliable position movement', () => {
    const result = simulateSpeed(Array.from({ length: 15 }, () => ({
      coordsSpeedKnots: 1.2,
      positionSpeedKnots: 4.5,
      accuracyMeters: 2,
    })))
    const firstReliablePositionSpeed = result.positionSpeeds.findIndex((speed) => speed !== null)

    expect(firstReliablePositionSpeed).toBeGreaterThanOrEqual(0)
    expect(result.displayedSpeeds.at(-1)).toBeGreaterThanOrEqual(4)
  })

  it('recovers from persistently stale high native speed', () => {
    const result = simulateSpeed(Array.from({ length: 15 }, () => ({ coordsSpeedKnots: 8, positionSpeedKnots: 4.5 })))
    expect(result.displayedSpeeds.at(-1)).toBeGreaterThanOrEqual(4)
    expect(result.displayedSpeeds.at(-1)).toBeLessThanOrEqual(5)
  })

  it('requires disagreement evidence to keep the same direction and resets on agreement', () => {
    const state = createGpsSpeedFusionState()
    expect(fuseGpsSpeedKnots(1.2, 4.5, 1.2, state)).toBe(1.2)
    expect(fuseGpsSpeedKnots(1.2, 4.5, 1.2, state)).toBe(1.2)
    expect(fuseGpsSpeedKnots(8, 4.5, 1.2, state)).toBe(1.2)
    expect(state.disagreementCount).toBe(1)
    expect(fuseGpsSpeedKnots(4.5, 4.5, 1.2, state)).toBeCloseTo(4.5, 5)
    expect(state.disagreementCount).toBe(0)
  })

  it('uses native speed when position speed is missing', () => {
    expect(fuseGpsSpeedKnots(4.5, null, 1.2)).toBe(4.5)
  })
})
