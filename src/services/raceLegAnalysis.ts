import type { Race, RaceSample } from '../types'

export type RaceLegType = 'start-to-k1' | 'k1-to-l1' | 'l1-to-k1'
export type RaceLegMarker = 'START' | 'K1' | 'L1'

export type RaceLeg = {
  id: string
  type: RaceLegType
  startSampleIndex: number
  endSampleIndex: number
  startTime: string
  endTime: string
  startPosition: { latitude: number; longitude: number }
  endPosition: { latitude: number; longitude: number }
  durationSeconds: number
  distanceMeters: number
  startMarker?: RaceLegMarker
  endMarker: 'K1' | 'L1'
}

export type RaceLegAnalysisResult = {
  legs: RaceLeg[]
  markerSequence: Array<'K1' | 'L1'>
  status: 'ok' | 'missing-marks' | 'missing-start-gun' | 'not-enough-samples'
}

const MARK_DETECTION_RADIUS_METERS = 25
// A rounding must gain at least 10 m of separation from the mark and 10 m of
// progress toward the next mark within the next four recorded samples.
const DEPARTURE_LOOKAHEAD_SAMPLES = 4
const MIN_MARK_DEPARTURE_METERS = 10
const MIN_NEXT_MARK_PROGRESS_METERS = 10

export function analyzeRaceLegs(race: Race): RaceLegAnalysisResult {
  const windwardMark = race.course?.windwardMark
  const leewardMark = race.course?.leewardMark

  if (!windwardMark || !leewardMark) return { legs: [], markerSequence: [], status: 'missing-marks' }
  if (!race.startGunTime) return { legs: [], markerSequence: [], status: 'missing-start-gun' }
  if (race.samples.length < 2) return { legs: [], markerSequence: [], status: 'not-enough-samples' }

  const startTimestamp = Date.parse(race.startGunTime)
  const startIndex = race.samples.findIndex((sample) => Date.parse(sample.timestamp) >= startTimestamp)
  if (startIndex < 0) return { legs: [], markerSequence: [], status: 'not-enough-samples' }

  const expectedMarkers: Array<{ marker: 'K1' | 'L1'; point: { latitude: number; longitude: number } }> = []
  let nextMarker: 'K1' | 'L1' = 'K1'
  let scanFrom = startIndex
  const legs: RaceLeg[] = []

  while (scanFrom < race.samples.length - 2) {
    const point = nextMarker === 'K1' ? windwardMark : leewardMark
    const nextPoint = nextMarker === 'K1' ? leewardMark : windwardMark
    const markerIndex = findNextRounding(race.samples, scanFrom, point, nextPoint)
    if (markerIndex === null) break
    expectedMarkers.push({ marker: nextMarker, point })
    const legStartIndex = legs.length === 0 ? startIndex : legs[legs.length - 1].endSampleIndex
    legs.push(createLeg(race.samples, legStartIndex, markerIndex, legs.length === 0 ? undefined : legs[legs.length - 1].endMarker, nextMarker))
    scanFrom = markerIndex + 1
    nextMarker = nextMarker === 'K1' ? 'L1' : 'K1'
  }

  return {
    legs,
    markerSequence: expectedMarkers.map((candidate) => candidate.marker),
    status: 'ok',
  }
}

function findNextRounding(
  samples: RaceSample[],
  startIndex: number,
  marker: { latitude: number; longitude: number },
  nextMarker: { latitude: number; longitude: number },
): number | null {
  for (let index = startIndex + 1; index < samples.length - 1; index += 1) {
    const previousDistance = distanceMeters(samples[index - 1], marker)
    const currentDistance = distanceMeters(samples[index], marker)
    const nextDistance = distanceMeters(samples[index + 1], marker)
    if (currentDistance <= MARK_DETECTION_RADIUS_METERS && currentDistance <= previousDistance && currentDistance <= nextDistance && previousDistance > currentDistance && nextDistance > currentDistance && confirmsDeparture(samples, index, marker, nextMarker)) {
      return index
    }
  }
  return null
}

function confirmsDeparture(
  samples: RaceSample[],
  candidateIndex: number,
  roundedMarker: { latitude: number; longitude: number },
  nextMarker: { latitude: number; longitude: number },
): boolean {
  const candidateMarkDistance = distanceMeters(samples[candidateIndex], roundedMarker)
  const candidateNextDistance = distanceMeters(samples[candidateIndex], nextMarker)
  const lookaheadEnd = Math.min(samples.length - 1, candidateIndex + DEPARTURE_LOOKAHEAD_SAMPLES)

  for (let index = candidateIndex + 1; index <= lookaheadEnd; index += 1) {
    const markDeparture = distanceMeters(samples[index], roundedMarker) - candidateMarkDistance
    const nextMarkProgress = candidateNextDistance - distanceMeters(samples[index], nextMarker)
    if (markDeparture >= MIN_MARK_DEPARTURE_METERS && nextMarkProgress >= MIN_NEXT_MARK_PROGRESS_METERS) return true
  }

  return false
}

function createLeg(samples: RaceSample[], startIndex: number, endIndex: number, startMarker: RaceLegMarker | undefined, endMarker: 'K1' | 'L1'): RaceLeg {
  const start = samples[startIndex]
  const end = samples[endIndex]
  const type: RaceLegType = startMarker === undefined ? 'start-to-k1' : startMarker === 'K1' && endMarker === 'L1' ? 'k1-to-l1' : 'l1-to-k1'
  const startTime = Date.parse(start.timestamp)
  const endTime = Date.parse(end.timestamp)
  return {
    id: `${type}-${startIndex}-${endIndex}`,
    type,
    startSampleIndex: startIndex,
    endSampleIndex: endIndex,
    startTime: start.timestamp,
    endTime: end.timestamp,
    startPosition: { latitude: start.latitude, longitude: start.longitude },
    endPosition: { latitude: end.latitude, longitude: end.longitude },
    durationSeconds: Number.isFinite(startTime) && Number.isFinite(endTime) ? Math.max(0, (endTime - startTime) / 1000) : 0,
    distanceMeters: calculateTravelledDistance(samples, startIndex, endIndex),
    ...(startMarker === undefined ? {} : { startMarker }),
    endMarker,
  }
}

function calculateTravelledDistance(samples: RaceSample[], startIndex: number, endIndex: number): number {
  let distance = 0
  for (let index = startIndex + 1; index <= endIndex; index += 1) distance += distanceMeters(samples[index - 1], samples[index])
  return distance
}

function distanceMeters(first: { latitude: number; longitude: number }, second: { latitude: number; longitude: number }): number {
  const earthRadius = 6_371_000
  const latitudeDelta = (second.latitude - first.latitude) * Math.PI / 180
  const longitudeDelta = (second.longitude - first.longitude) * Math.PI / 180
  const latitude = first.latitude * Math.PI / 180
  const nextLatitude = second.latitude * Math.PI / 180
  const haversine = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(latitude) * Math.cos(nextLatitude) * Math.sin(longitudeDelta / 2) ** 2
  return earthRadius * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(Math.max(0, 1 - haversine)))
}
