import { describe, expect, it } from 'vitest'
import {
  MAX_COURSE_DEVIATION_FOR_WIND_ESTIMATE_DEGREES,
  createWindInstrumentState,
  clampWindShiftScalePosition,
  getWindRelativeCourseDegrees,
  stepWindInstrument,
  type WindInstrumentInput,
  type WindInstrumentOutput,
} from './windShiftInstrument'
import { normalizeDegrees } from './angles'

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
    startGunTimeMs: 0,
    ...overrides,
  }
}

function feed(
  state: ReturnType<typeof createWindInstrumentState>,
  input: WindInstrumentInput,
): WindInstrumentOutput {
  return stepWindInstrument(state, input)
}

function normalizeExpectedWind(tack: 'port' | 'starboard', deviation: number): number {
  return normalizeDegrees(WIND + (tack === 'port' ? -deviation : deviation))
}

function establish(tack: 'port' | 'starboard' = 'port', start = 100_000) {
  const heading = tack === 'starboard' ? 135 : 225
  let output = feed(createWindInstrumentState(), sample(start, heading))
  for (let second = 1; second <= 35; second += 1) {
    output = feed(output.state, sample(start + second * 1_000, heading))
  }
  return { output, heading, nextTime: start + 35_000 }
}

describe('wind shift and tack instrument', () => {
  it('centers approved wind before the gun and uses only post-gun samples for the first reference', () => {
    let output = feed(createWindInstrumentState(), sample(100_000, 135, { startGunTimeMs: null }))
    for (let second = 1; second <= 40; second += 1) {
      output = feed(output.state, sample(100_000 + second * 1_000, second % 2 ? 135 : 225, { startGunTimeMs: null }))
      expect(output.scalePositionDegrees).toBe(0)
      expect(output.liftDots + output.headerDots).toBe(0)
      expect(output.state.phase).toBe('seeking')
    }
    output = feed(output.state, sample(140_000, 135, { startGunTimeMs: 141_000 }))
    expect(output.state.candidateSinceMs).toBeNull()
    for (let second = 0; second <= 35; second += 1) {
      output = feed(output.state, sample(141_000 + second * 1_000, 135, { startGunTimeMs: 141_000 }))
      if (second < 35) expect(output.scalePositionDegrees).toBe(0)
    }
    expect(output.state.lockedCourseReferenceDegrees).toBe(135)
    expect(output.isReferenced).toBe(true)
    const lift = feed(output.state, sample(177_000, 145, { startGunTimeMs: 141_000 }))
    expect(lift.scalePositionDegrees).toBe(10)
    expect(lift.liftDots).toBe(1)
    const header = feed(lift.state, sample(178_000, 125, { startGunTimeMs: 141_000 }))
    expect(header.scalePositionDegrees).toBe(-10)
    expect(header.headerDots).toBe(1)
  })

  it('starts acquisition when a usable wind reference arrives after the gun', () => {
    let output = feed(createWindInstrumentState(), sample(100_000, 135, { windHeadingDegrees: null, startGunTimeMs: 90_000 }))
    expect(output.scalePositionDegrees).toBeNull()
    for (let second = 1; second <= 36; second += 1) {
      output = feed(output.state, sample(100_000 + second * 1_000, 135, { startGunTimeMs: 90_000 }))
    }
    expect(output.isReferenced).toBe(true)
    expect(output.state.tack).toBe('starboard')
  })

  it('freezes at both inclusive beam boundaries and requires a fresh reference after hysteresis', () => {
    for (const boundary of [90, 270]) {
      const initial = establish('starboard')
      const lifted = feed(initial.output.state, sample(initial.nextTime + 1_000, 145))
      const wind = lifted.estimatedWindHeadingDegrees!
      let output = feed(lifted.state, sample(initial.nextTime + 2_000, normalizeDegrees(wind + boundary)))
      expect(output.scalePositionDegrees).toBe(10)
      expect(output.liftDots + output.headerDots).toBe(0)
      expect(output.state.excluded).toBe(true)
      output = feed(output.state, sample(initial.nextTime + 3_000, normalizeDegrees(wind + (boundary === 90 ? 86 : 274))))
      expect(output.state.excluded).toBe(true)
      output = feed(output.state, sample(initial.nextTime + 4_000, 145))
      expect(output.state.phase).toBe('seeking')
      expect(output.scalePositionDegrees).toBe(10)
      for (let second = 5; second <= 39; second += 1) {
        output = feed(output.state, sample(initial.nextTime + second * 1_000, 145))
      }
      expect(output.isReferenced).toBe(true)
      expect(output.state.lockedCourseReferenceDegrees).toBe(145)
    }
  })

  it('holds the accepted marker through unreliable GPS, ending and a new race', () => {
    const initial = establish('starboard')
    const lifted = feed(initial.output.state, sample(initial.nextTime + 1_000, 145))
    const lost = feed(lifted.state, sample(initial.nextTime + 2_000, 0, { courseReliable: false }))
    expect(lost.scalePositionDegrees).toBe(10)
    expect(lost.liftDots + lost.headerDots).toBe(0)
    const ended = feed(lost.state, sample(initial.nextTime + 3_000, 135, { startGunTimeMs: null }))
    expect(ended.scalePositionDegrees).toBe(10)
    expect(ended.isReferenced).toBe(false)
    const newRace = feed(createWindInstrumentState(), sample(initial.nextTime + 4_000, 135, { startGunTimeMs: null }))
    expect(newRace.scalePositionDegrees).toBe(0)
    expect(newRace.state.phase).toBe('seeking')
  })

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
    expect(port.output.state.lockedCourseReferenceDegrees).toBe(225)
    expect(starboard.output.state.lockedCourseReferenceDegrees).toBe(135)
  })

  it('uses a circular mean across 359° and 0°', () => {
    let state = createWindInstrumentState()
    const start = 50_000
    for (let second = 0; second <= 35; second += 1) {
      state = feed(state, sample(start + second * 1_000, second % 2 === 0 ? 359 : 1, { windHeadingDegrees: 314 })).state
    }
    expect(state.tack).toBe('port')
    expect(state.lockedCourseReferenceDegrees).toBeCloseTo(0, 0)
  })

  it('uses the agreed starboard/port headings and shows lift/header colors correctly', () => {
    const port = establish('port')
    const portLift = feed(port.output.state, sample(port.nextTime + 1_000, 219.5))
    const portHeader = feed(port.output.state, sample(port.nextTime + 1_000, 235))
    const starboard = establish('starboard', 200_000)
    const starboardLift = feed(starboard.output.state, sample(starboard.nextTime + 1_000, 145))
    const starboardHeader = feed(starboard.output.state, sample(starboard.nextTime + 1_000, 129.5))
    expect(portLift.liftDots).toBe(1)
    expect(portHeader.headerDots).toBe(1)
    expect(starboardLift.liftDots).toBe(1)
    expect(starboardHeader.headerDots).toBe(1)
  })

  it('updates through 35° on both tacks and does not infer a tack at 30° or 35°', () => {
    expect(MAX_COURSE_DEVIATION_FOR_WIND_ESTIMATE_DEGREES).toBe(35)
    for (const tack of ['port', 'starboard'] as const) {
      const initial = establish(tack, tack === 'port' ? 100_000 : 200_000)
      const towardOpposite = tack === 'port' ? -1 : 1
      let at30 = feed(initial.output.state, sample(initial.nextTime + 1_000, initial.heading + towardOpposite * 30))
      expect(at30.state.phase).toBe('steady')
      expect(at30.estimatedWindHeadingDegrees).toBe(normalizeExpectedWind(tack, 30))
      const at35 = feed(at30.state, sample(initial.nextTime + 2_000, initial.heading + towardOpposite * 35))
      expect(at35.state.phase).toBe('steady')
      expect(at35.estimatedWindHeadingDegrees).toBe(normalizeExpectedWind(tack, 35))
      expect(at35.scalePositionDegrees).toBe(tack === 'port' ? -30 : 30)
      expect(clampWindShiftScalePosition(35)).toBe(30)
      expect(clampWindShiftScalePosition(-35)).toBe(-30)
      const at36 = feed(at35.state, sample(initial.nextTime + 3_000, initial.heading + towardOpposite * 36))
      expect(at36.state.phase).toBe('transition')
      expect(at36.estimatedWindHeadingDegrees).toBe(at35.estimatedWindHeadingDegrees)
    }
  })

  it('does not begin a transition above 35° when the course is moving away from the opposite tack', () => {
    for (const tack of ['port', 'starboard'] as const) {
      const initial = establish(tack, tack === 'port' ? 100_000 : 200_000)
      const awayFromOpposite = tack === 'port' ? 1 : -1
      const output = feed(initial.output.state, sample(initial.nextTime + 1_000, initial.heading + awayFromOpposite * 36))
      expect(output.state.phase).toBe('steady')
      expect(output.state.tack).toBe(tack)
    }
  })

  it('cancels an aborted tack and never commits a large course change that does not settle opposite', () => {
    for (const tack of ['port', 'starboard'] as const) {
      const initial = establish(tack, tack === 'port' ? 100_000 : 200_000)
      const t = initial.nextTime
      const direction = tack === 'port' ? -1 : 1
      const beyondLimit = initial.heading + direction * 36
      let state = feed(initial.output.state, sample(t + 1_000, beyondLimit)).state
      expect(state.phase).toBe('transition')
      state = feed(state, sample(t + 2_000, initial.heading)).state
      expect(state.phase).toBe('steady')
      expect(state.tack).toBe(tack)

      state = feed(state, sample(t + 3_000, beyondLimit)).state
      for (let second = 4; second <= 50; second += 1) {
        state = feed(state, sample(t + second * 1_000, beyondLimit)).state
      }
      expect(state.tack).toBe(tack)
    }
  })

  it('confirms the opposite stable tack, turns cues off, and restarts reference establishment', () => {
    for (const oldTack of ['port', 'starboard'] as const) {
      const initial = establish(oldTack, oldTack === 'port' ? 100_000 : 200_000)
      const newTack = oldTack === 'port' ? 'starboard' : 'port'
      const target = newTack === 'starboard' ? 135 : 225
      const direction = oldTack === 'port' ? -1 : 1
      const heldWindEstimate = oldTack === 'port' ? 145 : 215
      const t = initial.nextTime
      let state = initial.output.state

      for (let second = 1; second <= 18; second += 1) {
        state = feed(state, sample(t + second * 1_000, initial.heading + direction * Math.min(second * 5, 90))).state
      }
      for (let second = 19; second <= 23; second += 1) {
        state = feed(state, sample(t + second * 1_000, target)).state
      }

      expect(state.phase).toBe('establishing')
      expect(state.tack).toBe(newTack)
      expect(state.estimatedWindHeadingDegrees).toBe(heldWindEstimate)
      const inactive = feed(state, sample(t + 24_000, target))
      expect(inactive.liftDots).toBe(0)
      expect(inactive.headerDots).toBe(0)
      expect(inactive.estimatedWindHeadingDegrees).toBe(heldWindEstimate)

      let settled = inactive.state
      for (let second = 25; second <= 53; second += 1) {
        settled = feed(settled, sample(t + second * 1_000, target)).state
      }
      expect(settled.phase).toBe('steady')
      expect(settled.lockedCourseReferenceDegrees).toBe(target)
      expect(settled.estimatedWindHeadingDegrees).toBe(180)
    }
  })

  it('can confirm the opposite stable tack when the wind corridor GPS sample is unavailable', () => {
    const initial = establish('port')
    const t = initial.nextTime
    let state = feed(initial.output.state, sample(t + 1_000, 180, { courseReliable: false })).state
    for (let second = 2; second <= 7; second += 1) {
      state = feed(state, sample(t + second * 1_000, 135)).state
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
