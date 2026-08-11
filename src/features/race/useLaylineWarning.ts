import { useEffect, useMemo, useRef, useState } from 'react'
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

interface LaylineWarningRuntimeState {
  machineState: ReturnType<typeof createInitialLaylineWarningState>
  countdownClockMs: number
}

export function useLaylineWarning({
  course,
  gps,
  enabled,
  alphaDegrees,
}: UseLaylineWarningInput): LaylineWarningResult {
  const [runtimeState, setRuntimeState] = useState<LaylineWarningRuntimeState>(() => ({
    machineState: createInitialLaylineWarningState(),
    countdownClockMs: Date.now(),
  }))
  const lastProcessedObservationTimestampRef = useRef<number | null>(null)
  const { machineState, countdownClockMs } = runtimeState

  useEffect(() => {
    if (machineState.phase !== 'countdown') {
      return
    }

    const intervalId = window.setInterval(() => {
      setRuntimeState((current) => current.machineState.phase === 'countdown'
        ? { ...current, countdownClockMs: Date.now() }
        : current)
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
      lastProcessedObservationTimestampRef.current = null
      setRuntimeState((current) => current.machineState.phase === 'idle'
        ? current
        : { ...current, machineState: createInitialLaylineWarningState() })
      return
    }

    const nowMs = machineState.phase === 'countdown' ? countdownClockMs : Date.now()
    const observationTimestamp = gps.presentationTimestamp ?? gps.timestamp
    const isObservationDrivenPhase = machineState.phase === 'idle' || machineState.phase === 'cooldown'

    if (
      isObservationDrivenPhase &&
      observationTimestamp !== null &&
      lastProcessedObservationTimestampRef.current === observationTimestamp
    ) {
      return
    }

    if (isObservationDrivenPhase && observationTimestamp !== null) {
      lastProcessedObservationTimestampRef.current = observationTimestamp
    }

    setRuntimeState((current) => {
      const nextStep = stepLaylineWarningMachine(current.machineState, {
        nowMs,
        timeToTackSeconds: laylineInput.timeToTackSeconds,
        laylineVariant: laylineInput.laylineVariant,
        postTackHeadingDegrees: laylineInput.postTackHeadingDegrees,
        currentCogDegrees: laylineInput.currentCogDegrees,
        movingTowardTarget: laylineInput.movingTowardTarget,
      })
      return {
        machineState: areLaylineStatesEqual(current.machineState, nextStep.state)
          ? current.machineState
          : nextStep.state,
        countdownClockMs: nextStep.didStartCountdown ? nowMs : current.countdownClockMs,
      }
    })
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
