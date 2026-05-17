import { Capacitor, registerPlugin } from '@capacitor/core'
import { averageAnglesDegrees, getCircularSpreadDegrees, normalizeDegrees } from '../../domain/angles'
import { measureWindHeading as measureMockWindHeading } from './mockSensorService'

export const WIND_HEADING_SAMPLE_DURATION_MS = 8000
export const WIND_HEADING_SAMPLE_INTERVAL_MS = 100
export const MIN_WIND_HEADING_SAMPLES = 50
export const MAX_WIND_HEADING_SPREAD_DEGREES = 10

export type WindHeadingReferenceFrame = 'true-north' | 'magnetic-north' | 'mock'
export type WindHeadingQuality = 'good' | 'ok' | 'poor' | 'unstable' | 'unknown'
export type WindHeadingMeasurementErrorReason = 'failed' | 'insufficient-samples' | 'unstable'

export interface WindHeadingMatrixDebug {
  m11: number
  m12: number
  m13: number
  m21: number
  m22: number
  m23: number
  m31: number
  m32: number
  m33: number
}

export interface WindHeadingAlternativeHeadingsDebug {
  backVectorHeadingDegrees: number | null
  backVectorHeadingRowDegrees: number | null
  frontVectorHeadingDegrees: number | null
  topEdgeHeadingDegrees: number | null
  rightEdgeHeadingDegrees: number | null
}

export interface WindHeadingNativeDebug {
  clTrueHeadingDegrees: number | null
  clMagneticHeadingDegrees: number | null
  headings: WindHeadingAlternativeHeadingsDebug
  matrix: WindHeadingMatrixDebug
}

export interface WindHeadingMeasurementResult {
  headingDegrees: number
  sampleCount: number
  referenceFrame: WindHeadingReferenceFrame
  accuracyDegrees: number | null
  spreadDegrees: number | null
  quality: WindHeadingQuality
  nativeDebug: WindHeadingNativeDebug | null
}

export class WindHeadingMeasurementError extends Error {
  readonly reason: WindHeadingMeasurementErrorReason
  readonly result: WindHeadingMeasurementResult | null

  constructor(
    reason: WindHeadingMeasurementErrorReason,
    message: string,
    result: WindHeadingMeasurementResult | null = null,
  ) {
    super(message)
    this.name = 'WindHeadingMeasurementError'
    this.reason = reason
    this.result = result
  }
}

