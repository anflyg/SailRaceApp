import { describe, expect, it } from 'vitest'
import { createRaceExportFiles } from './raceExport'
import type { Race } from '../types'

describe('race export diagnostics', () => {
  it('exports speed diagnostics in JSON, CSV and GPX', () => {
    const race: Race = {
      id: 'race-1', dayId: '2026-08-16', name: 'Test', createdAt: '2026-08-16T12:00:00.000Z', windMeasurement: { headingDegrees: 59.4, selectedHeadingDegrees: 59.4, selectedHeadingSource: 'back-vector-row', sampleCount: 40, referenceFrame: 'true-north', accuracyDegrees: 2, spreadDegrees: 3, quality: 'good', nativeDebug: { clTrueHeadingDegrees: 60, clMagneticHeadingDegrees: 58, headings: { backVectorHeadingDegrees: 59, backVectorHeadingRowDegrees: 59.4, frontVectorHeadingDegrees: 239, topEdgeHeadingDegrees: 90, rightEdgeHeadingDegrees: 180 }, matrix: { m11: 1, m12: 0, m13: 0, m21: 0, m22: 1, m23: 0, m31: 0, m32: 0, m33: 1 } } }, samples: [{
        timestamp: '2026-08-16T12:00:00.000Z', latitude: 59.3, longitude: 18.0, speedKnots: 4.5, nativeSpeedKnots: 1.2, positionSpeedKnots: 4.5, fusedSpeedKnots: 4.49, nativeCourseDegrees: 310, positionCourseDegrees: 45, fusedCourseDegrees: 45,
      }], events: [],
    }
    const files = createRaceExportFiles(race)
    const json = JSON.parse(files.find((file) => file.fileName.endsWith('.json'))!.content)
    expect(json.exportVersion).toBe(2)
    expect(json.appVersion).toBe('0.1.0')
    expect(json.buildNumber).toBe('13')
    expect(json.samples[0]).toMatchObject({ speedKnots: 4.5, nativeSpeedKnots: 1.2, positionSpeedKnots: 4.5, fusedSpeedKnots: 4.49 })
    expect(json.windMeasurement).toMatchObject({ selectedHeadingSource: 'back-vector-row', nativeDebug: { clTrueHeadingDegrees: 60 } })
    const csv = files.find((file) => file.fileName.endsWith('.csv'))!.content
    expect(csv).toContain('speedKnots,nativeSpeedKnots,positionSpeedKnots,fusedSpeedKnots')
    expect(csv).toContain('4.5,1.2,4.5,4.49')
    const gpx = files.find((file) => file.fileName.endsWith('.gpx'))!.content
    expect(gpx).toContain('aster:speedKnots')
    expect(gpx).toContain('aster:nativeSpeedKnots')
    expect(gpx).toContain('aster:positionSpeedKnots')
    expect(gpx).toContain('aster:fusedSpeedKnots')
    expect(csv).toContain('nativeCourseDegrees,positionCourseDegrees,fusedCourseDegrees')
    expect(gpx).toContain('aster:fusedCourseDegrees')
  })
})
