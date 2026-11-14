import { Capacitor, registerPlugin } from '@capacitor/core'
import { averageAnglesDegrees, getCircularSpreadDegrees, normalizeDegrees } from '../../domain/angles'
import { measureWindHeading as measureMockWindHeading } from './mockSensorService'

export const WIND_HEADING_SAMPLE_DURATION_MS = 4000
export const WIND_HEADING_SAMPLE_INTERVAL_MS = 100
export const MIN_WIND_HEADING_SAMPLES = 30
export const MAX_WIND_HEADING_SPREAD_DEGREES = 10

export type WindHeadingReferenceFrame = 'true-north' | 'magnetic-north' | 'mock'
export type WindHeadingQuality = 'good' | 'ok' | 'poor' | 'unstable' | 'unknown'
export type WindHeadingSource = 'back-vector-row' | 'back-vector-column' | 'mock'
export type WindHeadingMeasurementErrorReason = 'failed' | 'insufficient-samples' | 'unstable'
export interface WindHeadingDiagnostics {
  reason: WindHeadingMeasurementErrorReason
  acceptedSamples: number
  missingAccuracySamples: number
  referenceFrame: WindHeadingReferenceFrame | null
  accuracyDegrees: number | null
  spreadDegrees: number | null
}

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
  selectedHeadingDegrees: number
  selectedHeadingSource: WindHeadingSource
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
  readonly diagnostics: WindHeadingDiagnostics | null

  constructor(
    reason: WindHeadingMeasurementErrorReason,
    message: string,
    result: WindHeadingMeasurementResult | null = null,
    diagnostics: WindHeadingDiagnostics | null = null,
  ) {
    super(message)
    this.name = 'WindHeadingMeasurementError'
    this.reason = reason
    this.result = result
    this.diagnostics = diagnostics
  }
}

export interface NativeWindHeadingSample {
  headingDegrees: number | null
  referenceFrame: 'true-north' | 'magnetic-north'
  motionTimestamp?: number | null
  accuracyDegrees?: number | null
  nativeDebug?: WindHeadingNativeDebug | null
  valid?: boolean
  selectedHeadingSource?: WindHeadingSource
}

interface WindHeadingNativePlugin {
  beginBackVectorHeading(): Promise<void>
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
    selectedHeadingDegrees: normalizeDegrees(reading.headingDegrees),
    selectedHeadingSource: 'mock',
    sampleCount: reading.sampleCount,
    referenceFrame: 'mock',
    accuracyDegrees: getValidAccuracyDegrees(reading.accuracyDegrees),
    spreadDegrees: reading.spreadDegrees ?? null,
    nativeDebug: null,
  })

  if (result.quality === 'unstable') {
    throw new WindHeadingMeasurementError(
      'unstable',
      'wind_measurement_unstable',
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
  selectedHeadingDegrees,
  selectedHeadingSource,
}: Omit<WindHeadingMeasurementResult, 'quality'>): WindHeadingMeasurementResult {
  const quality = getMeasurementQuality(accuracyDegrees, spreadDegrees)

  return {
    headingDegrees,
    selectedHeadingDegrees,
    selectedHeadingSource,
    sampleCount,
    referenceFrame,
    accuracyDegrees,
    spreadDegrees,
    quality,
    nativeDebug,
  }
}

// Native validates freshness in each clock domain. Timestamps are transient and never saved.
export class WindMeasurementCollector {
  private samples: number[] = []
  private accuracyDegrees = 0
  private lastMotionTimestamp: number | null = null
  private referenceFrame: 'true-north' | 'magnetic-north' | null = null
  private selectedHeadingSource: 'back-vector-row' | 'back-vector-column' | null = null
  private latestNativeDebug: WindHeadingNativeDebug | null = null
  private missingAccuracySamples = 0
  private observedReferenceFrame: 'true-north' | 'magnetic-north' | null = null
  private mixedReferenceFrames = false

  diagnostics(reason: WindHeadingMeasurementErrorReason, spreadDegrees: number | null = null): WindHeadingDiagnostics {
    const mean = averageAnglesDegrees(this.samples)
    const spread = spreadDegrees ?? (mean === null ? null : getCircularSpreadDegrees(this.samples, mean))
    return { reason, acceptedSamples: this.samples.length, missingAccuracySamples: this.missingAccuracySamples,
      referenceFrame: this.mixedReferenceFrames ? null : this.observedReferenceFrame, accuracyDegrees: this.samples.length ? this.accuracyDegrees : null, spreadDegrees: spread }
  }

