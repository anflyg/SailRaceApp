import { describe, expect, it } from 'vitest'
import {
  createInitialLaylineWarningState,
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
    expect(state.countdownStartedAtMs).toBe(200)

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
      nowMs: 200 + 16_100,
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
