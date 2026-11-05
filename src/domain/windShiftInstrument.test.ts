import { describe, expect, it } from 'vitest'
import {
  createWindInstrumentState,
  clampWindShiftScalePosition,
  getWindRelativeCourseDegrees,
  stepWindInstrument,
  type WindInstrumentInput,
  type WindInstrumentOutput,
} from './windShiftInstrument'

const WIND = 180
const ALPHA = 90

function sample(
  timestamp: number,
  courseDegrees: number,
  overrides: Partial<WindInstrumentInput> = {},
): WindInstrumentInput {
  return {
    nowMs: timestamp,
    timestamp,
    courseDegrees,
    courseReliable: true,
    windHeadingDegrees: WIND,
    windReferenceFrame: 'true-north',
    alphaDegrees: ALPHA,
    ...overrides,
  }
}

function feed(
  state: ReturnType<typeof createWindInstrumentState>,
  input: WindInstrumentInput,
): WindInstrumentOutput {
  return stepWindInstrument(state, input)
}

function establish(tack: 'port' | 'starboard' = 'port', start = 100_000) {
  const heading = tack === 'port' ? 135 : 225
  let output = feed(createWindInstrumentState(), sample(start, heading))
  for (let second = 1; second <= 35; second += 1) {
    output = feed(output.state, sample(start + second * 1_000, heading))
  }
  return { output, heading, nextTime: start + 35_000 }
}

