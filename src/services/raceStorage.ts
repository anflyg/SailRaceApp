import type {
  CourseDefinition,
  LaylineVariant,
  Race,
  RaceEvent,
  RaceSample,
  RaceSummary,
  SailingDay,
} from '../types'

const STORAGE_KEY = 'aster-race:race-storage:v1'
const STORAGE_VERSION = 1
const EARTH_RADIUS_METERS = 6_371_000
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

type RaceStorageState = {
  version: number
  sailingDaysById: Record<string, SailingDay>
  racesById: Record<string, Race>
}

export type CreateRaceInput = {
  date?: string | Date
  name?: string
  createdAt?: string
  startGunTime?: string
  endTime?: string
  course?: CourseDefinition
  samples?: RaceSample[]
  events?: RaceEvent[]
  isFavorite?: boolean
}

export type RacePatch = Partial<Omit<Race, 'id' | 'dayId' | 'summary'>>

let memoryState = createEmptyStorageState()
let useMemoryStorage = false

export function createDateKey(date: string | Date = new Date()): string {
  if (typeof date === 'string') {
    if (DATE_KEY_PATTERN.test(date)) {
      return date
    }

    const parsedDate = new Date(date)

    return Number.isFinite(parsedDate.getTime()) ? formatLocalDateKey(parsedDate) : formatLocalDateKey(new Date())
  }

  return formatLocalDateKey(date)
}

