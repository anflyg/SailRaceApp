import { analyzeRaceLegs, type RaceLeg, type RaceLegType } from './raceLegAnalysis'
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
  const bestUpwind = selectBestLeg(upwind, true)
  const bestDownwind = selectBestLeg(downwind, false)
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

export function selectBestLeg(legs: RaceLegMetric[], upwind: boolean): RaceLegMetric | null {
  if (!legs.length) return null
  const withVmg = legs.filter((leg) => leg.averageVmgWindKnots !== null)
  if (upwind && withVmg.length >= 2) return withVmg.reduce((best, leg) => (leg.averageVmgWindKnots! > best.averageVmgWindKnots! ? leg : best))
  if (!upwind) {
    const withSpeed = legs.filter((leg) => leg.averageSpeedKnots !== null)
    if (withSpeed.length) return withSpeed.reduce((best, leg) => leg.averageSpeedKnots! > best.averageSpeedKnots! || (leg.averageSpeedKnots === best.averageSpeedKnots && leg.durationSeconds < best.durationSeconds) ? leg : best)
  }
  return legs.reduce((best, leg) => leg.durationSeconds < best.durationSeconds ? leg : best)
}

function values(samples: RaceSample[], read: (sample: RaceSample) => number | undefined): number[] {
  return samples.map(read).filter((value): value is number => value !== undefined && Number.isFinite(value))
}

function average(items: number[]): number | null {
  return items.length ? items.reduce((sum, value) => sum + value, 0) / items.length : null
}
