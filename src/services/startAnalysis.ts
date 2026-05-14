import type { Race, RaceSample } from '../types'

export type StartAnalysisStatus =
  | 'ok'
  | 'missing-start-line'
  | 'missing-start-gun'
  | 'not-enough-samples'
  | 'no-crossing'
  | 'uncertain'

export type StartAnalysisResult = {
  status: StartAnalysisStatus
  startGunTime?: string
  crossingTime?: string
  deltaSeconds?: number
  crossingSpeedKnots?: number
  crossingCogDegrees?: number
  crossingAccuracyMeters?: number
  uncertaintyMeters?: number
  uncertaintySeconds?: number
  beforeSample?: RaceSample
  afterSample?: RaceSample
  crossingPoint?: {
    latitude: number
    longitude: number
  }
}

type LocalPoint = {
  x: number
  y: number
}

type CrossingCandidate = Required<Pick<
  StartAnalysisResult,
  'crossingTime' | 'deltaSeconds' | 'beforeSample' | 'afterSample' | 'crossingPoint'
>> & Pick<
  StartAnalysisResult,
  'crossingSpeedKnots' | 'crossingCogDegrees' | 'crossingAccuracyMeters' | 'uncertaintyMeters' | 'uncertaintySeconds'
>

const START_WINDOW_BEFORE_MS = 90 * 1000
const START_WINDOW_AFTER_MS = 120 * 1000
const UNCERTAIN_SAMPLE_GAP_SECONDS = 8
const UNCERTAIN_METERS = 12
const METERS_PER_SECOND_TO_KNOTS = 1.943844

export function analyzeRaceStart(race: Race): StartAnalysisResult {
  const startLine = race.course?.startLine

  if (!startLine) {
    return {
      status: 'missing-start-line',
      startGunTime: race.startGunTime,
    }
  }

  if (!race.startGunTime) {
    return {
      status: 'missing-start-gun',
    }
  }

  const startGunTimestamp = Date.parse(race.startGunTime)

  if (!Number.isFinite(startGunTimestamp)) {
    return {
      status: 'missing-start-gun',
    }
  }

  const samples = race.samples
    .filter((sample) => Number.isFinite(Date.parse(sample.timestamp)))
    .sort((firstSample, secondSample) => Date.parse(firstSample.timestamp) - Date.parse(secondSample.timestamp))
  const windowedSamples = samples.filter((sample) => {
    const timestamp = Date.parse(sample.timestamp)

    return (
      timestamp >= startGunTimestamp - START_WINDOW_BEFORE_MS &&
      timestamp <= startGunTimestamp + START_WINDOW_AFTER_MS
    )
  })

  if (windowedSamples.length < 2) {
    return {
      status: 'not-enough-samples',
      startGunTime: race.startGunTime,
    }
  }

  const candidates = findCrossingCandidates({
    samples: windowedSamples,
    startLinePort: startLine.port,
    startLineStarboard: startLine.starboard,
    startGunTimestamp,
  })

  if (candidates.length === 0) {
    return {
      status: 'no-crossing',
      startGunTime: race.startGunTime,
    }
  }

  const selectedCandidate = candidates.sort((firstCandidate, secondCandidate) => (
    Math.abs(firstCandidate.deltaSeconds) - Math.abs(secondCandidate.deltaSeconds)
  ))[0]
  const isUncertain =
    (selectedCandidate.uncertaintySeconds ?? 0) > UNCERTAIN_SAMPLE_GAP_SECONDS ||
    (selectedCandidate.uncertaintyMeters ?? 0) > UNCERTAIN_METERS

  return {
    ...selectedCandidate,
    startGunTime: race.startGunTime,
    deltaSeconds: roundToNearestHalfSecond(selectedCandidate.deltaSeconds),
    uncertaintySeconds: selectedCandidate.uncertaintySeconds !== undefined
      ? Math.ceil(selectedCandidate.uncertaintySeconds)
      : undefined,
    uncertaintyMeters: selectedCandidate.uncertaintyMeters !== undefined
      ? Math.ceil(selectedCandidate.uncertaintyMeters)
      : undefined,
    status: isUncertain ? 'uncertain' : 'ok',
  }
}

