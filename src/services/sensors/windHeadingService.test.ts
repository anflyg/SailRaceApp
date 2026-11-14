import { describe, expect, it } from 'vitest'
import { isUsableWindReference } from '../../domain/windReference'
import { WindHeadingMeasurementError, WindMeasurementCollector, type NativeWindHeadingSample } from './windHeadingService'

const sample = (index: number, overrides: Partial<NativeWindHeadingSample> = {}): NativeWindHeadingSample => ({
  valid: true, headingDegrees: index % 2 ? 359 : 1, referenceFrame: 'true-north',
  selectedHeadingSource: 'back-vector-row', motionTimestamp: 100 + index / 10,
  accuracyDegrees: 10, nativeDebug: null, ...overrides,
})

function addSamples(collector: WindMeasurementCollector, count: number, overrides: Partial<NativeWindHeadingSample> = {}) {
  for (let i = 0; i < count; i++) collector.add(sample(i, overrides))
}

describe('new wind measurement series', () => {
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
    addSamples(collector, 29)
    collector.add(sample(29, { accuracyDegrees: null }))
    expect(() => collector.finish()).toThrowError(expect.objectContaining({ reason: 'insufficient-samples' }))
    expect(collector.diagnostics('insufficient-samples')).toMatchObject({ acceptedSamples: 29, missingAccuracySamples: 1, referenceFrame: 'true-north', accuracyDegrees: 10, spreadDegrees: expect.any(Number) })
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
    addSamples(collector, 29)
    expect(() => collector.finish()).toThrowError(expect.objectContaining({ reason: 'insufficient-samples' }))
  })
})
