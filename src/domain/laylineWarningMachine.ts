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
  countdownStartedAtMs: number | null
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
    countdownStartedAtMs: null,
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
  if (state.phase === 'countdown' && state.countdownStartedAtMs !== null) {
    if (getLaylineCountdownValue(state.countdownStartedAtMs, input.nowMs) < LAYLINE_WARNING_END_SECONDS) {
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

    if (stableTriggerHits >= LAYLINE_TRIGGER_STABLE_UPDATES) {
      return {
        didStartCountdown: true,
        state: {
          phase: 'countdown',
          stableTriggerHits: 0,
          countdownStartedAtMs: input.nowMs,
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

export function getLaylineCountdownValue(countdownStartedAtMs: number, nowMs: number): number {
  const elapsedSeconds = (nowMs - countdownStartedAtMs) / 1000

  return LAYLINE_WARNING_START_SECONDS - Math.floor(Math.max(0, elapsedSeconds))
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
