import { describe, expect, it } from 'vitest'
import { calculatePositionCourseDegrees, createGpsCourseFusionState, fuseGpsCourseDegrees } from './gpsCourse'

const position = (latitude: number, longitude: number, timestamp: number, accuracyMeters = 2) => ({ latitude, longitude, timestamp, accuracyMeters })

describe('GPS course recovery', () => {
  it('derives a moving course and breaks a stale native course after consistent evidence', () => {
    const state = createGpsCourseFusionState()
    const first = position(59.3, 18, 0)
    const second = position(59.30002, 18.00002, 4000)
    const positionCourse = calculatePositionCourseDegrees(first, second, 4.5)
    expect(positionCourse).toBeCloseTo(27, 0)
    expect(fuseGpsCourseDegrees(310, positionCourse, 4.5, state)).toBe(310)
    expect(fuseGpsCourseDegrees(310, positionCourse, 4.5, state)).toBe(310)
    expect(fuseGpsCourseDegrees(310, positionCourse, 4.5, state)).toBeCloseTo(positionCourse!, 5)
  })

  it('rejects a single position outlier and a native spike', () => {
    const state = createGpsCourseFusionState()
    expect(fuseGpsCourseDegrees(45, null, 4.5, state)).toBe(45)
    expect(fuseGpsCourseDegrees(45, 220, 4.5, state)).toBe(45)
    expect(fuseGpsCourseDegrees(200, null, 4.5, state)).toBe(45)
  })

  it('handles wraparound and resets disagreement evidence on agreement', () => {
    const state = createGpsCourseFusionState()
    expect(fuseGpsCourseDegrees(359, 1, 4.5, state)).toBe(359)
    expect(fuseGpsCourseDegrees(359, 1, 4.5, state)).toBe(359)
    expect(fuseGpsCourseDegrees(1, 359, 4.5, state)).toBe(1)
  })

  it.each([
    ['low speed', 0.5, 4],
    ['poor accuracy', 4.5, 30],
  ])('rejects %s position course', (_label, speed, accuracy) => {
    expect(calculatePositionCourseDegrees(position(59.3, 18, 0), position(59.3001, 18, 4000, accuracy), speed)).toBeNull()
  })
})
