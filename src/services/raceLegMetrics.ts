import { analyzeRaceLegs, type RaceLeg, type RaceLegType } from './raceLegAnalysis'
import { createRace, listRaces } from './raceStorage'
import type { Race, RaceSample } from '../types'

export type RaceLegMetric = RaceLeg & {
  label: string
  averageSpeedKnots: number | null
  maxSpeedKnots: number | null
  averageVmgWindKnots: number | null
  averageVmgCourseKnots: number | null
  sampleCount: number
  isBest: boolean
}

export type RaceLegMetricsResult = {
  legs: RaceLegMetric[]
  totalLegs: number
  upwindCount: number
  downwindCount: number
  bestUpwind: RaceLegMetric | null
  bestDownwind: RaceLegMetric | null
}

export function calculateRaceLegMetrics(race: Race): RaceLegMetricsResult {
  const segmentation = analyzeRaceLegs(race)
  const metrics = segmentation.legs.map((leg, index) => calculateMetric(leg, race.samples, index))
  const upwind = metrics.filter((leg) => leg.type === 'start-to-k1' || leg.type === 'l1-to-k1')
  const downwind = metrics.filter((leg) => leg.type === 'k1-to-l1')
  const bestUpwind = selectBest(upwind, true)
  const bestDownwind = selectBest(downwind, false)
  const bestIds = new Set([bestUpwind?.id, bestDownwind?.id])

  return {
    legs: metrics.map((leg) => ({ ...leg, isBest: bestIds.has(leg.id) })),
    totalLegs: metrics.length,
    upwindCount: upwind.length,
    downwindCount: downwind.length,
    bestUpwind,
    bestDownwind,
  }
}

export function ensureMetricsValidationRace(): Race {
  const name = 'Metrics validation fixture'
  const existing = listRaces().find((race) => race.name === name)
  if (existing) return existing
  const base = Date.parse('2024-01-01T12:00:00Z')
  const sample = (seconds: number, latitude: number, longitude: number, speed: number, vmgWind?: number, vmgCourse?: number): RaceSample => ({
    timestamp: new Date(base + seconds * 1000).toISOString(), latitude, longitude, speedKnots: speed, vmgWindKnots: vmgWind, vmgCourseKnots: vmgCourse,
  })
  return createRace({
    name,
    date: new Date(base),
    createdAt: new Date(base).toISOString(),
    startGunTime: new Date(base).toISOString(),
    course: { startLine: { port: { latitude: 59.3, longitude: 18 }, starboard: { latitude: 59.3, longitude: 18.001 } }, windwardMark: { latitude: 59.301, longitude: 18 }, leewardMark: { latitude: 59.301, longitude: 18.001 } },
    samples: [
      sample(0, 59.3, 18, 4, 3, 2), sample(10, 59.3006, 18.00001, 5, 3, 2), sample(20, 59.30095, 18.00002, 6, 3, 2), sample(30, 59.30105, 18.0001, 7, 3, 2),
      sample(40, 59.30102, 18.0006, 5), sample(50, 59.30101, 18.00095, 6), sample(60, 59.30102, 18.00105, 7),
      sample(70, 59.3009, 18.00098, 5), sample(80, 59.3005, 18.0005, 6), sample(90, 59.30095, 18.0001, 6, 4, 3), sample(100, 59.30102, 18.00002, 6, 4, 3),
      sample(110, 59.30112, 18.00001, 6, 4, 3), sample(120, 59.3011, 18.0003, 6, 4, 3),
    ],
    events: [],
  })
}

export function getRaceLegLabel(type: RaceLegType, sequenceIndex: number): string {
  const isUpwind = type === 'start-to-k1' || type === 'l1-to-k1'
  const upwindNumber = type === 'start-to-k1' ? 1 : Math.floor(sequenceIndex / 2) + 1
  const downwindNumber = Math.floor(sequenceIndex / 2) + 1
  return `${isUpwind ? 'Kryss' : 'Läns'} ${isUpwind ? upwindNumber : downwindNumber}`
}

function calculateMetric(leg: RaceLeg, samples: RaceSample[], sequenceIndex: number): RaceLegMetric {
  const firstMetricSample = leg.startMarker === undefined ? leg.startSampleIndex : leg.startSampleIndex + 1
  const legSamples = samples.slice(firstMetricSample, leg.endSampleIndex + 1)
  const speeds = values(legSamples, (sample) => sample.speedKnots)
  const vmgWind = values(legSamples, (sample) => sample.vmgWindKnots)
  const vmgCourse = values(legSamples, (sample) => sample.vmgCourseKnots)
  return {
    ...leg,
    label: getRaceLegLabel(leg.type, sequenceIndex),
    averageSpeedKnots: average(speeds),
    maxSpeedKnots: speeds.length ? Math.max(...speeds) : null,
    averageVmgWindKnots: average(vmgWind),
    averageVmgCourseKnots: average(vmgCourse),
    sampleCount: legSamples.length,
    isBest: false,
  }
}

function selectBest(legs: RaceLegMetric[], upwind: boolean): RaceLegMetric | null {
  if (!legs.length) return null
  const withVmg = legs.filter((leg) => leg.averageVmgWindKnots !== null)
  if (upwind && withVmg.length >= 2) return withVmg.reduce((best, leg) => (leg.averageVmgWindKnots! > best.averageVmgWindKnots! ? leg : best))
  return legs.reduce((best, leg) => {
    if (!best) return leg
    if (!upwind && leg.averageSpeedKnots !== null && (best.averageSpeedKnots === null || leg.averageSpeedKnots > best.averageSpeedKnots)) return leg
    return leg.durationSeconds < best.durationSeconds ? leg : best
  }, legs[0])
}

function values(samples: RaceSample[], read: (sample: RaceSample) => number | undefined): number[] {
  return samples.map(read).filter((value): value is number => value !== undefined && Number.isFinite(value))
}

function average(items: number[]): number | null {
  return items.length ? items.reduce((sum, value) => sum + value, 0) / items.length : null
}
