import {
  averageAnglesDegrees,
  getCircularSpreadDegrees,
  normalizeDegrees,
  shortestAngleDeltaDegrees,
} from './angles'

export type SailingTack = 'port' | 'starboard'
export type WindInstrumentPhase = 'seeking' | 'establishing' | 'steady' | 'transition'

export const TACK_CONFIRMATION_MS = 5_000
export const REFERENCE_SETTLING_MS = 20_000
export const REFERENCE_ESTABLISHMENT_MS = 30_000
export const COURSE_SAMPLE_MAX_AGE_MS = 5_000
export const TACK_SECTOR_TOLERANCE_DEGREES = 15
export const TACK_TRANSITION_TIMEOUT_MS = 45_000
export const MAX_COURSE_DEVIATION_FOR_WIND_ESTIMATE_DEGREES = 35
export const MAX_TACK_TARGET_WIND_SHIFT_DEGREES = 35
export const REFERENCE_MINIMUM_SAMPLES = 5
export const REFERENCE_MAXIMUM_SPREAD_DEGREES = 10
export const INDICATOR_THRESHOLDS_DEGREES = [5, 10, 15] as const
export const INDICATOR_HYSTERESIS_DEGREES = 0.5

export interface WindInstrumentInput {
  nowMs: number
  timestamp: number | null
  courseDegrees: number | null
  courseReliable: boolean
  windHeadingDegrees: number | null
  windReferenceFrame: string | null | undefined
  alphaDegrees: number
}

export interface WindInstrumentState {
  phase: WindInstrumentPhase
  tack: SailingTack | null
  candidateTack: SailingTack | null
  candidateSinceMs: number | null
  transitionSinceMs: number | null
  transitionTargetDegrees: number | null
  transitionAlternativeTargetDegrees: number | null
  transitionCrossedWindCorridor: boolean
  settlingStartedAtMs: number | null
  settlingSamples: number[]
  lastSampleTimestamp: number | null
  lastCourseDegrees: number | null
  lastCourseTimestamp: number | null
  lockedCourseReferenceDegrees: number | null
  tackWindHeadingDegrees: number | null
  estimatedWindHeadingDegrees: number | null
  indicatorDotCount: number
  indicatorIsLift: boolean | null
  originWindHeadingDegrees: number | null
  alphaDegrees: number | null
}

export interface WindInstrumentOutput {
  state: WindInstrumentState
  liftDots: number
  headerDots: number
  isReferenced: boolean
  estimatedWindHeadingDegrees: number | null
  estimatedWindShiftDegrees: number | null
  scalePositionDegrees: number | null
  courseHeadingDegrees: number | null
}

export function createWindInstrumentState(): WindInstrumentState {
  return {
    phase: 'seeking',
    tack: null,
    candidateTack: null,
    candidateSinceMs: null,
    transitionSinceMs: null,
    transitionTargetDegrees: null,
    transitionAlternativeTargetDegrees: null,
    transitionCrossedWindCorridor: false,
    settlingStartedAtMs: null,
    settlingSamples: [],
    lastSampleTimestamp: null,
    lastCourseDegrees: null,
    lastCourseTimestamp: null,
    lockedCourseReferenceDegrees: null,
    tackWindHeadingDegrees: null,
    estimatedWindHeadingDegrees: null,
    indicatorDotCount: 0,
    indicatorIsLift: null,
    originWindHeadingDegrees: null,
    alphaDegrees: null,
  }
}

export function getWindRelativeCourseDegrees(courseDegrees: number, windHeadingDegrees: number): number {
  return normalizeDegrees(courseDegrees - windHeadingDegrees + 180)
}

export function clampWindShiftScalePosition(shiftDegrees: number): number {
  return Math.max(-30, Math.min(30, shiftDegrees))
}

