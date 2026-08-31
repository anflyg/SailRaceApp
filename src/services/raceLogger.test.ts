import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getActiveRaceId,
  recordSampleIfDue,
  recordLaylineTackEventIfActive,
  startRaceLogging,
  stopActiveRace,
} from './raceLogger'
import { getRace, listRaces } from './raceStorage'
import { createRaceExportFiles } from './raceExport'

class MockStorage implements Storage {
  public get length(): number {
    return this.values.size
  }

  private readonly values = new Map<string, string>()

  clear(): void {
    this.values.clear()
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('recordLaylineTackEventIfActive', () => {
  it('sparar inget event utan aktiv race logging', () => {
    vi.stubGlobal('localStorage', new MockStorage())

    const result = recordLaylineTackEventIfActive({
      timestamp: '2026-05-20T12:00:00.000Z',
      latitude: 59.33,
      longitude: 18.06,
      speedKnots: 6.1,
      cogDegrees: 42,
      alphaDegrees: 90,
      postTackHeadingDegrees: 132,
      laylineVariant: 'plus-alpha',
    })

    expect(result).toBeNull()
    expect(listRaces()).toHaveLength(0)
  })

  it('sparar event när race logging är aktiv', () => {
    vi.stubGlobal('localStorage', new MockStorage())

    const startedRace = startRaceLogging({
      countdownDurationSeconds: 300,
      now: new Date('2026-05-20T12:00:00.000Z'),
    })
    const activeRaceId = getActiveRaceId()

    expect(activeRaceId).toBe(startedRace.id)

    const updatedRace = recordLaylineTackEventIfActive({
      timestamp: '2026-05-20T12:01:00.000Z',
      latitude: 59.33,
      longitude: 18.06,
      speedKnots: 6.1,
      cogDegrees: 42,
      alphaDegrees: 90,
      postTackHeadingDegrees: 132,
      laylineVariant: 'plus-alpha',
    })

    expect(updatedRace).not.toBeNull()
    expect(updatedRace?.events).toHaveLength(1)
    expect(updatedRace?.events[0]?.type).toBe('layline-tack')
    expect(getRace(startedRace.id)?.events).toHaveLength(1)

    stopActiveRace({ now: new Date('2026-05-20T12:20:00.000Z') })
  })
})

describe('race sample diagnostics round trip', () => {
  it('persists speed and course diagnostics through storage and all exports', () => {
    vi.stubGlobal('localStorage', new MockStorage())
    const race = startRaceLogging({ countdownDurationSeconds: 300, now: new Date('2026-08-18T18:00:00.000Z') })
    const updated = recordSampleIfDue({
      gps: { status: 'watching', error: null, latitude: 59.3, longitude: 18, accuracyMeters: 2, speedKnots: 4.5, nativeSpeedKnots: 1.2, positionSpeedKnots: 4.5, fusedSpeedKnots: 4.49, courseDegrees: 45, nativeCourseDegrees: 310, positionCourseDegrees: 45, fusedCourseDegrees: 45, courseReliable: true, timestamp: Date.parse('2026-08-18T18:00:01.000Z'), displayCourseDegrees: 45, presentationTimestamp: Date.parse('2026-08-18T18:00:01.000Z'), sampleCount: 1 },
    })
    const loaded = getRace(race.id)
    expect(updated?.samples[0]).toMatchObject({ nativeSpeedKnots: 1.2, positionSpeedKnots: 4.5, fusedSpeedKnots: 4.49, nativeCourseDegrees: 310, positionCourseDegrees: 45, fusedCourseDegrees: 45 })
    expect(loaded?.samples[0]).toMatchObject({
      timestamp: updated?.samples[0]?.timestamp,
      latitude: updated?.samples[0]?.latitude,
      longitude: updated?.samples[0]?.longitude,
      speedKnots: 4.5,
      nativeSpeedKnots: 1.2,
      positionSpeedKnots: 4.5,
      fusedSpeedKnots: 4.49,
      cogDegrees: 45,
      nativeCourseDegrees: 310,
      positionCourseDegrees: 45,
      fusedCourseDegrees: 45,
    })
    const files = createRaceExportFiles(loaded!)
    expect(files.every((file) => file.content.includes('nativeCourseDegrees') || file.fileName.endsWith('.gpx'))).toBe(true)
    expect(files.find((file) => file.fileName.endsWith('.json'))?.content).toContain('nativeSpeedKnots')
    expect(files.find((file) => file.fileName.endsWith('.csv'))?.content).toContain('1.2')
    expect(files.find((file) => file.fileName.endsWith('.gpx'))?.content).toContain('aster:fusedSpeedKnots')
    stopActiveRace({ now: new Date('2026-08-18T18:01:00.000Z') })
  })
})
