import { calculateBearingDegrees, calculateVelocityMadeGood } from '../domain/navigation'
import {
  appendRaceEvent,
  appendRaceSample,
  createRace,
  getRace,
  updateRace,
} from './raceStorage'
import type {
  CourseDefinition,
  FilteredGpsReading,
  LaylineVariant,
  Race,
  RaceSample,
} from '../types'

const LOGGER_STATE_KEY = 'aster-race:race-logger:v1'
const NORMAL_SAMPLE_INTERVAL_MS = 5000
const HIGH_FREQUENCY_SAMPLE_INTERVAL_MS = 1000
const PRE_START_HIGH_FREQUENCY_SECONDS = 60
const POST_START_HIGH_FREQUENCY_SECONDS = 20
const STILL_SPEED_KNOTS = 0.8
const STILL_AUTO_STOP_MS = 10 * 60 * 1000

type RaceLoggerState = {
  activeRaceId: string | null
  countdownStartedAt?: string
  scheduledStartTime?: string
  startGunTime?: string
  lastSampleTime?: string
  lastGpsTimestamp?: number
  belowStillSpeedSince?: string
}

export type StartRaceLoggingInput = {
  countdownDurationSeconds: number
  course?: CourseDefinition
  name?: string
  now?: Date
}

export type RecordRaceSampleInput = {
  gps: FilteredGpsReading
  course?: CourseDefinition
  headingDegrees?: number
  now?: Date
}

export type RecordLaylineTackEventInput = {
  timestamp?: string
  latitude: number
  longitude: number
  speedKnots?: number
  cogDegrees?: number
  alphaDegrees: number
  postTackHeadingDegrees: number
  laylineVariant: LaylineVariant
}

let memoryLoggerState = createEmptyLoggerState()
let useMemoryLoggerState = false

export function startRaceLogging({
  countdownDurationSeconds,
  course,
  name,
  now = new Date(),
}: StartRaceLoggingInput): Race {
  const currentActiveRaceId = getActiveRaceId()

  if (currentActiveRaceId) {
    stopActiveRace({ now })
  }

  const race = createRace({
    date: now,
    createdAt: now.toISOString(),
    course,
    name: name ?? createDefaultRaceName(now),
  })
  const scheduledStartTime = new Date(now.getTime() + countdownDurationSeconds * 1000)

  saveLoggerState({
    activeRaceId: race.id,
    countdownStartedAt: now.toISOString(),
    scheduledStartTime: scheduledStartTime.toISOString(),
  })

  return race
}

export function markStartGun(now = new Date()): Race | null {
  const state = loadLoggerState()

  if (!state.activeRaceId) {
    return null
  }

  const race = getRace(state.activeRaceId)

  if (!race) {
    clearLoggerState()
    return null
  }

  if (race.startGunTime) {
    saveLoggerState({
      ...state,
      startGunTime: race.startGunTime,
    })

    return race
  }

  const startGunTime = now.toISOString()
  const updatedRace = updateRace(race.id, { startGunTime })

  saveLoggerState({
    ...state,
    startGunTime,
  })

  return updatedRace
}

export function stopActiveRace({ now = new Date() }: { now?: Date } = {}): Race | null {
  const state = loadLoggerState()

  if (!state.activeRaceId) {
    return null
  }

  const race = getRace(state.activeRaceId)

  clearLoggerState()

  if (!race) {
    return null
  }

  if (race.endTime) {
    return race
  }

  return updateRace(race.id, { endTime: now.toISOString() })
}

