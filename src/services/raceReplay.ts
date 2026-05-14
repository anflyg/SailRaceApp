import type { Race, RaceSample } from '../types'

export type ReplayInterpolationMode = 'exact' | 'interpolated' | 'nearest'

export type ReplaySamplePoint = RaceSample & {
  replaySeconds: number
}

export type ReplayFrame = {
  currentReplayTime: number
  sample: ReplaySamplePoint
  interpolationMode: ReplayInterpolationMode
  previousSample?: ReplaySamplePoint
  nextSample?: ReplaySamplePoint
}

export type ReplayTimeline = {
  durationSeconds: number
  samples: ReplaySamplePoint[]
}

export function buildReplayTimeline(race: Race | null): ReplayTimeline {
  if (!race) {
    return {
      durationSeconds: 0,
      samples: [],
    }
  }

  const sortedSamples = [...race.samples].sort((firstSample, secondSample) => (
    getSampleTimestamp(firstSample) - getSampleTimestamp(secondSample)
  ))
  const fallbackStartTime = getRaceStartTimestamp(race, sortedSamples)
  const samples = sortedSamples
    .map((sample) => addReplaySeconds(sample, fallbackStartTime))
    .filter((sample): sample is ReplaySamplePoint => sample !== null)
    .sort((firstSample, secondSample) => firstSample.replaySeconds - secondSample.replaySeconds)
  const sampleDuration = samples.length > 0
    ? Math.max(...samples.map((sample) => sample.replaySeconds))
    : 0
  const summaryDuration = race.summary?.durationSeconds ?? 0

  return {
    durationSeconds: Math.max(0, summaryDuration, sampleDuration),
    samples,
  }
}

export function getReplayFrame(
  timeline: ReplayTimeline,
  currentReplayTime: number,
): ReplayFrame | null {
  if (timeline.samples.length === 0) {
    return null
  }

  const clampedReplayTime = clamp(currentReplayTime, 0, timeline.durationSeconds)

  if (timeline.samples.length === 1) {
    return {
      currentReplayTime: clampedReplayTime,
      sample: timeline.samples[0],
      interpolationMode: 'exact',
    }
  }

  const exactSample = timeline.samples.find((sample) => sample.replaySeconds === clampedReplayTime)

  if (exactSample) {
    return {
      currentReplayTime: clampedReplayTime,
      sample: exactSample,
      interpolationMode: 'exact',
    }
  }

  const nextSampleIndex = timeline.samples.findIndex((sample) => sample.replaySeconds > clampedReplayTime)

  if (nextSampleIndex <= 0) {
    const nearestSample = getNearestSample(timeline.samples, clampedReplayTime)

    return {
      currentReplayTime: clampedReplayTime,
      sample: nearestSample,
      interpolationMode: 'nearest',
    }
  }

  const previousSample = timeline.samples[nextSampleIndex - 1]
  const nextSample = timeline.samples[nextSampleIndex]
  const interpolatedSample = interpolateSamples(previousSample, nextSample, clampedReplayTime)

  if (!interpolatedSample) {
    return {
      currentReplayTime: clampedReplayTime,
      sample: getNearestSample([previousSample, nextSample], clampedReplayTime),
      interpolationMode: 'nearest',
      previousSample,
      nextSample,
    }
  }

  return {
    currentReplayTime: clampedReplayTime,
    sample: interpolatedSample,
    interpolationMode: 'interpolated',
    previousSample,
    nextSample,
  }
}

export function clampReplayTime(timeline: ReplayTimeline, currentReplayTime: number): number {
  return clamp(currentReplayTime, 0, timeline.durationSeconds)
}

function addReplaySeconds(sample: RaceSample, fallbackStartTime: number): ReplaySamplePoint | null {
  if (typeof sample.elapsedSeconds === 'number' && Number.isFinite(sample.elapsedSeconds)) {
    return {
      ...sample,
      replaySeconds: Math.max(0, sample.elapsedSeconds),
    }
  }

  const sampleTimestamp = getSampleTimestamp(sample)

  if (!Number.isFinite(sampleTimestamp) || !Number.isFinite(fallbackStartTime)) {
    return null
  }

  return {
    ...sample,
    replaySeconds: Math.max(0, (sampleTimestamp - fallbackStartTime) / 1000),
  }
}

