import { describe, expect, it } from 'vitest'
import { getGpsStatusDisplay } from '../domain/gps'
import { calculateStartMetrics } from '../domain/startLine'
import { translations } from './translations'

const point = { latitude: 59.3, longitude: 18, quality: 'good' as const }

describe('centralized UI translations', () => {
  it('maps a neutral Start status to Swedish and English UI text', () => {
    const result = calculateStartMetrics({
      boatPosition: null,
      currentAccuracyMeters: null,
      startA: point,
      startB: { ...point, longitude: 18.001 },
      courseDegrees: null,
      speedKnots: null,
      countdownSeconds: 60,
    })

    expect(result.status).toBe('gps_missing')
    const status = result.status
    if (status === null) throw new Error('Expected a Start status')
    expect(translations.sv[`start.status.${status}`]).toBe('GPS SAKNAS')
    expect(translations.en[`start.status.${status}`]).toBe('GPS UNAVAILABLE')
  })

  it('maps a neutral GPS quality status at the Course UI boundary', () => {
    const status = getGpsStatusDisplay({ latitude: 59.3, longitude: 18, accuracyMeters: 35 })

    expect(status.status).toBe('unreliable')
    expect(translations.sv['status.gpsUnreliable']).toBe('GPS OSÄKER')
    expect(translations.en['status.gpsUnreliable']).toBe('GPS UNRELIABLE')
  })

  it('keeps analysis dynamic, dialog, and export strings in the central dictionary', () => {
    expect(translations.sv['analysis.interpolatedPoint']).toBe('Interpolerad datapunkt')
    expect(translations.en['analysis.interpolatedPoint']).toBe('Interpolated data point')
    expect(translations.sv['dialog.deleteRace']).toContain('{name}')
    expect(translations.en['dialog.deleteRace']).toContain('{name}')
    expect(translations.sv['export.dialogTitle']).toBe('Exportera race')
    expect(translations.en['export.dialogTitle']).toBe('Export race')
  })
})