function findCrossingCandidates({
  samples,
  startLinePort,
  startLineStarboard,
  startGunTimestamp,
}: {
  samples: RaceSample[]
  startLinePort: { latitude: number; longitude: number }
  startLineStarboard: { latitude: number; longitude: number }
  startGunTimestamp: number
}): CrossingCandidate[] {
  const startLinePortLocal = toLocalMeters(startLinePort, startLinePort)
  const startLineStarboardLocal = toLocalMeters(startLineStarboard, startLinePort)
  const candidates: CrossingCandidate[] = []

  for (let index = 1; index < samples.length; index += 1) {
    const beforeSample = samples[index - 1]
    const afterSample = samples[index]
    const beforeLocal = toLocalMeters(beforeSample, startLinePort)
    const afterLocal = toLocalMeters(afterSample, startLinePort)
    const crossing = getSegmentIntersection(beforeLocal, afterLocal, startLinePortLocal, startLineStarboardLocal)

    if (!crossing) {
      continue
    }

    const beforeTimestamp = Date.parse(beforeSample.timestamp)
    const afterTimestamp = Date.parse(afterSample.timestamp)

    if (!Number.isFinite(beforeTimestamp) || !Number.isFinite(afterTimestamp) || afterTimestamp <= beforeTimestamp) {
      continue
    }

    const crossingTimestamp = beforeTimestamp + (afterTimestamp - beforeTimestamp) * crossing.trackRatio
    const sampleGapSeconds = (afterTimestamp - beforeTimestamp) / 1000
    const crossingPoint = interpolateGeoPoint(beforeSample, afterSample, crossing.trackRatio)
    const inferredSpeedKnots = getInferredSpeedKnots(beforeLocal, afterLocal, sampleGapSeconds)
    const crossingSpeedKnots = interpolateOptionalNumber(
      beforeSample.speedKnots,
      afterSample.speedKnots,
      crossing.trackRatio,
    ) ?? inferredSpeedKnots

    candidates.push({
      crossingTime: new Date(crossingTimestamp).toISOString(),
      deltaSeconds: (crossingTimestamp - startGunTimestamp) / 1000,
      crossingSpeedKnots,
      crossingCogDegrees: interpolateOptionalAngle(
        beforeSample.cogDegrees,
        afterSample.cogDegrees,
        crossing.trackRatio,
      ),
      crossingAccuracyMeters: interpolateOptionalNumber(
        beforeSample.accuracy,
        afterSample.accuracy,
        crossing.trackRatio,
      ),
      uncertaintyMeters: calculateUncertaintyMeters(beforeSample, afterSample, beforeLocal, afterLocal, sampleGapSeconds),
      uncertaintySeconds: calculateUncertaintySeconds(beforeSample, afterSample, sampleGapSeconds, crossingSpeedKnots),
      beforeSample,
      afterSample,
      crossingPoint,
    })
  }

  return candidates
}

function getSegmentIntersection(
  trackStart: LocalPoint,
  trackEnd: LocalPoint,
  lineStart: LocalPoint,
  lineEnd: LocalPoint,
): { trackRatio: number; lineRatio: number } | null {
  const trackVector = {
    x: trackEnd.x - trackStart.x,
    y: trackEnd.y - trackStart.y,
  }
  const lineVector = {
    x: lineEnd.x - lineStart.x,
    y: lineEnd.y - lineStart.y,
  }
  const denominator = cross(trackVector, lineVector)

  if (Math.abs(denominator) < 1e-9) {
    return null
  }

  const lineToTrackStart = {
    x: lineStart.x - trackStart.x,
    y: lineStart.y - trackStart.y,
  }
  const trackRatio = cross(lineToTrackStart, lineVector) / denominator
  const lineRatio = cross(lineToTrackStart, trackVector) / denominator

  if (trackRatio < 0 || trackRatio > 1 || lineRatio < 0 || lineRatio > 1) {
    return null
  }

  return {
    trackRatio,
    lineRatio,
  }
}

