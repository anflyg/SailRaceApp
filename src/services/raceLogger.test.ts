import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getActiveRaceId,
  recordSampleIfDue,
  recordLaylineTackEventIfActive,
  startRaceLogging,
  stopActiveRace,
} from './raceLogger'
import { createRace, getRace, listRaces } from './raceStorage'
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

function stillGpsAt(timestamp: number) {
  return {
    status: 'watching' as const, error: null, latitude: 59.3, longitude: 18, accuracyMeters: 2,
    speedKnots: 0.2, nativeSpeedKnots: 0.2, positionSpeedKnots: 0.2, fusedSpeedKnots: 0.2,
    courseDegrees: 45, nativeCourseDegrees: 45, positionCourseDegrees: 45, fusedCourseDegrees: 45,
    courseReliable: true, timestamp, displayCourseDegrees: 45, presentationTimestamp: timestamp, sampleCount: 1,
  }
}

describe('active race stop lifecycle', () => {
  it('starts a local race and lets a manual stop set endTime without changing samples or other saved races', () => {
    const storage = new MockStorage()
    vi.stubGlobal('localStorage', storage)
    const previous = createRace({ date: '2026-10-13', name: 'Earlier race', endTime: '2026-10-13T11:00:00.000Z' })
    const previousBefore = getRace(previous.id)
    const started = startRaceLogging({ countdownDurationSeconds: 300, now: new Date('2026-10-14T07:00:00.000Z') })
    expect(getActiveRaceId()).toBe(started.id)

    recordSampleIfDue({ gps: stillGpsAt(Date.parse('2026-10-14T07:01:00.000Z')) })
    const savedSamples = getRace(started.id)?.samples
    const stopped = stopActiveRace({ now: new Date('2026-10-14T07:02:00.000Z') })

    expect(stopped?.endTime).toBe('2026-10-14T07:02:00.000Z')
    expect(stopped?.samples).toEqual(savedSamples)
    expect(getActiveRaceId()).toBeNull()
    expect(getRace(previous.id)).toEqual(previousBefore)
    expect(storage.getItem('aster-race:race-logger:v1')).toContain('"activeRaceId":null')
  })

  it('restores the active race ID from local storage after the logger module is reloaded', async () => {
    vi.stubGlobal('localStorage', new MockStorage())
    const started = startRaceLogging({ countdownDurationSeconds: 300, now: new Date('2026-10-14T08:00:00.000Z') })

    vi.resetModules()
    const restartedLogger = await import('./raceLogger')
    expect(restartedLogger.getActiveRaceId()).toBe(started.id)
    restartedLogger.stopActiveRace({ now: new Date('2026-10-14T08:01:00.000Z') })
  })

  it('auto-stops after the existing stillness interval while preserving the final sample', () => {
    vi.stubGlobal('localStorage', new MockStorage())
    const started = startRaceLogging({ countdownDurationSeconds: 300, now: new Date('2026-10-14T09:00:00.000Z') })
    recordSampleIfDue({ gps: stillGpsAt(Date.parse('2026-10-14T09:00:00.000Z')) })

    const autoStopped = recordSampleIfDue({ gps: stillGpsAt(Date.parse('2026-10-14T09:10:00.000Z')) })

    expect(autoStopped?.endTime).toBe('2026-10-14T09:10:00.000Z')
    expect(autoStopped?.samples).toHaveLength(2)
    expect(autoStopped?.samples.at(-1)?.timestamp).toBe('2026-10-14T09:10:00.000Z')
    expect(getActiveRaceId()).toBeNull()
    expect(getRace(started.id)?.samples).toEqual(autoStopped?.samples)
  })
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
