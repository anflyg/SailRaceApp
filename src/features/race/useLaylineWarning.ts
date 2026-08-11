import { useEffect, useMemo, useState } from 'react'
import {
  createInitialLaylineWarningState,
  getLaylineCountdownValue,
  LAYLINE_WARNING_END_SECONDS,
  stepLaylineWarningMachine,
} from '../../domain/laylineWarningMachine'
import type { CourseState, FilteredGpsReading, LaylineVariant } from '../../types'
import { getLaylineObservation } from './laylineObservation'

interface UseLaylineWarningInput {
  course: CourseState
  gps: FilteredGpsReading
  enabled: boolean
  alphaDegrees: number
}

export interface LaylineWarningResult {
  isActive: boolean
  countdownValue: number | null
  laylineVariant: LaylineVariant | null
  postTackHeadingDegrees: number | null
}

export function useLaylineWarning({
  course,
  gps,
  enabled,
  alphaDegrees,
}: UseLaylineWarningInput): LaylineWarningResult {
  const [machineState, setMachineState] = useState(createInitialLaylineWarningState)
  const [countdownClockMs, setCountdownClockMs] = useState(() => Date.now())

  useEffect(() => {
    if (machineState.phase !== 'countdown') {
      return
    }

    const intervalId = window.setInterval(() => {
      setCountdownClockMs(Date.now())
    }, 250)

    return () => window.clearInterval(intervalId)
  }, [machineState.phase])

  const laylineInput = useMemo(() => {
    const observation = getLaylineObservation({ course, gps, enabled, alphaDegrees })

    return {
      movingTowardTarget: observation.movingTowardTarget,
      timeToTackSeconds: observation.candidate?.timeToTackSeconds ?? null,
      laylineVariant: observation.candidate?.laylineVariant ?? null,
      postTackHeadingDegrees: observation.candidate?.postTackHeadingDegrees ?? null,
      currentCogDegrees: observation.currentCogDegrees,
    }
  }, [alphaDegrees, course, enabled, gps])

  useEffect(() => {
    if (!enabled) {
      setMachineState((current) => (
        current.phase === 'idle' ? current : createInitialLaylineWarningState()
      ))
      return
    }

    const nowMs = machineState.phase === 'countdown' ? countdownClockMs : Date.now()
    let didStartCountdown = false

    setMachineState((current) => {
      const nextStep = stepLaylineWarningMachine(current, {
        nowMs,
        timeToTackSeconds: laylineInput.timeToTackSeconds,
        laylineVariant: laylineInput.laylineVariant,
        postTackHeadingDegrees: laylineInput.postTackHeadingDegrees,
        currentCogDegrees: laylineInput.currentCogDegrees,
        movingTowardTarget: laylineInput.movingTowardTarget,
      })
      didStartCountdown = nextStep.didStartCountdown

      return areLaylineStatesEqual(current, nextStep.state) ? current : nextStep.state
    })

    if (didStartCountdown) {
      setCountdownClockMs(nowMs)
    }
  }, [countdownClockMs, enabled, laylineInput, machineState.phase])

  const countdownValue = machineState.phase === 'countdown' && machineState.predictedTackAtMs !== null
    ? Math.max(
      LAYLINE_WARNING_END_SECONDS,
      getLaylineCountdownValue(machineState.predictedTackAtMs, countdownClockMs),
    )
    : null

  return {
    isActive: countdownValue !== null,
    countdownValue,
    laylineVariant: machineState.countdownLaylineVariant,
    postTackHeadingDegrees: machineState.countdownPostTackHeadingDegrees,
  }
}

function areLaylineStatesEqual(
  first: ReturnType<typeof createInitialLaylineWarningState>,
  second: ReturnType<typeof createInitialLaylineWarningState>,
): boolean {
  return first.phase === second.phase &&
    first.stableTriggerHits === second.stableTriggerHits &&
    first.predictedTackAtMs === second.predictedTackAtMs &&
    first.countdownReferenceCogDegrees === second.countdownReferenceCogDegrees &&
    first.countdownLaylineVariant === second.countdownLaylineVariant &&
    first.countdownPostTackHeadingDegrees === second.countdownPostTackHeadingDegrees &&
    first.cooldownReleaseHits === second.cooldownReleaseHits
}