function interpolateSamples(
  previousSample: ReplaySamplePoint,
  nextSample: ReplaySamplePoint,
  currentReplayTime: number,
): ReplaySamplePoint | null {
  const replayDelta = nextSample.replaySeconds - previousSample.replaySeconds

  if (replayDelta <= 0) {
    return null
  }

  const ratio = clamp((currentReplayTime - previousSample.replaySeconds) / replayDelta, 0, 1)
  const nearestSample = ratio <= 0.5 ? previousSample : nextSample

  return {
    ...nearestSample,
    timestamp: interpolateTimestamp(previousSample, nextSample, ratio),
    elapsedSeconds: currentReplayTime,
    replaySeconds: currentReplayTime,
    latitude: interpolateNumber(previousSample.latitude, nextSample.latitude, ratio) ?? nearestSample.latitude,
    longitude: interpolateNumber(previousSample.longitude, nextSample.longitude, ratio) ?? nearestSample.longitude,
    accuracy: interpolateOptionalNumber(previousSample.accuracy, nextSample.accuracy, ratio, nearestSample.accuracy),
    speedKnots: interpolateOptionalNumber(
      previousSample.speedKnots,
      nextSample.speedKnots,
      ratio,
      nearestSample.speedKnots,
    ),
    cogDegrees: interpolateOptionalAngle(
      previousSample.cogDegrees,
      nextSample.cogDegrees,
      ratio,
      nearestSample.cogDegrees,
    ),
    headingDegrees: interpolateOptionalAngle(
      previousSample.headingDegrees,
      nextSample.headingDegrees,
      ratio,
      nearestSample.headingDegrees,
    ),
    windDirectionDegrees: interpolateOptionalAngle(
      previousSample.windDirectionDegrees,
      nextSample.windDirectionDegrees,
      ratio,
      nearestSample.windDirectionDegrees,
    ),
    vmgCourseKnots: interpolateOptionalNumber(
      previousSample.vmgCourseKnots,
      nextSample.vmgCourseKnots,
      ratio,
      nearestSample.vmgCourseKnots,
    ),
    vmgWindKnots: interpolateOptionalNumber(
      previousSample.vmgWindKnots,
      nextSample.vmgWindKnots,
      ratio,
      nearestSample.vmgWindKnots,
    ),
  }
}

function interpolateTimestamp(previousSample: ReplaySamplePoint, nextSample: ReplaySamplePoint, ratio: number): string {
  const previousTimestamp = getSampleTimestamp(previousSample)
  const nextTimestamp = getSampleTimestamp(nextSample)

  if (!Number.isFinite(previousTimestamp) || !Number.isFinite(nextTimestamp)) {
    return ratio <= 0.5 ? previousSample.timestamp : nextSample.timestamp
  }

  return new Date(previousTimestamp + (nextTimestamp - previousTimestamp) * ratio).toISOString()
}

function interpolateOptionalNumber(
  firstValue: number | undefined,
  secondValue: number | undefined,
  ratio: number,
  fallbackValue: number | undefined,
): number | undefined {
  return interpolateNumber(firstValue, secondValue, ratio) ?? fallbackValue
}

function interpolateNumber(
  firstValue: number | undefined,
  secondValue: number | undefined,
  ratio: number,
): number | undefined {
  if (!isFiniteNumber(firstValue) || !isFiniteNumber(secondValue)) {
    return undefined
  }

  return firstValue + (secondValue - firstValue) * ratio
}

function interpolateOptionalAngle(
  firstValue: number | undefined,
  secondValue: number | undefined,
  ratio: number,
  fallbackValue: number | undefined,
): number | undefined {
  if (!isFiniteNumber(firstValue) || !isFiniteNumber(secondValue)) {
    return fallbackValue
  }

  const delta = ((((secondValue - firstValue) % 360) + 540) % 360) - 180

  return normalizeDegrees(firstValue + delta * ratio)
}

function getNearestSample(samples: ReplaySamplePoint[], currentReplayTime: number): ReplaySamplePoint {
  return samples.reduce((nearestSample, sample) => {
    const nearestDelta = Math.abs(nearestSample.replaySeconds - currentReplayTime)
    const sampleDelta = Math.abs(sample.replaySeconds - currentReplayTime)

    return sampleDelta < nearestDelta ? sample : nearestSample
  }, samples[0])
}

function getRaceStartTimestamp(race: Race, samples: RaceSample[]): number {
  const startGunTimestamp = race.startGunTime ? Date.parse(race.startGunTime) : Number.NaN

  if (Number.isFinite(startGunTimestamp)) {
    return startGunTimestamp
  }

  const firstSampleTimestamp = samples.length > 0 ? getSampleTimestamp(samples[0]) : Number.NaN

  return Number.isFinite(firstSampleTimestamp) ? firstSampleTimestamp : Date.parse(race.createdAt)
}

function getSampleTimestamp(sample: RaceSample): number {
  const timestamp = Date.parse(sample.timestamp)

  return Number.isFinite(timestamp) ? timestamp : Number.NaN
}

function normalizeDegrees(degrees: number): number {
  return ((degrees % 360) + 360) % 360
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    return min
  }

  return Math.min(max, Math.max(min, value))
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}