describe('wind shift and tack instrument', () => {
  it('computes the approved wind-relative compass orientation', () => {
    expect(getWindRelativeCourseDegrees(135, 180)).toBe(135)
    expect(getWindRelativeCourseDegrees(180, 180)).toBe(180)
    expect(getWindRelativeCourseDegrees(225, 180)).toBe(225)
    expect(getWindRelativeCourseDegrees(0, 180)).toBe(0)
    expect(getWindRelativeCourseDegrees(359, 0)).toBe(179)
  })
  it('confirms either first tack and locks the circular mean after the 30-second setup', () => {
    const port = establish('port')
    const starboard = establish('starboard')
    expect(port.output.state.tack).toBe('port')
    expect(starboard.output.state.tack).toBe('starboard')
    expect(port.output.isReferenced).toBe(true)
    expect(starboard.output.isReferenced).toBe(true)
    expect(port.output.state.lockedCourseReferenceDegrees).toBe(135)
    expect(starboard.output.state.lockedCourseReferenceDegrees).toBe(225)
  })

  it('uses a circular mean across 359° and 0°', () => {
    let state = createWindInstrumentState()
    const start = 50_000
    for (let second = 0; second <= 35; second += 1) {
      state = feed(state, sample(start + second * 1_000, second % 2 === 0 ? 359 : 1, { windHeadingDegrees: 45 })).state
    }
    expect(state.tack).toBe('port')
    expect(state.lockedCourseReferenceDegrees).toBeCloseTo(0, 0)
  })

  it('shows lift and header in the expected direction for both tacks', () => {
    const port = establish('port')
    const portLift = feed(port.output.state, sample(port.nextTime + 1_000, 129.5))
    const portHeader = feed(port.output.state, sample(port.nextTime + 1_000, 140.5))
    const starboard = establish('starboard', 200_000)
    const starboardLift = feed(starboard.output.state, sample(starboard.nextTime + 1_000, 230.5))
    const starboardHeader = feed(starboard.output.state, sample(starboard.nextTime + 1_000, 219.5))
    expect(portLift.liftDots).toBe(1)
    expect(portHeader.headerDots).toBe(1)
    expect(starboardLift.liftDots).toBe(1)
    expect(starboardHeader.headerDots).toBe(1)
  })

  it('keeps a 25° wind shift on the same tack and clamps the scale marker', () => {
    const initial = establish('port')
    const shifted = feed(initial.output.state, sample(initial.nextTime + 1_000, 160))
    expect(shifted.state.phase).toBe('steady')
    expect(shifted.state.tack).toBe('port')
    expect(shifted.estimatedWindHeadingDegrees).toBe(205)
    expect(shifted.scalePositionDegrees).toBe(25)
    const clamped = feed(shifted.state, sample(initial.nextTime + 2_000, 170))
    expect(clamped.state.phase).toBe('transition')
    expect(clamped.scalePositionDegrees).toBe(25)
    expect(clampWindShiftScalePosition(35)).toBe(30)
    expect(clampWindShiftScalePosition(-35)).toBe(-30)

    let state = shifted.state
    for (let degree = 165, second = 2; degree <= 250; degree += 5, second += 1) {
      state = feed(state, sample(initial.nextTime + second * 1_000, degree)).state
    }
    for (let second = 21; second <= 26; second += 1) {
      state = feed(state, sample(initial.nextTime + second * 1_000, 250)).state
    }
    expect(state.phase).toBe('establishing')
    expect(state.tack).toBe('starboard')
    for (let second = 27; second <= 54; second += 1) {
      state = feed(state, sample(initial.nextTime + second * 1_000, 250)).state
    }
    expect(state.phase).toBe('steady')
    expect(state.lockedCourseReferenceDegrees).toBe(250)
    expect(state.tackWindHeadingDegrees).toBe(205)
  })

  it('does not commit an aborted tack or a large course change that never settles opposite', () => {
    const initial = establish('port')
    const t = initial.nextTime
    let state = feed(initial.output.state, sample(t + 1_000, 180)).state
    state = feed(state, sample(t + 2_000, 195)).state
    state = feed(state, sample(t + 3_000, 180)).state
    state = feed(state, sample(t + 4_000, 155)).state
    state = feed(state, sample(t + 5_000, 140)).state
    expect(state.phase).toBe('steady')
    expect(state.tack).toBe('port')

    state = feed(state, sample(t + 6_000, 270)).state
    for (let second = 7; second <= 52; second += 1) {
      state = feed(state, sample(t + second * 1_000, 270)).state
    }
    expect(state.tack).toBe('port')
    expect(state.phase).toBe('steady')
  })

  it('confirms the opposite stable tack, turns cues off, and restarts reference establishment', () => {
    const initial = establish('port')
    const t = initial.nextTime
    let state = initial.output.state
    for (let degree = 135, second = 1; degree <= 250; degree += 5, second += 1) {
      state = feed(state, sample(t + second * 1_000, degree)).state
    }
    for (let second = 25; second <= 30; second += 1) {
      state = feed(state, sample(t + second * 1_000, 250)).state
    }
    expect(state.phase).toBe('establishing')
    expect(state.tack).toBe('starboard')
    const inactive = feed(state, sample(t + 31_000, 250))
    expect(inactive.liftDots).toBe(0)
    expect(inactive.headerDots).toBe(0)
  })

  it('can confirm the opposite stable tack when the wind corridor GPS sample is unavailable', () => {
    const initial = establish('port')
    const t = initial.nextTime
    let state = feed(initial.output.state, sample(t + 1_000, 180, { courseReliable: false })).state
    for (let second = 2; second <= 7; second += 1) {
      state = feed(state, sample(t + second * 1_000, 225)).state
    }
    expect(state.phase).toBe('establishing')
    expect(state.tack).toBe('starboard')
  })

  it('applies ±0.5° hysteresis at dot thresholds', () => {
    const initial = establish('port')
    const t = initial.nextTime
    const ref = initial.heading
    expect(feed(initial.output.state, sample(t + 1_000, ref + 5)).headerDots).toBe(0)
    const entered = feed(initial.output.state, sample(t + 1_000, ref + 5.5))
    expect(entered.headerDots).toBe(1)
    const retained = feed(entered.state, sample(t + 2_000, ref + 4.6))
    expect(retained.headerDots).toBe(1)
    const exited = feed(retained.state, sample(t + 3_000, ref + 4.4))
    expect(exited.headerDots).toBe(0)
    const three = feed(exited.state, sample(t + 4_000, ref - 15.5))
    expect(three.liftDots).toBe(3)
  })

  it('fails closed for missing, unreliable, stale, magnetic, mock, or unknown course references', () => {
    const initial = establish()
    for (const frame of ['magnetic-north', 'mock', undefined]) {
      const output = feed(initial.output.state, sample(initial.nextTime + 1_000, 130, { windReferenceFrame: frame }))
      expect(output.isReferenced).toBe(false)
      expect(output.estimatedWindHeadingDegrees).toBeNull()
    }
    const missingGps = feed(initial.output.state, sample(initial.nextTime + 1_000, 130, { courseReliable: false }))
    expect(missingGps.liftDots).toBe(0)
    const staleGps = feed(initial.output.state, sample(initial.nextTime + 10_000, 130, { nowMs: initial.nextTime + 20_000 }))
    expect(staleGps.liftDots).toBe(0)
    const missingWind = feed(initial.output.state, sample(initial.nextTime + 1_000, 130, { windHeadingDegrees: null }))
    expect(missingWind.isReferenced).toBe(false)
  })
})
