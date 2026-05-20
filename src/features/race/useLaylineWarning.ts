import { useEffect, useMemo, useState } from 'react'
import {
  computeLaylineCandidate,
  getLaylineReference,
  isHeadingTowardReference,
} from '../../domain/layline'
import {
  createInitialLaylineWarningState,
  getLaylineCountdownValue,
  LAYLINE_WARNING_END_SECONDS,
  stepLaylineWarningMachine,
} from '../../domain/laylineWarningMachine'
import type { CourseState, FilteredGpsReading, GeoPoint, LaylineVariant } from '../../types'

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
    const reference = getLaylineReference(course)
    const position = getPosition(gps)
    const currentCogDegrees = gps.courseReliable ? gps.courseDegrees : null
    const speedKnots = gps.speedKnots
    const movingTowardTarget = reference !== null &&
      currentCogDegrees !== null &&
      isHeadingTowardReference(currentCogDegrees, reference.headingDegrees)
    const candidate = enabled &&
      reference !== null &&
      position !== null &&
      currentCogDegrees !== null &&
      speedKnots !== null &&
      movingTowardTarget
      ? computeLaylineCandidate({
        position,
        currentCogDegrees,
        speedKnots,
        alphaDegrees,
        targetMark: reference.target,
      })
      : null

    return {
      movingTowardTarget,
      timeToTackSeconds: candidate?.timeToTackSeconds ?? null,
      laylineVariant: candidate?.laylineVariant ?? null,
      postTackHeadingDegrees: candidate?.postTackHeadingDegrees ?? null,
      currentCogDegrees,
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

    setMachineState((current) => {
      const nextStep = stepLaylineWarningMachine(current, {
        nowMs,
        timeToTackSeconds: laylineInput.timeToTackSeconds,
        laylineVariant: laylineInput.laylineVariant,
        postTackHeadingDegrees: laylineInput.postTackHeadingDegrees,
        currentCogDegrees: laylineInput.currentCogDegrees,
        movingTowardTarget: laylineInput.movingTowardTarget,
      })

      return areLaylineStatesEqual(current, nextStep.state) ? current : nextStep.state
    })
  }, [countdownClockMs, enabled, laylineInput, machineState.phase])

  const countdownValue = machineState.phase === 'countdown' && machineState.countdownStartedAtMs !== null
    ? Math.max(
      LAYLINE_WARNING_END_SECONDS,
      getLaylineCountdownValue(machineState.countdownStartedAtMs, countdownClockMs),
    )
    : null

  return {
    isActive: countdownValue !== null,
    countdownValue,
    laylineVariant: machineState.countdownLaylineVariant,
    postTackHeadingDegrees: machineState.countdownPostTackHeadingDegrees,
  }
}

function getPosition(gps: FilteredGpsReading): GeoPoint | null {
  if (gps.latitude === null || gps.longitude === null) {
    return null
  }

  return {
    latitude: gps.latitude,
    longitude: gps.longitude,
  }
}

function areLaylineStatesEqual(
  first: ReturnType<typeof createInitialLaylineWarningState>,
  second: ReturnType<typeof createInitialLaylineWarningState>,
): boolean {
  return first.phase === second.phase &&
    first.stableTriggerHits === second.stableTriggerHits &&
    first.countdownStartedAtMs === second.countdownStartedAtMs &&
    first.countdownReferenceCogDegrees === second.countdownReferenceCogDegrees &&
    first.countdownLaylineVariant === second.countdownLaylineVariant &&
    first.countdownPostTackHeadingDegrees === second.countdownPostTackHeadingDegrees &&
    first.cooldownReleaseHits === second.cooldownReleaseHits
}
