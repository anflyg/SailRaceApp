import { describe, expect, it } from 'vitest'
import { createRaceExportFiles } from './raceExport'
import type { Race } from '../types'

describe('race export diagnostics', () => {
  it('exports speed diagnostics in JSON, CSV and GPX', () => {
    const race: Race = {
      id: 'race-1', dayId: '2026-08-16', name: 'Test', createdAt: '2026-08-16T12:00:00.000Z', samples: [{
        timestamp: '2026-08-16T12:00:00.000Z', latitude: 59.3, longitude: 18.0, speedKnots: 4.5, nativeSpeedKnots: 1.2, positionSpeedKnots: 4.5, fusedSpeedKnots: 4.49,
      }], events: [],
    }
    const files = createRaceExportFiles(race)
    const json = JSON.parse(files.find((file) => file.fileName.endsWith('.json'))!.content)
    expect(json.exportVersion).toBe(2)
    expect(json.appVersion).toBe('0.1.0')
    expect(json.buildNumber).toBe('11')
    expect(json.samples[0]).toMatchObject({ speedKnots: 4.5, nativeSpeedKnots: 1.2, positionSpeedKnots: 4.5, fusedSpeedKnots: 4.49 })
    const csv = files.find((file) => file.fileName.endsWith('.csv'))!.content
    expect(csv).toContain('speedKnots,nativeSpeedKnots,positionSpeedKnots,fusedSpeedKnots')
    expect(csv).toContain('4.5,1.2,4.5,4.49')
    const gpx = files.find((file) => file.fileName.endsWith('.gpx'))!.content
    expect(gpx).toContain('aster:speedKnots')
    expect(gpx).toContain('aster:nativeSpeedKnots')
    expect(gpx).toContain('aster:positionSpeedKnots')
    expect(gpx).toContain('aster:fusedSpeedKnots')
  })
})
