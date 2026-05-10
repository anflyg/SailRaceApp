import { Capacitor, registerPlugin } from '@capacitor/core'
import { averageAnglesDegrees, normalizeDegrees } from '../../domain/angles'
import { measureWindHeading as measureMockWindHeading } from './mockSensorService'

export const WIND_HEADING_SAMPLE_DURATION_MS = 2000
export const WIND_HEADING_SAMPLE_INTERVAL_MS = 100
export const MIN_WIND_HEADING_SAMPLES = 5

export type WindHeadingReferenceFrame = 'true-north' | 'magnetic-north' | 'mock'

export interface WindHeadingMeasurementResult {
  headingDegrees: number
  sampleCount: number
  referenceFrame: WindHeadingReferenceFrame
  accuracyDegrees: number | null
}

interface NativeWindHeadingSample {
  headingDegrees: number | null
  referenceFrame: 'true-north' | 'magnetic-north'
  accuracyDegrees?: number | null
  valid?: boolean
}

interface WindHeadingNativePlugin {
  getBackVectorHeading(): Promise<NativeWindHeadingSample>
  stopBackVectorHeading(): Promise<void>
}

const WindHeadingNative = registerPlugin<WindHeadingNativePlugin>('WindHeading')

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds)
  })
}

function isValidHeading(heading: number | null | undefined): heading is number {
  return typeof heading === 'number' && Number.isFinite(heading) && heading >= 0
}

async function measureMockHeading(): Promise<WindHeadingMeasurementResult> {
  const reading = await measureMockWindHeading(20)

  return {
    headingDegrees: normalizeDegrees(reading.headingDegrees),
    sampleCount: reading.sampleCount,
    referenceFrame: 'mock',
    accuracyDegrees: reading.accuracyDegrees ?? null,
  }
}

export async function measureWindHeading(): Promise<WindHeadingMeasurementResult | null> {
  if (!Capacitor.isNativePlatform()) {
    return measureMockHeading()
  }

  const samples: number[] = []
  let referenceFrame: WindHeadingReferenceFrame | null = null
  let accuracyDegrees: number | null = null
  const startedAt = Date.now()

  try {
    while (Date.now() - startedAt < WIND_HEADING_SAMPLE_DURATION_MS) {
      const sample = await WindHeadingNative.getBackVectorHeading()

      if (sample.valid !== false && isValidHeading(sample.headingDegrees)) {
        samples.push(normalizeDegrees(sample.headingDegrees))
        referenceFrame = sample.referenceFrame
        accuracyDegrees = sample.accuracyDegrees ?? accuracyDegrees
      }

      await wait(WIND_HEADING_SAMPLE_INTERVAL_MS)
    }
  } catch {
    return null
  } finally {
    await WindHeadingNative.stopBackVectorHeading().catch(() => undefined)
  }

  if (samples.length < MIN_WIND_HEADING_SAMPLES || referenceFrame === null) {
    return null
  }

  const headingDegrees = averageAnglesDegrees(samples)

  if (headingDegrees === null) {
    return null
  }

  return {
    headingDegrees,
    sampleCount: samples.length,
    referenceFrame,
    accuracyDegrees,
  }
}