export function stepWindInstrument(
  previousState: WindInstrumentState,
  input: WindInstrumentInput,
): WindInstrumentOutput {
  const compatibleReference = input.windReferenceFrame === 'true-north'
  const validAlpha = Number.isFinite(input.alphaDegrees) && input.alphaDegrees >= 70 && input.alphaDegrees <= 110
  const windHeading = input.windHeadingDegrees
  if (!compatibleReference || !validAlpha || !isValidHeading(windHeading)) {
    return createOutput(createWindInstrumentState(), windHeading)
  }
  const sameConfiguration = previousState.originWindHeadingDegrees === normalizeDegrees(windHeading) &&
    previousState.alphaDegrees === input.alphaDegrees
  let state = sameConfiguration ? previousState : createWindInstrumentState()
  const origin = normalizeDegrees(windHeading)
  if (state.originWindHeadingDegrees === null) {
    state = { ...state, originWindHeadingDegrees: origin, alphaDegrees: input.alphaDegrees }
  }

  const timestamp = input.timestamp
  const course = input.courseDegrees
  const validCourse = input.courseReliable && isValidHeading(course) &&
    typeof timestamp === 'number' && Number.isFinite(timestamp) &&
    timestamp <= input.nowMs + 1_000 && input.nowMs - timestamp <= COURSE_SAMPLE_MAX_AGE_MS

  if (!validCourse) {
    state = clearPendingCourseTransition(state)
    return createOutput(state, origin)
  }

  const currentCourse = normalizeDegrees(course)
  if (state.lastSampleTimestamp === timestamp) {
    return createOutput(state, origin, currentCourse)
  }
  if (state.lastSampleTimestamp !== null && timestamp < state.lastSampleTimestamp) {
    state = createWindInstrumentState()
    state = { ...state, originWindHeadingDegrees: origin, alphaDegrees: input.alphaDegrees }
  }

  const gapMs = state.lastSampleTimestamp === null ? 0 : timestamp - state.lastSampleTimestamp
  if (gapMs > COURSE_SAMPLE_MAX_AGE_MS) {
    state = clearPendingCourseTransition(state)
  }
  state = { ...state, lastSampleTimestamp: timestamp, lastCourseDegrees: currentCourse, lastCourseTimestamp: timestamp }

  if (state.phase === 'seeking') {
    state = seekInitialTack(state, currentCourse, timestamp, origin, input.alphaDegrees)
  } else if (state.phase === 'establishing') {
    state = collectReference(state, currentCourse, timestamp, origin, input.alphaDegrees)
  } else if (state.phase === 'steady') {
    state = observeSteadyTack(state, currentCourse, timestamp, origin, input.alphaDegrees)
  } else {
    state = observeTackTransition(state, currentCourse, timestamp, origin, input.alphaDegrees)
  }

  return createOutput(state, origin, currentCourse)
}

function seekInitialTack(
  state: WindInstrumentState,
  course: number,
  timestamp: number,
  origin: number,
  alphaDegrees: number,
): WindInstrumentState {
  const windEstimate = state.estimatedWindHeadingDegrees ?? origin
  const tack = getTackNearCourse(course, windEstimate, alphaDegrees)
  if (tack === null) {
    return { ...state, candidateTack: null, candidateSinceMs: null, indicatorDotCount: 0 }
  }
  if (state.candidateTack !== tack || state.candidateSinceMs === null) {
    return { ...state, candidateTack: tack, candidateSinceMs: timestamp, indicatorDotCount: 0 }
  }
  if (timestamp - state.candidateSinceMs < TACK_CONFIRMATION_MS) return state
  return startEstablishment({ ...state, tack }, timestamp)
}

function startEstablishment(state: WindInstrumentState, timestamp: number): WindInstrumentState {
  return {
    ...state,
    phase: 'establishing',
    candidateTack: null,
    candidateSinceMs: null,
    transitionSinceMs: null,
    transitionTargetDegrees: null,
    transitionAlternativeTargetDegrees: null,
    transitionCrossedWindCorridor: false,
    settlingStartedAtMs: timestamp,
    settlingSamples: [],
    lockedCourseReferenceDegrees: null,
    indicatorDotCount: 0,
  }
}