interface NativeWindHeadingSample {
  headingDegrees: number | null
  referenceFrame: 'true-north' | 'magnetic-north'
  accuracyDegrees?: number | null
  nativeDebug?: WindHeadingNativeDebug | null
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

function getValidAccuracyDegrees(accuracyDegrees: number | null | undefined): number | null {
  return typeof accuracyDegrees === 'number' &&
    Number.isFinite(accuracyDegrees) &&
    accuracyDegrees >= 0
    ? accuracyDegrees
    : null
}

function getValidDebugData(nativeDebug: WindHeadingNativeDebug | null | undefined): WindHeadingNativeDebug | null {
  if (!nativeDebug) {
    return null
  }

  return nativeDebug
}

function averageAccuracyDegrees(accuracySamples: number[]): number | null {
  if (accuracySamples.length === 0) {
    return null
  }

  const sum = accuracySamples.reduce((total, accuracyDegrees) => total + accuracyDegrees, 0)
  return sum / accuracySamples.length
}

function getMeasurementQuality(
  accuracyDegrees: number | null,
  spreadDegrees: number | null,
): WindHeadingQuality {
  if (spreadDegrees === null) {
    return 'unknown'
  }

  if (spreadDegrees > MAX_WIND_HEADING_SPREAD_DEGREES) {
    return 'unstable'
  }

  if (accuracyDegrees === null) {
    return 'unknown'
  }

  if (accuracyDegrees <= 10) {
    return 'good'
  }

  if (accuracyDegrees <= 20) {
    return 'ok'
  }

  return 'poor'
}

async function measureMockHeading(): Promise<WindHeadingMeasurementResult> {
  const reading = await measureMockWindHeading(MIN_WIND_HEADING_SAMPLES)

  const result = createMeasurementResult({
    headingDegrees: normalizeDegrees(reading.headingDegrees),
    sampleCount: reading.sampleCount,
    referenceFrame: 'mock',
    accuracyDegrees: getValidAccuracyDegrees(reading.accuracyDegrees),
    spreadDegrees: reading.spreadDegrees ?? null,
    nativeDebug: null,
  })

  if (result.quality === 'unstable') {
    throw new WindHeadingMeasurementError(
      'unstable',
      'Vindmätning ostabil. Håll båten i vindögat och försök igen.',
      result,
    )
  }

  return result
}

function createMeasurementResult({
  headingDegrees,
  sampleCount,
  referenceFrame,
  accuracyDegrees,
  spreadDegrees,
  nativeDebug,
}: Omit<WindHeadingMeasurementResult, 'quality'>): WindHeadingMeasurementResult {
  const quality = getMeasurementQuality(accuracyDegrees, spreadDegrees)

  return {
    headingDegrees,
    sampleCount,
    referenceFrame,
    accuracyDegrees,
    spreadDegrees,
    quality,
    nativeDebug,
  }
}

export async function measureWindHeading(): Promise<WindHeadingMeasurementResult | null> {
  if (!Capacitor.isNativePlatform()) {
    return measureMockHeading()
  }

  const samples: number[] = []
  const accuracySamples: number[] = []
  let latestNativeDebug: WindHeadingNativeDebug | null = null
  let referenceFrame: WindHeadingReferenceFrame | null = null
  const startedAt = Date.now()

  try {
    while (Date.now() - startedAt < WIND_HEADING_SAMPLE_DURATION_MS) {
      const sample = await WindHeadingNative.getBackVectorHeading()

      if (sample.valid !== false && isValidHeading(sample.headingDegrees)) {
        samples.push(normalizeDegrees(sample.headingDegrees))
        referenceFrame = sample.referenceFrame

        const accuracyDegrees = getValidAccuracyDegrees(sample.accuracyDegrees)
        const nativeDebug = getValidDebugData(sample.nativeDebug)

        if (accuracyDegrees !== null) {
          accuracySamples.push(accuracyDegrees)
        }

        if (nativeDebug !== null) {
          latestNativeDebug = nativeDebug
        }
      }

      await wait(WIND_HEADING_SAMPLE_INTERVAL_MS)
    }
  } catch {
    throw new WindHeadingMeasurementError('failed', 'Kunde inte mäta vind')
  } finally {
    await WindHeadingNative.stopBackVectorHeading().catch(() => undefined)
  }

  if (samples.length < MIN_WIND_HEADING_SAMPLES || referenceFrame === null) {
    throw new WindHeadingMeasurementError(
      'insufficient-samples',
      'För få kompassvärden. Försök igen.',
    )
  }

  const headingDegrees = averageAnglesDegrees(samples)

  if (headingDegrees === null) {
    throw new WindHeadingMeasurementError('failed', 'Kunde inte mäta vind')
  }

  const spreadDegrees = getCircularSpreadDegrees(samples, headingDegrees)

  if (spreadDegrees === null) {
    throw new WindHeadingMeasurementError('failed', 'Kunde inte mäta vind')
  }

  const result = createMeasurementResult({
    headingDegrees,
    sampleCount: samples.length,
    referenceFrame,
    accuracyDegrees: averageAccuracyDegrees(accuracySamples),
    spreadDegrees,
    nativeDebug: latestNativeDebug,
  })

  if (result.quality === 'unstable') {
    throw new WindHeadingMeasurementError(
      'unstable',
      'Vindmätning ostabil. Håll båten i vindögat och försök igen.',
      result,
    )
  }

  return result
}
