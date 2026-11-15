import { describe, expect, it } from 'vitest'
import { isFreshTacticalHeading, TacticalHeadingFilter } from './useTacticalHeading'

const sample = (degrees: number, motionTimestamp: number, ageMs = 0) => ({ valid: true, headingDegrees: degrees, motionTimestamp, ageMs })
describe('tactical Core Motion heading', () => {
  it('circularly filters oscillation across north independently of GPS', () => {
    const filter = new TacticalHeadingFilter()
    filter.add(sample(359, 1), 1000)
    const heading = filter.add(sample(1, 2), 2000)
    expect(Math.min(heading.degrees!, 360 - heading.degrees!)).toBeLessThan(0.1)
  })
  it('rejects invalid, old and repeated motion and recovers on a new sample', () => {
    const filter = new TacticalHeadingFilter()
    expect(filter.add(sample(45, 1), 1000).degrees).toBe(45)
    expect(filter.add(sample(45, 1, 900), 1900).timestamp).toBe(1000)
    expect(filter.add(sample(45, 1, 1001), 2100).degrees).toBeNull()
    expect(filter.add({ valid: false }, 2200).degrees).toBeNull()
    expect(filter.add(sample(60, 2), 2300).degrees).toBeCloseTo(60)
    expect(isFreshTacticalHeading({ degrees: 60, timestamp: 2300 }, 3801)).toBe(false)
    expect(isFreshTacticalHeading({ degrees: 60, timestamp: 2301 }, 2300)).toBe(false)
  })
})

it('feeds a stable wave-filtered reference, tack and sensor interruption into the existing instrument', async () => {
  const { createWindInstrumentState, stepWindInstrument } = await import('../domain/windShiftInstrument')
  const filter = new TacticalHeadingFilter()
  let state = createWindInstrumentState()
  let output = stepWindInstrument(state, { nowMs: 0, timestamp: null, courseDegrees: null, courseReliable: false, windHeadingDegrees: 180, windReferenceFrame: 'true-north', alphaDegrees: 90, startGunTimeMs: 0 })
  const tick = (seconds: number, degrees: number, valid = true) => {
    const time = seconds * 1000
    const heading = filter.add(valid ? sample(degrees, seconds) : { valid: false }, time)
    output = stepWindInstrument(state, { nowMs: time, timestamp: heading.timestamp, courseDegrees: heading.degrees, courseReliable: isFreshTacticalHeading(heading, time), windHeadingDegrees: 180, windReferenceFrame: 'true-north', alphaDegrees: 90, startGunTimeMs: 0 })
    state = output.state
  }
  for (let i = 1; i <= 38; i++) tick(i, 135 + (i % 2 ? 2 : -2))
  expect(state.phase).toBe('steady')
  for (let i = 39; i <= 48; i++) tick(i, 145)
  expect(output.liftDots).toBeGreaterThan(0)
  tick(49, 0, false)
  expect(output.liftDots).toBe(0)
  for (let i = 50; i <= 63; i++) tick(i, 225)
  expect(['transition', 'establishing']).toContain(state.phase)
  for (let i = 64; i <= 100; i++) tick(i, 225)
  expect(state.phase).toBe('steady')
  expect(state.tack).toBe('port')
})
