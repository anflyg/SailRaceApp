import { shortestAngleDeltaDegrees } from './angles'
import type { LaylineVariant } from '../types'

export const LAYLINE_WARNING_START_SECONDS = 10
export const LAYLINE_WARNING_END_SECONDS = -5
export const LAYLINE_TRIGGER_TOLERANCE_SECONDS = 1.2
export const LAYLINE_TRIGGER_STABLE_UPDATES = 3
export const LAYLINE_CLEAR_DISTANCE_SECONDS = 14
export const LAYLINE_CLEAR_COG_DELTA_DEGREES = 20
export const LAYLINE_CLEAR_STABLE_UPDATES = 3

export type LaylineWarningPhase = 'idle' | 'countdown' | 'cooldown'

export interface LaylineWarningState {
  phase: LaylineWarningPhase
  stableTriggerHits: number
  predictedTackAtMs: number | null
  countdownReferenceCogDegrees: number | null
  countdownLaylineVariant: LaylineVariant | null
  countdownPostTackHeadingDegrees: number | null
  cooldownReleaseHits: number
}

export interface LaylineMachineInput {
  nowMs: number
  timeToTackSeconds: number | null
  laylineVariant: LaylineVariant | null
  postTackHeadingDegrees: number | null
  currentCogDegrees: number | null
  movingTowardTarget: boolean
}

export interface LaylineMachineStepResult {
  state: LaylineWarningState
  didStartCountdown: boolean
}

export function createInitialLaylineWarningState(): LaylineWarningState {
  return {
    phase: 'idle',
    stableTriggerHits: 0,
    predictedTackAtMs: null,
    countdownReferenceCogDegrees: null,
    countdownLaylineVariant: null,
    countdownPostTackHeadingDegrees: null,
    cooldownReleaseHits: 0,
  }
}

export function stepLaylineWarningMachine(
  state: LaylineWarningState,
  input: LaylineMachineInput,
): LaylineMachineStepResult {
  if (state.phase === 'countdown' && state.predictedTackAtMs !== null) {
    if (getLaylineCountdownValue(state.predictedTackAtMs, input.nowMs) < LAYLINE_WARNING_END_SECONDS) {
      return {
        didStartCountdown: false,
        state: {
          ...state,
          phase: 'cooldown',
          cooldownReleaseHits: 0,
        },
      }
    }

    return {
      state,
      didStartCountdown: false,
    }
  }

  if (state.phase === 'cooldown') {
    const canRelease = shouldReleaseCooldown(state, input)
    const cooldownReleaseHits = canRelease ? state.cooldownReleaseHits + 1 : 0

    if (cooldownReleaseHits >= LAYLINE_CLEAR_STABLE_UPDATES) {
      return {
        didStartCountdown: false,
        state: createInitialLaylineWarningState(),
      }
    }

    return {
      didStartCountdown: false,
      state: {
        ...state,
        cooldownReleaseHits,
      },
    }
  }

  if (shouldTrigger(input)) {
    const stableTriggerHits = state.stableTriggerHits + 1

    if (stableTriggerHits >= LAYLINE_TRIGGER_STABLE_UPDATES && input.timeToTackSeconds !== null) {
      const predictedTackAtMs = input.nowMs + input.timeToTackSeconds * 1000

      return {
        didStartCountdown: true,
        state: {
          phase: 'countdown',
          stableTriggerHits: 0,
          predictedTackAtMs,
          countdownReferenceCogDegrees: input.currentCogDegrees,
          countdownLaylineVariant: input.laylineVariant,
          countdownPostTackHeadingDegrees: input.postTackHeadingDegrees,
          cooldownReleaseHits: 0,
        },
      }
    }

    return {
      didStartCountdown: false,
      state: {
        ...state,
        stableTriggerHits,
      },
    }
  }

  return {
    didStartCountdown: false,
    state: {
      ...state,
      stableTriggerHits: 0,
    },
  }
}

export function getLaylineCountdownValue(predictedTackAtMs: number, nowMs: number): number {
  const secondsToTack = Math.ceil((predictedTackAtMs - nowMs) / 1000)

  return secondsToTack === 0 ? 0 : secondsToTack
}

function shouldTrigger(input: LaylineMachineInput): boolean {
  if (!input.movingTowardTarget || input.timeToTackSeconds === null || input.laylineVariant === null) {
    return false
  }

  return Math.abs(input.timeToTackSeconds - LAYLINE_WARNING_START_SECONDS) <= LAYLINE_TRIGGER_TOLERANCE_SECONDS
}

function shouldReleaseCooldown(state: LaylineWarningState, input: LaylineMachineInput): boolean {
  if (!input.movingTowardTarget || input.timeToTackSeconds === null || input.timeToTackSeconds > LAYLINE_CLEAR_DISTANCE_SECONDS) {
    return true
  }

  if (state.countdownReferenceCogDegrees === null || input.currentCogDegrees === null) {
    return false
  }

  return Math.abs(shortestAngleDeltaDegrees(input.currentCogDegrees, state.countdownReferenceCogDegrees))
    >= LAYLINE_CLEAR_COG_DELTA_DEGREES
}