export function recordSampleIfDue({
  gps,
  course,
  headingDegrees,
  now = new Date(),
}: RecordRaceSampleInput): Race | null {
  const state = loadLoggerState()

  if (!state.activeRaceId || gps.latitude === null || gps.longitude === null) {
    return null
  }

  const race = getRace(state.activeRaceId)

  if (!race) {
    clearLoggerState()
    return null
  }

  const sampleTime = getSampleTime(gps, now)

  if (!isDueForSample(state, sampleTime)) {
    return null
  }

  const sample: RaceSample = {
    timestamp: sampleTime.toISOString(),
    latitude: gps.latitude,
    longitude: gps.longitude,
  }

  if (gps.accuracyMeters !== null) {
    sample.accuracy = gps.accuracyMeters
  }

  if (gps.speedKnots !== null) {
    sample.speedKnots = gps.speedKnots
  }

  if (gps.courseDegrees !== null) {
    sample.cogDegrees = gps.courseDegrees
  }

  if (headingDegrees !== undefined) {
    sample.headingDegrees = headingDegrees
  }

  const velocityMadeGood = calculateSampleVelocityMadeGood(gps, course)
  sample.vmgCourseKnots = velocityMadeGood.vmgCourseKnots
  sample.vmgWindKnots = velocityMadeGood.vmgWindKnots
  sample.windDirectionDegrees = course?.windDirectionDegrees

  const updatedRace = appendRaceSample(race.id, sample)
  const nextLoggerState = updateStillState({
    ...state,
    activeRaceId: race.id,
    startGunTime: state.startGunTime ?? race.startGunTime,
    lastSampleTime: sample.timestamp,
    lastGpsTimestamp: gps.timestamp ?? undefined,
  }, gps, sampleTime)

  saveLoggerState(nextLoggerState)

  if (shouldAutoStopForStillness(nextLoggerState, sampleTime)) {
    return stopActiveRace({ now: sampleTime })
  }

  return updatedRace
}

export function getActiveRaceId(): string | null {
  return loadLoggerState().activeRaceId
}

export function recordLaylineTackEventIfActive({
  timestamp = new Date().toISOString(),
  latitude,
  longitude,
  speedKnots,
  cogDegrees,
  alphaDegrees,
  postTackHeadingDegrees,
  laylineVariant,
}: RecordLaylineTackEventInput): Race | null {
  const activeRaceId = getActiveRaceId()

  if (!activeRaceId) {
    return null
  }

  return appendRaceEvent(activeRaceId, {
    type: 'layline-tack',
    timestamp,
    latitude,
    longitude,
    speedKnots,
    cogDegrees,
    alphaDegrees,
    postTackHeadingDegrees,
    laylineVariant,
    target: 'K1',
  })
}

function createEmptyLoggerState(): RaceLoggerState {
  return {
    activeRaceId: null,
  }
}

function createDefaultRaceName(date: Date): string {
  return `Race ${new Intl.DateTimeFormat('sv-SE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)}`
}

function getSampleTime(gps: FilteredGpsReading, now: Date): Date {
  if (gps.timestamp !== null && Number.isFinite(gps.timestamp)) {
    return new Date(gps.timestamp)
  }

  return now
}

function isDueForSample(state: RaceLoggerState, sampleTime: Date): boolean {
  if (state.lastGpsTimestamp !== undefined && state.lastGpsTimestamp === sampleTime.getTime()) {
    return false
  }

  if (!state.lastSampleTime) {
    return true
  }

  const lastSampleTime = Date.parse(state.lastSampleTime)

  if (!Number.isFinite(lastSampleTime)) {
    return true
  }

  return sampleTime.getTime() - lastSampleTime >= getSampleIntervalMs(state, sampleTime)
}

function getSampleIntervalMs(state: RaceLoggerState, sampleTime: Date): number {
  const startGunTime = state.startGunTime ? Date.parse(state.startGunTime) : null

  if (startGunTime !== null && Number.isFinite(startGunTime)) {
    const secondsAfterStart = (sampleTime.getTime() - startGunTime) / 1000

    return secondsAfterStart >= 0 && secondsAfterStart <= POST_START_HIGH_FREQUENCY_SECONDS
      ? HIGH_FREQUENCY_SAMPLE_INTERVAL_MS
      : NORMAL_SAMPLE_INTERVAL_MS
  }

  const scheduledStartTime = state.scheduledStartTime ? Date.parse(state.scheduledStartTime) : null

  if (scheduledStartTime !== null && Number.isFinite(scheduledStartTime)) {
    const secondsUntilStart = (scheduledStartTime - sampleTime.getTime()) / 1000

    return secondsUntilStart <= PRE_START_HIGH_FREQUENCY_SECONDS
      ? HIGH_FREQUENCY_SAMPLE_INTERVAL_MS
      : NORMAL_SAMPLE_INTERVAL_MS
  }

  return NORMAL_SAMPLE_INTERVAL_MS
}

