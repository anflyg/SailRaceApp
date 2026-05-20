import { describe, expect, it } from 'vitest'
import {
  createInitialLaylineWarningState,
  getLaylineCountdownValue,
  stepLaylineWarningMachine,
} from './laylineWarningMachine'
import type { LaylineMachineInput } from './laylineWarningMachine'

function createTriggerInput(nowMs: number): LaylineMachineInput {
  return {
    nowMs,
    timeToTackSeconds: 10,
    laylineVariant: 'plus-alpha',
    postTackHeadingDegrees: 90,
    currentCogDegrees: 10,
    movingTowardTarget: true,
  }
}

describe('laylineWarningMachine', () => {
  it('tidsankrar countdown till predikterad slagtid och kan starta på 9', () => {
    let state = createInitialLaylineWarningState()
    const firstHit = createTriggerInput(0)
    const secondHit = { ...createTriggerInput(500), timeToTackSeconds: 9.4 }
    const thirdHit = { ...createTriggerInput(1_000), timeToTackSeconds: 8.8 }

    state = stepLaylineWarningMachine(state, firstHit).state
    state = stepLaylineWarningMachine(state, secondHit).state
    const triggered = stepLaylineWarningMachine(state, thirdHit)
    const triggeredState = triggered.state

    expect(triggered.didStartCountdown).toBe(true)
    expect(triggeredState.phase).toBe('countdown')
    expect(triggeredState.predictedTackAtMs).toBe(9_800)
    expect(getLaylineCountdownValue(triggeredState.predictedTackAtMs ?? 0, 1_000)).toBe(9)
  })

  it('visar 0 vid predictedTackAtMs och fortsätter till -5', () => {
    const predictedTackAtMs = 10_000

    expect(getLaylineCountdownValue(predictedTackAtMs, 9_001)).toBe(1)
    expect(getLaylineCountdownValue(predictedTackAtMs, 10_000)).toBe(0)
    expect(getLaylineCountdownValue(predictedTackAtMs, 10_001)).toBe(0)
    expect(getLaylineCountdownValue(predictedTackAtMs, 11_001)).toBe(-1)
    expect(getLaylineCountdownValue(predictedTackAtMs, 15_001)).toBe(-5)
  })

  it('triggar inte dubbelt på samma passage och kräver tydlig release innan ny trigger', () => {
    let state = createInitialLaylineWarningState()

    state = stepLaylineWarningMachine(state, createTriggerInput(0)).state
    expect(state.phase).toBe('idle')

    state = stepLaylineWarningMachine(state, createTriggerInput(100)).state
    expect(state.phase).toBe('idle')

    const thirdHit = stepLaylineWarningMachine(state, createTriggerInput(200))
    state = thirdHit.state
    expect(thirdHit.didStartCountdown).toBe(true)
    expect(state.phase).toBe('countdown')
    expect(state.predictedTackAtMs).toBe(10_200)

    const disturbedCountdown = stepLaylineWarningMachine(state, {
      nowMs: 1_200,
      timeToTackSeconds: null,
      laylineVariant: null,
      postTackHeadingDegrees: null,
      currentCogDegrees: null,
      movingTowardTarget: false,
    })
    state = disturbedCountdown.state
    expect(state.phase).toBe('countdown')

    const afterEnd = stepLaylineWarningMachine(state, {
      ...createTriggerInput(0),
      nowMs: 16_201,
    })
    state = afterEnd.state
    expect(state.phase).toBe('cooldown')

    for (let index = 0; index < 4; index += 1) {
      const stillSamePassage = stepLaylineWarningMachine(state, createTriggerInput(20_000 + index * 100))
      state = stillSamePassage.state
      expect(stillSamePassage.didStartCountdown).toBe(false)
      expect(state.phase).toBe('cooldown')
    }

    state = stepLaylineWarningMachine(state, {
      ...createTriggerInput(30_000),
      movingTowardTarget: false,
      timeToTackSeconds: null,
      laylineVariant: null,
      postTackHeadingDegrees: null,
    }).state
    expect(state.phase).toBe('cooldown')

    state = stepLaylineWarningMachine(state, {
      ...createTriggerInput(30_100),
      movingTowardTarget: false,
      timeToTackSeconds: null,
      laylineVariant: null,
      postTackHeadingDegrees: null,
    }).state
    expect(state.phase).toBe('cooldown')

    state = stepLaylineWarningMachine(state, {
      ...createTriggerInput(30_200),
      movingTowardTarget: false,
      timeToTackSeconds: null,
      laylineVariant: null,
      postTackHeadingDegrees: null,
    }).state
    expect(state.phase).toBe('idle')

    state = stepLaylineWarningMachine(state, createTriggerInput(31_000)).state
    state = stepLaylineWarningMachine(state, createTriggerInput(31_100)).state
    const retrigger = stepLaylineWarningMachine(state, createTriggerInput(31_200))
    expect(retrigger.didStartCountdown).toBe(true)
    expect(retrigger.state.phase).toBe('countdown')
  })
})