function calculateUncertaintyMeters(
  beforeSample: RaceSample,
  afterSample: RaceSample,
  beforeLocal: LocalPoint,
  afterLocal: LocalPoint,
  sampleGapSeconds: number,
): number {
  const beforeAccuracy = beforeSample.accuracy ?? 0
  const afterAccuracy = afterSample.accuracy ?? 0
  const trackDistanceMeters = getDistanceMeters(beforeLocal, afterLocal)
  const samplingUncertaintyMeters = sampleGapSeconds > 0 ? Math.min(trackDistanceMeters / 2, trackDistanceMeters) : 0

  return Math.max(beforeAccuracy, afterAccuracy, samplingUncertaintyMeters)
}

function calculateUncertaintySeconds(
  beforeSample: RaceSample,
  afterSample: RaceSample,
  sampleGapSeconds: number,
  crossingSpeedKnots: number | undefined,
): number {
  const accuracyMeters = Math.max(beforeSample.accuracy ?? 0, afterSample.accuracy ?? 0)
  const speedMetersPerSecond = crossingSpeedKnots !== undefined
    ? crossingSpeedKnots / METERS_PER_SECOND_TO_KNOTS
    : 0
  const gpsUncertaintySeconds = speedMetersPerSecond > 0.1 ? accuracyMeters / speedMetersPerSecond : 0

  return Math.max(sampleGapSeconds / 2, gpsUncertaintySeconds)
}

function getInferredSpeedKnots(beforeLocal: LocalPoint, afterLocal: LocalPoint, sampleGapSeconds: number): number | undefined {
  if (sampleGapSeconds <= 0) {
    return undefined
  }

  return (getDistanceMeters(beforeLocal, afterLocal) / sampleGapSeconds) * METERS_PER_SECOND_TO_KNOTS
}

function interpolateGeoPoint(beforeSample: RaceSample, afterSample: RaceSample, ratio: number): {
  latitude: number
  longitude: number
} {
  return {
    latitude: beforeSample.latitude + (afterSample.latitude - beforeSample.latitude) * ratio,
    longitude: beforeSample.longitude + (afterSample.longitude - beforeSample.longitude) * ratio,
  }
}

function interpolateOptionalNumber(
  beforeValue: number | undefined,
  afterValue: number | undefined,
  ratio: number,
): number | undefined {
  if (!isFiniteNumber(beforeValue) || !isFiniteNumber(afterValue)) {
    return undefined
  }

  return beforeValue + (afterValue - beforeValue) * ratio
}

function interpolateOptionalAngle(
  beforeValue: number | undefined,
  afterValue: number | undefined,
  ratio: number,
): number | undefined {
  if (!isFiniteNumber(beforeValue) || !isFiniteNumber(afterValue)) {
    return undefined
  }

  const delta = ((((afterValue - beforeValue) % 360) + 540) % 360) - 180

  return normalizeDegrees(beforeValue + delta * ratio)
}

function toLocalMeters(
  point: { latitude: number; longitude: number },
  origin: { latitude: number; longitude: number },
): LocalPoint {
  const metersPerDegreeLatitude = 111_320
  const metersPerDegreeLongitude = metersPerDegreeLatitude * Math.cos(toRadians(origin.latitude))

  return {
    x: (point.longitude - origin.longitude) * metersPerDegreeLongitude,
    y: (point.latitude - origin.latitude) * metersPerDegreeLatitude,
  }
}

function getDistanceMeters(firstPoint: LocalPoint, secondPoint: LocalPoint): number {
  return Math.hypot(secondPoint.x - firstPoint.x, secondPoint.y - firstPoint.y)
}

function cross(firstPoint: LocalPoint, secondPoint: LocalPoint): number {
  return firstPoint.x * secondPoint.y - firstPoint.y * secondPoint.x
}

function roundToNearestHalfSecond(value: number): number {
  return Math.round(value * 2) / 2
}

function normalizeDegrees(degrees: number): number {
  return ((degrees % 360) + 360) % 360
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}