  add(sample: NativeWindHeadingSample): void {
    const accuracy = getValidAccuracyDegrees(sample.accuracyDegrees)
    const timestamp = sample.motionTimestamp
    const source = sample.selectedHeadingSource
    if (sample.referenceFrame === 'true-north' || sample.referenceFrame === 'magnetic-north') {
      if (this.observedReferenceFrame && this.observedReferenceFrame !== sample.referenceFrame) this.mixedReferenceFrames = true
      else this.observedReferenceFrame = sample.referenceFrame
    }
    if (sample.valid !== false && isValidHeading(sample.headingDegrees) && accuracy === null) this.missingAccuracySamples++
    if (sample.valid === false || !isValidHeading(sample.headingDegrees) || accuracy === null ||
        typeof timestamp !== 'number' || !Number.isFinite(timestamp) || timestamp < 0 ||
        (this.lastMotionTimestamp !== null && timestamp <= this.lastMotionTimestamp) ||
        (sample.referenceFrame !== 'true-north' && sample.referenceFrame !== 'magnetic-north') ||
        (source !== 'back-vector-row' && source !== 'back-vector-column')) return

    if ((this.referenceFrame !== null && this.referenceFrame !== sample.referenceFrame) ||
        (this.selectedHeadingSource !== null && this.selectedHeadingSource !== source)) {
      throw new WindHeadingMeasurementError('failed', 'wind_measurement_failed', null, this.diagnostics('failed'))
    }
    this.samples.push(normalizeDegrees(sample.headingDegrees))
    this.lastMotionTimestamp = timestamp
    this.referenceFrame = sample.referenceFrame
    this.selectedHeadingSource = source
    this.accuracyDegrees = Math.max(this.accuracyDegrees, accuracy)
    this.latestNativeDebug = getValidDebugData(sample.nativeDebug)
  }

  finish(): WindHeadingMeasurementResult {
    const { samples, referenceFrame, selectedHeadingSource } = this
    if (samples.length < MIN_WIND_HEADING_SAMPLES || referenceFrame === null || selectedHeadingSource === null) {
      throw new WindHeadingMeasurementError(
        'insufficient-samples',
        'wind_measurement_insufficient_samples',
        null,
        this.diagnostics('insufficient-samples'),
      )
    }

    const headingDegrees = averageAnglesDegrees(samples)

    if (headingDegrees === null) {
      throw new WindHeadingMeasurementError('failed', 'wind_measurement_failed', null, this.diagnostics('failed'))
    }

    const spreadDegrees = getCircularSpreadDegrees(samples, headingDegrees)

    if (spreadDegrees === null) {
      throw new WindHeadingMeasurementError('failed', 'wind_measurement_failed', null, this.diagnostics('failed'))
    }

    const result = createMeasurementResult({
      headingDegrees,
      selectedHeadingDegrees: headingDegrees,
      selectedHeadingSource,
      sampleCount: samples.length,
      referenceFrame,
      accuracyDegrees: this.accuracyDegrees,
      spreadDegrees,
      nativeDebug: this.latestNativeDebug,
    })

    if (result.quality === 'unstable') {
      throw new WindHeadingMeasurementError(
        'unstable',
        'wind_measurement_unstable',
        result,
        this.diagnostics('unstable', spreadDegrees),
      )
    }

    return result
  }
}

export async function measureWindHeading(): Promise<WindHeadingMeasurementResult | null> {
  if (!Capacitor.isNativePlatform()) return measureMockHeading()

  const collector = new WindMeasurementCollector()
  try {
    await WindHeadingNative.beginBackVectorHeading()
    const startedAt = Date.now()
    while (Date.now() - startedAt < WIND_HEADING_SAMPLE_DURATION_MS) {
      collector.add(await WindHeadingNative.getBackVectorHeading())
      await wait(WIND_HEADING_SAMPLE_INTERVAL_MS)
    }
    return collector.finish()
  } catch (error) {
    if (error instanceof WindHeadingMeasurementError) throw error
    throw new WindHeadingMeasurementError('failed', 'wind_measurement_failed', null, collector.diagnostics('failed'))
  } finally {
    await WindHeadingNative.stopBackVectorHeading().catch(() => undefined)
  }
}
