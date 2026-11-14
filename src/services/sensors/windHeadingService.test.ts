import { describe, expect, it } from 'vitest'
import { isUsableWindReference } from '../../domain/windReference'
import { collectWindSamples, rememberRaceWindProof, WindHeadingMeasurementError, WindMeasurementCollector, type NativeWindHeadingSample } from './windHeadingService'

const sample = (index: number, overrides: Partial<NativeWindHeadingSample> = {}): NativeWindHeadingSample => ({
  valid: true, headingDegrees: index % 2 ? 359 : 1, referenceFrame: 'true-north',
  selectedHeadingSource: 'back-vector-row', motionTimestamp: 100 + index / 10,
  accuracyDegrees: 10, nativeDebug: null, ...overrides,
})

function addSamples(collector: WindMeasurementCollector, count: number, overrides: Partial<NativeWindHeadingSample> = {}) {
  for (let i = 0; i < count; i++) collector.add(sample(i, overrides))
}

describe('new wind measurement series', () => {
  it('collects distinct native frames within four seconds without overlapping bridge calls', async () => {
    const collector = new WindMeasurementCollector()
    let now = 0, inFlight = false
    await collectWindSamples(collector, async () => {
      expect(inFlight).toBe(false)
      inFlight = true
      now += 5 // Synthetic bridge latency; no claim about a physical device.
      const frame = Math.floor(now * 30 / 1000)
      const result = sample(frame, { motionTimestamp: 100 + frame / 30 })
      inFlight = false
      return result
    }, () => now, async ms => { now += ms })
    const diagnostics = collector.diagnostics('failed')
    expect(now).toBe(4000)
    expect(diagnostics.collectedSamples).toBe(134)
    expect(diagnostics.acceptedSamples).toBe(120)
    expect(diagnostics.coverageSeconds).toBeLessThan(4)
  })

  it('does not accept a bridge response delivered after the deadline', async () => {
    const collector = new WindMeasurementCollector()
    let now = 0
    await collectWindSamples(collector, async () => { now = 4100; return sample(0) }, () => now, async ms => { now += ms })
    expect(collector.diagnostics('insufficient-samples').acceptedSamples).toBe(0)
  })
  it('accepts 30 unique samples across 359/0 with accuracy exactly 10°', () => {
    const collector = new WindMeasurementCollector()
    addSamples(collector, 30)
    const result = collector.finish()
    expect(result.sampleCount).toBe(30)
    expect(result.headingDegrees).toBeCloseTo(0)
    expect(result.accuracyDegrees).toBe(10)
    expect(result.quality).toBe('good')
    expect(isUsableWindReference(result.headingDegrees, result)).toBe(true)
  })

  it('accepts a spread of exactly 10° and rejects a wider series as unstable', () => {
    const collector = new WindMeasurementCollector()
    const unstable = new WindMeasurementCollector()
    for (let i = 0; i < 30; i++) {
      collector.add(sample(i, { headingDegrees: i % 2 ? 350 : 10 }))
      unstable.add(sample(i, { headingDegrees: i % 2 ? 349 : 11 }))
    }
    expect(collector.finish().quality).toBe('good')
    expect(() => unstable.finish()).toThrowError(expect.objectContaining({ reason: 'unstable' }))
  })

  it('does not count a motion reading with missing accuracy after earlier valid readings', () => {
    const collector = new WindMeasurementCollector()
    addSamples(collector, 11)
    collector.add(sample(11, { accuracyDegrees: null }))
    expect(() => collector.finish()).toThrowError(expect.objectContaining({ reason: 'insufficient-samples' }))
    expect(collector.diagnostics('insufficient-samples')).toMatchObject({ acceptedSamples: 11, missingAccuracySamples: 1, referenceFrame: 'true-north', accuracyDegrees: 10, spreadDegrees: expect.any(Number) })
  })

  it('reports absent compass accuracy without accepting its readings', () => {
    const collector = new WindMeasurementCollector()
    addSamples(collector, 40, { accuracyDegrees: null, referenceFrame: 'magnetic-north' })
    try { collector.finish(); expect.fail('expected insufficient samples') } catch (error) {
      expect(error).toMatchObject({ reason: 'insufficient-samples', diagnostics: { acceptedSamples: 0, missingAccuracySamples: 40, referenceFrame: 'magnetic-north', accuracyDegrees: null, spreadDegrees: null } })
    }
  })

  it('does not count duplicate or out-of-order motion timestamps', () => {
    const collector = new WindMeasurementCollector()
    collector.add(sample(0))
    for (let i = 0; i < 40; i++) collector.add(sample(0))
    collector.add(sample(0, { motionTimestamp: 99 }))
    expect(() => collector.finish()).toThrowError(expect.objectContaining({ reason: 'insufficient-samples' }))
  })

  it.each([null, -1, Number.NaN])('rejects missing or invalid heading accuracy %s', accuracyDegrees => {
    const collector = new WindMeasurementCollector()
    addSamples(collector, 30, { accuracyDegrees })
    expect(() => collector.finish()).toThrowError(WindHeadingMeasurementError)
  })

  it.each([null, -1, Number.NaN])('rejects missing or invalid motion timestamps %s', motionTimestamp => {
    const collector = new WindMeasurementCollector()
    addSamples(collector, 30, { motionTimestamp })
    expect(() => collector.finish()).toThrowError(expect.objectContaining({ reason: 'insufficient-samples' }))
  })

  it.each([
    { referenceFrame: 'magnetic-north' as const },
    { selectedHeadingSource: 'back-vector-column' as const },
  ])('rejects mixed north references or matrix sources: %o', changed => {
    const collector = new WindMeasurementCollector()
    collector.add(sample(0))
    expect(() => collector.add(sample(1, changed))).toThrowError(expect.objectContaining({ reason: 'failed' }))
  })

  it('uses the worst fresh accuracy so poor readings cannot be averaged into good', () => {
    const collector = new WindMeasurementCollector()
    addSamples(collector, 29, { accuracyDegrees: 2 })
    collector.add(sample(29, { accuracyDegrees: 54.4 }))
    const result = collector.finish()
    expect(result.quality).toBe('poor')
    expect(isUsableWindReference(result.headingDegrees, result)).toBe(false)
  })

  it('rejects too few unique valid samples', () => {
    const collector = new WindMeasurementCollector()
    addSamples(collector, 11)
    expect(() => collector.finish()).toThrowError(expect.objectContaining({ reason: 'insufficient-samples' }))
  })

  it('accepts twelve stable readings spanning at least 2.5 seconds without long gaps', () => {
    const collector = new WindMeasurementCollector()
    for (let i = 0; i < 12; i++) collector.add(sample(i, { motionTimestamp: 100 + i * 0.25 }))
    const result = collector.finish()
    expect(result.sampleCount).toBe(12)
    expect(isUsableWindReference(result.headingDegrees, result)).toBe(true)
    const restored = structuredClone(result)
    expect(isUsableWindReference(restored.headingDegrees, restored)).toBe(false)
    rememberRaceWindProof('race-new', result)
    expect(isUsableWindReference(restored.headingDegrees, restored, 'race-new')).toBe(true)
    expect(isUsableWindReference(restored.headingDegrees, restored, 'other-race')).toBe(false)
    expect(isUsableWindReference(restored.headingDegrees, { ...restored, accuracyDegrees: 9 }, 'race-new')).toBe(false)
    rememberRaceWindProof('race-new', undefined)
    expect(isUsableWindReference(restored.headingDegrees, restored, 'race-new')).toBe(false)
  })

  it.each(['short span', 'long gap'])('rejects twelve readings with %s', kind => {
    const collector = new WindMeasurementCollector()
    for (let i = 0; i < 12; i++) collector.add(sample(i, { motionTimestamp: 100 + (kind === 'short span' ? i * 0.1 : i < 6 ? i * 0.1 : 102 + (i - 6) * 0.2) }))
    expect(() => collector.finish()).toThrowError(expect.objectContaining({ reason: 'insufficient-coverage' }))
  })
})