function collectReference(
  state: WindInstrumentState,
  course: number,
  timestamp: number,
  origin: number,
  alphaDegrees: number,
): WindInstrumentState {
  const startedAt = state.settlingStartedAtMs
  if (startedAt === null) return { ...state, phase: 'seeking', settlingSamples: [] }
  const elapsed = timestamp - startedAt
  const samples = elapsed >= REFERENCE_SETTLING_MS && elapsed <= REFERENCE_ESTABLISHMENT_MS
    ? [...state.settlingSamples, course]
    : state.settlingSamples
  if (elapsed < REFERENCE_ESTABLISHMENT_MS) return { ...state, settlingSamples: samples }

  const meanCourse = averageAnglesDegrees(samples)
  const spread = meanCourse === null ? null : getCircularSpreadDegrees(samples, meanCourse)
  if (
    meanCourse === null || samples.length < REFERENCE_MINIMUM_SAMPLES ||
    spread === null || spread > REFERENCE_MAXIMUM_SPREAD_DEGREES
  ) {
    return {
      ...state,
      phase: 'seeking',
      tack: null,
      candidateTack: null,
      candidateSinceMs: null,
      settlingStartedAtMs: null,
      settlingSamples: [],
      lockedCourseReferenceDegrees: null,
      indicatorDotCount: 0,
    }
  }
  const expected = getExpectedCourse(
    state.tack,
    state.tackWindHeadingDegrees ?? state.estimatedWindHeadingDegrees ?? origin,
    alphaDegrees,
  )
  if (Math.abs(shortestAngleDeltaDegrees(meanCourse, expected)) > TACK_SECTOR_TOLERANCE_DEGREES) {
    return {
      ...state,
      phase: 'seeking', tack: null, candidateTack: null, candidateSinceMs: null,
      settlingStartedAtMs: null, settlingSamples: [], lockedCourseReferenceDegrees: null,
      indicatorDotCount: 0,
    }
  }
  const windEstimate = estimateWindFromCourse(meanCourse, state.tack, alphaDegrees)
  return {
    ...state,
    phase: 'steady',
    settlingStartedAtMs: null,
    settlingSamples: [],
    lockedCourseReferenceDegrees: normalizeDegrees(meanCourse),
    tackWindHeadingDegrees: windEstimate,
    estimatedWindHeadingDegrees: windEstimate,
    indicatorDotCount: 0,
  }
}

function observeSteadyTack(
  state: WindInstrumentState,
  course: number,
  timestamp: number,
  origin: number,
  alphaDegrees: number,
): WindInstrumentState {
  const tack = state.tack
  const reference = state.lockedCourseReferenceDegrees
  if (tack === null || reference === null) return { ...state, phase: 'seeking', indicatorDotCount: 0 }
  const windEstimateCandidate = estimateWindFromCourse(course, tack, alphaDegrees)
  const courseDeviationFromReference = Math.abs(shortestAngleDeltaDegrees(course, reference))
  const stillWithinTackEstimateRange = courseDeviationFromReference <= MAX_COURSE_DEVIATION_FOR_WIND_ESTIMATE_DEGREES
  const windEstimate = stillWithinTackEstimateRange ? windEstimateCandidate : state.estimatedWindHeadingDegrees
  const tackWindEstimate = state.tackWindHeadingDegrees ?? origin
  const currentExpected = getExpectedCourse(tack, tackWindEstimate, alphaDegrees)
  const oppositeTack = opposite(tack)
  const oppositeExpected = getExpectedCourse(oppositeTack, tackWindEstimate, alphaDegrees)
  const originalOppositeExpected = getExpectedCourse(oppositeTack, origin, alphaDegrees)
  const progress = directedProgress(course, currentExpected, oppositeExpected)
  const predictedOpposite = getExpectedCourse(oppositeTack, capWindEstimate(tackWindEstimate, windEstimateCandidate, MAX_TACK_TARGET_WIND_SHIFT_DEGREES), alphaDegrees)
  const nearOpposite = [oppositeExpected, predictedOpposite].some((heading) => (
    Math.abs(shortestAngleDeltaDegrees(course, heading)) <= TACK_SECTOR_TOLERANCE_DEGREES
  ))
  const withinWindCorridor = Math.abs(shortestAngleDeltaDegrees(course, tackWindEstimate)) <= 20
  const beyondWindEstimateLimit = courseDeviationFromReference > MAX_COURSE_DEVIATION_FOR_WIND_ESTIMATE_DEGREES
  const transitionEvidence = progress > MAX_COURSE_DEVIATION_FOR_WIND_ESTIMATE_DEGREES ||
    nearOpposite || (withinWindCorridor && progress > 0)
  if (beyondWindEstimateLimit && transitionEvidence) {
    return {
      ...state,
      phase: 'transition',
      transitionSinceMs: timestamp,
      transitionTargetDegrees: predictedOpposite,
      transitionAlternativeTargetDegrees: originalOppositeExpected,
      transitionCrossedWindCorridor: withinWindCorridor,
      candidateTack: oppositeTack,
      candidateSinceMs: nearOpposite ? timestamp : null,
      indicatorDotCount: 0,
      indicatorIsLift: null,
      estimatedWindHeadingDegrees: state.estimatedWindHeadingDegrees ?? windEstimateCandidate,
    }
  }
  const signedCourseShift = shortestAngleDeltaDegrees(course, reference) * tackSign(tack)
  const isLift = signedCourseShift > 0
  const nextDots = updateIndicatorDotCount(
    state.indicatorIsLift === isLift ? state.indicatorDotCount : 0,
    Math.abs(signedCourseShift),
  )
  return {
    ...state,
    estimatedWindHeadingDegrees: windEstimate,
    indicatorDotCount: nextDots,
    indicatorIsLift: nextDots > 0 ? isLift : null,
  }
}