function calculateSampleVelocityMadeGood(
  gps: FilteredGpsReading,
  course: CourseDefinition | undefined,
): Pick<RaceSample, 'vmgCourseKnots' | 'vmgWindKnots'> {
  if (gps.speedKnots === null || gps.courseDegrees === null) {
    return {}
  }

  const vmgCourseReference = getCourseReferenceHeading(gps, course)
  const vmgWindReference = course?.windDirectionDegrees

  return {
    vmgCourseKnots: vmgCourseReference !== undefined
      ? calculateVelocityMadeGood(gps.speedKnots, gps.courseDegrees, vmgCourseReference)
      : undefined,
    vmgWindKnots: vmgWindReference !== undefined
      ? calculateVelocityMadeGood(gps.speedKnots, gps.courseDegrees, vmgWindReference)
      : undefined,
  }
}

function getCourseReferenceHeading(
  gps: FilteredGpsReading,
  course: CourseDefinition | undefined,
): number | undefined {
  if (!course) {
    return undefined
  }

  if (course.windwardMark) {
    return calculateBearingDegrees({
      latitude: gps.latitude ?? course.windwardMark.latitude,
      longitude: gps.longitude ?? course.windwardMark.longitude,
    }, course.windwardMark)
  }

  return course.courseAxisDegrees
}

function updateStillState(
  state: RaceLoggerState,
  gps: FilteredGpsReading,
  sampleTime: Date,
): RaceLoggerState {
  if (gps.speedKnots === null || gps.speedKnots >= STILL_SPEED_KNOTS) {
    return {
      ...state,
      belowStillSpeedSince: undefined,
    }
  }

  return {
    ...state,
    belowStillSpeedSince: state.belowStillSpeedSince ?? sampleTime.toISOString(),
  }
}

function shouldAutoStopForStillness(state: RaceLoggerState, sampleTime: Date): boolean {
  if (!state.belowStillSpeedSince) {
    return false
  }

  const stillSince = Date.parse(state.belowStillSpeedSince)

  return Number.isFinite(stillSince) && sampleTime.getTime() - stillSince >= STILL_AUTO_STOP_MS
}

function loadLoggerState(): RaceLoggerState {
  if (useMemoryLoggerState) {
    return { ...memoryLoggerState }
  }

  const storage = getLocalStorage()

  if (!storage) {
    useMemoryLoggerState = true

    return { ...memoryLoggerState }
  }

  const storedValue = storage.getItem(LOGGER_STATE_KEY)

  if (!storedValue) {
    return createEmptyLoggerState()
  }

  try {
    return normalizeLoggerState(JSON.parse(storedValue))
  } catch {
    return createEmptyLoggerState()
  }
}

function saveLoggerState(state: RaceLoggerState): void {
  const normalizedState = normalizeLoggerState(state)
  memoryLoggerState = { ...normalizedState }

  if (useMemoryLoggerState) {
    return
  }

  const storage = getLocalStorage()

  if (!storage) {
    useMemoryLoggerState = true
    return
  }

  try {
    storage.setItem(LOGGER_STATE_KEY, JSON.stringify(normalizedState))
  } catch {
    useMemoryLoggerState = true
  }
}

function clearLoggerState(): void {
  saveLoggerState(createEmptyLoggerState())
}

function normalizeLoggerState(value: unknown): RaceLoggerState {
  if (!isRecord(value)) {
    return createEmptyLoggerState()
  }

  const state: RaceLoggerState = {
    activeRaceId: isString(value.activeRaceId) ? value.activeRaceId : null,
  }

  if (isString(value.countdownStartedAt)) {
    state.countdownStartedAt = value.countdownStartedAt
  }

  if (isString(value.scheduledStartTime)) {
    state.scheduledStartTime = value.scheduledStartTime
  }

  if (isString(value.startGunTime)) {
    state.startGunTime = value.startGunTime
  }

  if (isString(value.lastSampleTime)) {
    state.lastSampleTime = value.lastSampleTime
  }

  if (typeof value.lastGpsTimestamp === 'number' && Number.isFinite(value.lastGpsTimestamp)) {
    state.lastGpsTimestamp = value.lastGpsTimestamp
  }

  if (isString(value.belowStillSpeedSince)) {
    state.belowStillSpeedSince = value.belowStillSpeedSince
  }

  return state
}

function getLocalStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