export function createRaceId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }

  return `race_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

export function createRace(input: CreateRaceInput = {}): Race {
  const state = loadStorageState()
  const createdAt = input.createdAt ?? new Date().toISOString()
  const date = createDateKey(input.date ?? createdAt)
  const day = getOrCreateSailingDay(state, date)
  const race: Race = {
    id: createRaceId(),
    dayId: day.id,
    name: normalizeRaceName(input.name, day.raceIds.length + 1),
    createdAt,
    startGunTime: input.startGunTime,
    endTime: input.endTime,
    course: input.course,
    samples: input.samples ? [...input.samples] : [],
    events: input.events ? [...input.events] : [],
    isFavorite: input.isFavorite ?? false,
  }

  race.summary = calculateRaceSummary(race)
  state.racesById[race.id] = race
  day.raceIds = [...day.raceIds, race.id]
  saveStorageState(state)

  return clone(race)
}

export function getRace(id: string): Race | null {
  const race = loadStorageState().racesById[id]

  return race ? clone(race) : null
}

export function listRaces(): Race[] {
  return sortRacesByCreatedAtDesc(Object.values(loadStorageState().racesById)).map(clone)
}

export function listSailingDays(): SailingDay[] {
  return Object.values(loadStorageState().sailingDaysById)
    .map(clone)
    .sort((firstDay, secondDay) => secondDay.date.localeCompare(firstDay.date))
}

export function listRacesByDay(date: string | Date): Race[] {
  const state = loadStorageState()
  const day = state.sailingDaysById[createDateKey(date)]

  if (!day) {
    return []
  }

  return sortRacesByCreatedAtDesc(day.raceIds
    .map((raceId) => state.racesById[raceId])
    .filter((race): race is Race => race !== undefined))
    .map(clone)
}

export function updateRace(id: string, patch: RacePatch): Race | null {
  const state = loadStorageState()
  const currentRace = state.racesById[id]

  if (!currentRace) {
    return null
  }

  const nextRace: Race = {
    ...currentRace,
    ...patch,
    id: currentRace.id,
    dayId: currentRace.dayId,
    samples: patch.samples ? [...patch.samples] : currentRace.samples,
    events: patch.events ? [...patch.events] : currentRace.events,
  }

  nextRace.summary = calculateRaceSummary(nextRace)
  state.racesById[id] = nextRace
  saveStorageState(state)

  return clone(nextRace)
}

export function deleteRace(id: string): boolean {
  const state = loadStorageState()

  if (!state.racesById[id]) {
    return false
  }

  delete state.racesById[id]

  for (const day of Object.values(state.sailingDaysById)) {
    day.raceIds = day.raceIds.filter((raceId) => raceId !== id)

    if (day.raceIds.length === 0) {
      delete state.sailingDaysById[day.id]
    }
  }

  saveStorageState(state)

  return true
}

export function renameRace(id: string, name: string): Race | null {
  const existingRace = getRace(id)

  if (!existingRace) {
    return null
  }

  return updateRace(id, {
    name: normalizeRaceName(name, 1, existingRace.name),
  })
}

export function toggleFavorite(id: string): Race | null {
  const state = loadStorageState()
  const race = state.racesById[id]

  if (!race) {
    return null
  }

  race.isFavorite = !race.isFavorite
  saveStorageState(state)

  return clone(race)
}

export function appendRaceSample(raceId: string, sample: RaceSample): Race | null {
  const state = loadStorageState()
  const race = state.racesById[raceId]

  if (!race) {
    return null
  }

  race.samples = [...race.samples, addElapsedSecondsIfAvailable(race, sample)]
  race.summary = calculateRaceSummary(race)
  state.racesById[raceId] = race
  saveStorageState(state)

  return clone(race)
}

export function appendRaceEvent(raceId: string, event: RaceEvent): Race | null {
  const state = loadStorageState()
  const race = state.racesById[raceId]

  if (!race) {
    return null
  }

  race.events = [...race.events, event]
  state.racesById[raceId] = race
  saveStorageState(state)

  return clone(race)
}

export function calculateRaceSummary(race: Pick<Race, 'samples' | 'startGunTime' | 'endTime'>): RaceSummary {
  const speedSamples = race.samples
    .map((sample) => sample.speedKnots)
    .filter(isFiniteNumber)
  const speedSum = speedSamples.reduce((sum, speedKnots) => sum + speedKnots, 0)
  const durationSeconds = calculateDurationSeconds(race)
  const distanceMeters = calculateDistanceMeters(race.samples)

  return {
    durationSeconds,
    distanceMeters,
    maxSpeedKnots: speedSamples.length > 0 ? Math.max(...speedSamples) : undefined,
    averageSpeedKnots: speedSamples.length > 0 ? speedSum / speedSamples.length : undefined,
    sampleCount: race.samples.length,
  }
}

function createEmptyStorageState(): RaceStorageState {
  return {
    version: STORAGE_VERSION,
    sailingDaysById: {},
    racesById: {},
  }
}

function loadStorageState(): RaceStorageState {
  if (useMemoryStorage) {
    return clone(memoryState)
  }

  const storage = getLocalStorage()

  if (!storage) {
    useMemoryStorage = true

    return clone(memoryState)
  }

  const storedValue = storage.getItem(STORAGE_KEY)

  if (!storedValue) {
    return createEmptyStorageState()
  }

  try {
    return normalizeStorageState(JSON.parse(storedValue))
  } catch {
    return createEmptyStorageState()
  }
}

function saveStorageState(state: RaceStorageState): void {
  const normalizedState = normalizeStorageState(state)
  memoryState = clone(normalizedState)

  if (useMemoryStorage) {
    return
  }

  const storage = getLocalStorage()

  if (!storage) {
    useMemoryStorage = true

    return
  }

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(normalizedState))
  } catch {
    useMemoryStorage = true
  }
}

function normalizeStorageState(value: unknown): RaceStorageState {
  if (!isRecord(value)) {
    return createEmptyStorageState()
  }

  const state = createEmptyStorageState()

  if (isRecord(value.sailingDaysById)) {
    for (const dayValue of Object.values(value.sailingDaysById)) {
      const day = readSailingDay(dayValue)

      if (day) {
        state.sailingDaysById[day.id] = day
      }
    }
  }

  if (isRecord(value.racesById)) {
    for (const raceValue of Object.values(value.racesById)) {
      const race = readRace(raceValue)

      if (race) {
        state.racesById[race.id] = race
      }
    }
  }

  return compactStorageState(state)
}

function compactStorageState(state: RaceStorageState): RaceStorageState {
  const compactedState = createEmptyStorageState()

  for (const race of Object.values(state.racesById)) {
    const sourceDay = state.sailingDaysById[race.dayId]
    const day = compactedState.sailingDaysById[race.dayId] ?? {
      id: race.dayId,
      date: sourceDay?.date ?? (DATE_KEY_PATTERN.test(race.dayId) ? race.dayId : createDateKey(race.createdAt)),
      raceIds: [],
    }
    const normalizedRace = {
      ...race,
      samples: [...race.samples],
      events: [...race.events],
      summary: calculateRaceSummary(race),
    }

    compactedState.racesById[normalizedRace.id] = normalizedRace

    if (!day.raceIds.includes(normalizedRace.id)) {
      day.raceIds.push(normalizedRace.id)
    }

    compactedState.sailingDaysById[day.id] = day
  }

  return compactedState
}

function readSailingDay(value: unknown): SailingDay | null {
  if (!isRecord(value) || !isString(value.id) || !isString(value.date)) {
    return null
  }

  return {
    id: value.id,
    date: createDateKey(value.date),
    raceIds: Array.isArray(value.raceIds) ? value.raceIds.filter(isString) : [],
  }
}

function readRace(value: unknown): Race | null {
  if (!isRecord(value) || !isString(value.id) || !isString(value.dayId) || !isString(value.createdAt)) {
    return null
  }

  const race: Race = {
    id: value.id,
    dayId: value.dayId,
    name: isString(value.name) ? value.name : 'Race',
    createdAt: value.createdAt,
    startGunTime: isString(value.startGunTime) ? value.startGunTime : undefined,
    endTime: isString(value.endTime) ? value.endTime : undefined,
    course: readCourseDefinition(value.course),
    samples: Array.isArray(value.samples)
      ? value.samples
        .map(readRaceSample)
        .filter((sample): sample is RaceSample => sample !== null)
      : [],
    events: Array.isArray(value.events)
      ? value.events
        .map(readRaceEvent)
        .filter((event): event is RaceEvent => event !== null)
      : [],
    isFavorite: typeof value.isFavorite === 'boolean' ? value.isFavorite : false,
  }

  race.summary = calculateRaceSummary(race)

  return race
}

function readNumber(value: unknown): number | undefined {
  return isFiniteNumber(value) ? value : undefined
}

function readRaceSample(value: unknown): RaceSample | null {
  if (!isRecord(value) || !isString(value.timestamp) || !isFiniteNumber(value.latitude) || !isFiniteNumber(value.longitude)) {
    return null
  }

  const sample: RaceSample = {
    timestamp: value.timestamp,
    latitude: value.latitude,
    longitude: value.longitude,
  }

  if (isFiniteNumber(value.elapsedSeconds)) {
    sample.elapsedSeconds = value.elapsedSeconds
  }

  if (isFiniteNumber(value.accuracy)) {
    sample.accuracy = value.accuracy
  }

  if (isFiniteNumber(value.speedKnots)) {
    sample.speedKnots = value.speedKnots
  }

  if (isFiniteNumber(value.cogDegrees)) {
    sample.cogDegrees = value.cogDegrees
  }

  if (isFiniteNumber(value.headingDegrees)) {
    sample.headingDegrees = value.headingDegrees
  }

  if (isFiniteNumber(value.windDirectionDegrees)) {
    sample.windDirectionDegrees = value.windDirectionDegrees
  }

  if (isFiniteNumber(value.vmgCourseKnots)) {
    sample.vmgCourseKnots = value.vmgCourseKnots
  }

  if (isFiniteNumber(value.vmgWindKnots)) {
    sample.vmgWindKnots = value.vmgWindKnots
  }

  return sample
}

function readRaceEvent(value: unknown): RaceEvent | null {
  if (!isRecord(value) || !isString(value.type)) {
    return null
  }

  if (value.type !== 'layline-tack') {
    return null
  }

  if (
    !isString(value.timestamp) ||
    !isFiniteNumber(value.latitude) ||
    !isFiniteNumber(value.longitude) ||
    !isFiniteNumber(value.alphaDegrees) ||
    !isFiniteNumber(value.postTackHeadingDegrees) ||
    !isLaylineVariant(value.laylineVariant)
  ) {
    return null
  }

  return {
    type: 'layline-tack',
    timestamp: value.timestamp,
    latitude: value.latitude,
    longitude: value.longitude,
    cogDegrees: readNumber(value.cogDegrees),
    speedKnots: readNumber(value.speedKnots),
    alphaDegrees: value.alphaDegrees,
    postTackHeadingDegrees: value.postTackHeadingDegrees,
    laylineVariant: value.laylineVariant,
    target: 'K1',
  }
}

function readCourseDefinition(value: unknown): CourseDefinition | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const startLine = readStartLine(value.startLine)
  const windwardMark = readGeoPoint(value.windwardMark)
  const leewardMark = readGeoPoint(value.leewardMark)
  const course: CourseDefinition = {}

  if (startLine) {
    course.startLine = startLine
  }

  if (windwardMark) {
    course.windwardMark = windwardMark
  }

  if (leewardMark) {
    course.leewardMark = leewardMark
  }

  if (isFiniteNumber(value.windDirectionDegrees)) {
    course.windDirectionDegrees = value.windDirectionDegrees
  }

  if (isFiniteNumber(value.courseAxisDegrees)) {
    course.courseAxisDegrees = value.courseAxisDegrees
  }

  if (typeof value.marksEstimated === 'boolean') {
    course.marksEstimated = value.marksEstimated
  }

  return Object.keys(course).length > 0 ? course : undefined
}

function readStartLine(value: unknown): CourseDefinition['startLine'] | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const port = readGeoPoint(value.port)
  const starboard = readGeoPoint(value.starboard)

  if (!port || !starboard) {
    return undefined
  }

  return {
    port,
    starboard,
  }
}

function readGeoPoint(value: unknown): { latitude: number; longitude: number } | null {
  if (!isRecord(value) || !isFiniteNumber(value.latitude) || !isFiniteNumber(value.longitude)) {
    return null
  }

  return {
    latitude: value.latitude,
    longitude: value.longitude,
  }
}

function addElapsedSecondsIfAvailable(race: Race, sample: RaceSample): RaceSample {
  if (sample.elapsedSeconds !== undefined || !race.startGunTime) {
    return sample
  }

  const startTime = Date.parse(race.startGunTime)
  const sampleTime = Date.parse(sample.timestamp)

  if (!Number.isFinite(startTime) || !Number.isFinite(sampleTime)) {
    return sample
  }

  return {
    ...sample,
    elapsedSeconds: Math.max(0, (sampleTime - startTime) / 1000),
  }
}

function calculateDurationSeconds(race: Pick<Race, 'samples' | 'startGunTime' | 'endTime'>): number | undefined {
  if (race.startGunTime && race.endTime) {
    const startTime = Date.parse(race.startGunTime)
    const endTime = Date.parse(race.endTime)

    if (Number.isFinite(startTime) && Number.isFinite(endTime) && endTime >= startTime) {
      return Math.round((endTime - startTime) / 1000)
    }
  }

  const elapsedSeconds = race.samples
    .map((sample) => readNumber(sample.elapsedSeconds))
    .filter(isFiniteNumber)

  if (elapsedSeconds.length > 0) {
    return Math.round(Math.max(...elapsedSeconds) - Math.min(...elapsedSeconds))
  }

  if (race.samples.length < 2) {
    return undefined
  }

  const sampleTimestamps = race.samples
    .map((sample) => Date.parse(sample.timestamp))
    .filter(isFiniteNumber)

  if (sampleTimestamps.length < 2) {
    return undefined
  }

  return Math.round((Math.max(...sampleTimestamps) - Math.min(...sampleTimestamps)) / 1000)
}

function calculateDistanceMeters(samples: RaceSample[]): number | undefined {
  if (samples.length < 2) {
    return undefined
  }

  let distanceMeters = 0

  for (let index = 1; index < samples.length; index += 1) {
    distanceMeters += calculateSegmentDistanceMeters(samples[index - 1], samples[index])
  }

  return Math.round(distanceMeters)
}

function calculateSegmentDistanceMeters(start: RaceSample, end: RaceSample): number {
  const startLatitudeRadians = toRadians(start.latitude)
  const endLatitudeRadians = toRadians(end.latitude)
  const latitudeDeltaRadians = toRadians(end.latitude - start.latitude)
  const longitudeDeltaRadians = toRadians(end.longitude - start.longitude)
  const haversine =
    Math.sin(latitudeDeltaRadians / 2) ** 2 +
    Math.cos(startLatitudeRadians) * Math.cos(endLatitudeRadians) * Math.sin(longitudeDeltaRadians / 2) ** 2

  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
}

function getOrCreateSailingDay(state: RaceStorageState, date: string): SailingDay {
  const existingDay = state.sailingDaysById[date]

  if (existingDay) {
    return existingDay
  }

  const day = {
    id: date,
    date,
    raceIds: [],
  }

  state.sailingDaysById[day.id] = day

  return day
}

function normalizeRaceName(name: string | undefined, fallbackIndex: number, fallbackName?: string): string {
  const trimmedName = name?.trim()

  if (trimmedName) {
    return trimmedName
  }

  return fallbackName ?? `Race ${fallbackIndex}`
}

function sortRacesByCreatedAtDesc(races: Race[]): Race[] {
  return [...races].sort((firstRace, secondRace) => getTimestamp(secondRace.createdAt) - getTimestamp(firstRace.createdAt))
}

function formatLocalDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')

  return `${year}-${month}-${day}`
}

function getTimestamp(value: string): number {
  const timestamp = Date.parse(value)

  return Number.isFinite(timestamp) ? timestamp : 0
}

function getLocalStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

function clone<T>(value: T): T {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value)
  }

  return JSON.parse(JSON.stringify(value)) as T
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isLaylineVariant(value: unknown): value is LaylineVariant {
  return value === 'plus-alpha' || value === 'minus-alpha'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