function observeTackTransition(
  state: WindInstrumentState,
  course: number,
  timestamp: number,
  origin: number,
  alphaDegrees: number,
): WindInstrumentState {
  const oldTack = state.tack
  const targetTack = state.candidateTack
  const transitionAt = state.transitionSinceMs
  if (oldTack === null || targetTack === null || transitionAt === null) {
    return { ...state, phase: 'seeking', indicatorDotCount: 0 }
  }
  if (timestamp - transitionAt > TACK_TRANSITION_TIMEOUT_MS) {
    return { ...state, phase: 'steady', candidateTack: null, candidateSinceMs: null, transitionSinceMs: null, transitionTargetDegrees: null, transitionAlternativeTargetDegrees: null, transitionCrossedWindCorridor: false, indicatorDotCount: 0 }
  }
  const oldExpected = getExpectedCourse(oldTack, state.tackWindHeadingDegrees ?? origin, alphaDegrees)
  if (Math.abs(shortestAngleDeltaDegrees(course, oldExpected)) <= TACK_SECTOR_TOLERANCE_DEGREES) {
    return { ...state, phase: 'steady', candidateTack: null, candidateSinceMs: null, transitionSinceMs: null, transitionTargetDegrees: null, transitionAlternativeTargetDegrees: null, transitionCrossedWindCorridor: false }
  }
  const possibleTargets = [state.transitionTargetDegrees, state.transitionAlternativeTargetDegrees]
    .filter((target): target is number => target !== null)
  const reachedTarget = possibleTargets.find((target) => (
    Math.abs(shortestAngleDeltaDegrees(course, target)) <= TACK_SECTOR_TOLERANCE_DEGREES
  ))
  if (reachedTarget === undefined) {
    return { ...state, candidateSinceMs: null }
  }
  if (state.candidateSinceMs === null) {
    return { ...state, candidateSinceMs: timestamp, transitionTargetDegrees: reachedTarget }
  }
  if (timestamp - state.candidateSinceMs < TACK_CONFIRMATION_MS) return state
  return startEstablishment({
    ...state,
    tack: targetTack,
    tackWindHeadingDegrees: estimateWindFromCourse(course, targetTack, alphaDegrees) ?? origin,
  }, timestamp)
}

function getTackNearCourse(course: number, wind: number, alpha: number): SailingTack | null {
  const portCourse = getExpectedCourse('port', wind, alpha)
  const starboardCourse = getExpectedCourse('starboard', wind, alpha)
  const portDelta = Math.abs(shortestAngleDeltaDegrees(course, portCourse))
  const starboardDelta = Math.abs(shortestAngleDeltaDegrees(course, starboardCourse))
  if (portDelta <= TACK_SECTOR_TOLERANCE_DEGREES && portDelta <= starboardDelta) return 'port'
  if (starboardDelta <= TACK_SECTOR_TOLERANCE_DEGREES) return 'starboard'
  return null
}

function getExpectedCourse(tack: SailingTack | null, wind: number, alpha: number): number {
  if (tack === null) return normalizeDegrees(wind)
  return normalizeDegrees(wind - tackSign(tack) * alpha / 2)
}

function estimateWindFromCourse(course: number, tack: SailingTack | null, alpha: number): number | null {
  if (tack === null) return null
  return normalizeDegrees(course + tackSign(tack) * alpha / 2)
}

function capWindEstimate(reference: number, estimate: number | null, maximumShift: number): number {
  if (estimate === null) return normalizeDegrees(reference)
  const delta = shortestAngleDeltaDegrees(estimate, reference)
  return normalizeDegrees(reference + Math.max(-maximumShift, Math.min(maximumShift, delta)))
}

function directedProgress(course: number, from: number, to: number): number {
  const tackArc = shortestAngleDeltaDegrees(to, from)
  const courseArc = shortestAngleDeltaDegrees(course, from)
  return Math.max(0, Math.min(Math.abs(tackArc), courseArc * Math.sign(tackArc)))
}

function updateIndicatorDotCount(previous: number, magnitude: number): number {
  let next = previous
  while (next < INDICATOR_THRESHOLDS_DEGREES.length &&
    magnitude >= INDICATOR_THRESHOLDS_DEGREES[next] + INDICATOR_HYSTERESIS_DEGREES) next += 1
  while (next > 0 && magnitude < INDICATOR_THRESHOLDS_DEGREES[next - 1] - INDICATOR_HYSTERESIS_DEGREES) next -= 1
  return next
}

function clearPendingCourseTransition(state: WindInstrumentState): WindInstrumentState {
  if (state.phase === 'transition') {
    return { ...state, phase: 'steady', candidateTack: null, candidateSinceMs: null, transitionSinceMs: null, transitionTargetDegrees: null, transitionAlternativeTargetDegrees: null, transitionCrossedWindCorridor: false, indicatorDotCount: 0 }
  }
  if (state.phase === 'establishing') {
    return { ...state, phase: 'seeking', tack: null, candidateTack: null, candidateSinceMs: null, settlingStartedAtMs: null, settlingSamples: [], lockedCourseReferenceDegrees: null, indicatorDotCount: 0 }
  }
  return { ...state, candidateTack: null, candidateSinceMs: null, indicatorDotCount: 0 }
}

function createOutput(
  state: WindInstrumentState,
  originValue: number | null,
  courseHeadingDegrees: number | null = null,
): WindInstrumentOutput {
  const origin = isValidHeading(originValue) ? normalizeDegrees(originValue) : null
  const canShow = state.phase === 'steady' && state.tack !== null && state.lockedCourseReferenceDegrees !== null
  const liftDots = canShow && state.indicatorIsLift === true ? state.indicatorDotCount : 0
  const headerDots = canShow && state.indicatorIsLift === false ? state.indicatorDotCount : 0
  const windHeading = state.estimatedWindHeadingDegrees
  const shift = origin !== null && windHeading !== null
    ? shortestAngleDeltaDegrees(windHeading, origin)
    : null
  return {
    state,
    liftDots,
    headerDots,
    isReferenced: canShow,
    estimatedWindHeadingDegrees: windHeading,
    estimatedWindShiftDegrees: shift,
    scalePositionDegrees: shift === null ? null : clampWindShiftScalePosition(shift),
    courseHeadingDegrees,
  }
}

function tackSign(tack: SailingTack): number {
  return tack === 'starboard' ? 1 : -1
}

function opposite(tack: SailingTack): SailingTack {
  return tack === 'starboard' ? 'port' : 'starboard'
}

function isValidHeading(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 360
}
