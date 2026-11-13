import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getActiveRaceId,
  getActiveCountdownToken,
  markStartGun,
  pausePlannedStart,
  recordSampleIfDue,
  recordLaylineTackEventIfActive,
  startRaceLogging,
  stopActiveRace,
  updatePlannedStart,
  updatePreStartCourse,
} from './raceLogger'
import { createRace, getRace, listRaces } from './raceStorage'
import { createRaceExportFiles } from './raceExport'
import type { WindHeadingMeasurementResult } from './sensors/windHeadingService'

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

describe('recorded wind VMG quality', () => {
  const at = new Date('2026-01-01T12:00:00.000Z')
  const measurement: WindHeadingMeasurementResult = { headingDegrees: 0, selectedHeadingDegrees: 0,
    selectedHeadingSource: 'back-vector-row', sampleCount: 40, referenceFrame: 'true-north', quality: 'good',
    accuracyDegrees: 3, spreadDegrees: 2, nativeDebug: null }
  const course = { windDirectionDegrees: 0, courseAxisDegrees: 45 }
  const gps = { ...stillGpsAt(at.getTime()), speedKnots: 5, courseDegrees: 0, displayCourseDegrees: 0 }
  it('records VMG for a matching good reference while preserving historical races and export', () => {
    vi.stubGlobal('localStorage', new MockStorage())
    const old = createRace({ date: at, name: 'Historical' })
    const previous = getRace(old.id)
    startRaceLogging({ countdownDurationSeconds: 60, course, windMeasurement: measurement, now: at })
    const race = recordSampleIfDue({ gps, course, windMeasurement: measurement, now: at })!
    expect(race.samples[0].vmgWindKnots).toBeCloseTo(5)
    expect(race.samples[0].vmgCourseKnots).toBeCloseTo(5 * Math.SQRT1_2)
    expect(getRace(old.id)).toEqual(previous)
    expect(createRaceExportFiles(race).some((file) => file.content.includes('vmgWindKnots'))).toBe(true)
  })
  it.each(['missing', 'race-missing', 'magnetic', 'poor', 'mismatch', 'race-mismatch', 'wrap-mismatch', 'stale', 'unreliable'])('omits wind VMG but preserves GPS and course VMG: %s', (condition) => {
    vi.stubGlobal('localStorage', new MockStorage())
    const stored = condition === 'race-missing' ? undefined : condition === 'race-mismatch' ? { ...measurement, headingDegrees: 1, selectedHeadingDegrees: 1 } : measurement
    const current = condition === 'missing' ? undefined : condition === 'magnetic' ? { ...measurement, referenceFrame: 'magnetic-north' as const } :
      condition === 'poor' ? { ...measurement, quality: 'poor' as const } : condition === 'mismatch' ? { ...measurement, headingDegrees: 1 } :
      condition === 'wrap-mismatch' ? { ...measurement, headingDegrees: 359, selectedHeadingDegrees: 359 } : measurement
    startRaceLogging({ countdownDurationSeconds: 60, course, windMeasurement: stored, now: at })
    const sampleGps = { ...gps, courseReliable: condition !== 'unreliable', timestamp: at.getTime() - (condition === 'stale' ? 5_001 : 0) }
    const race = recordSampleIfDue({ gps: sampleGps, course, windMeasurement: current, now: at })!
    const sample = race.samples[0]
    expect(sample.vmgWindKnots).toBeUndefined()
    expect(sample.vmgCourseKnots).toBeCloseTo(5 * Math.SQRT1_2)
    expect(sample.cogDegrees).toBe(0)
    expect(sample.latitude).toBe(gps.latitude)
  })
})

describe('pre-start course snapshot', () => {
  it('updates and clears metadata without losing samples or changing the race, then locks it at the gun', () => {
    vi.stubGlobal('localStorage', new MockStorage())
    const at = new Date('2026-01-01T12:00:00Z')
    const wind: WindHeadingMeasurementResult = { headingDegrees: 360, selectedHeadingDegrees: 0,
      selectedHeadingSource: 'back-vector-row', sampleCount: 40, referenceFrame: 'true-north', quality: 'good',
      accuracyDegrees: 3, spreadDegrees: 2, nativeDebug: null }
    const race = startRaceLogging({ countdownDurationSeconds: 300, now: at })
    recordSampleIfDue({ gps: stillGpsAt(at.getTime()), now: at })
    const line = { port: { latitude: 1, longitude: 2 }, starboard: { latitude: 3, longitude: 4 } }
    const course = { startLine: line, windDirectionDegrees: 0 }
    expect(updatePreStartCourse(course, wind)?.windMeasurement).toEqual(wind)
    const later = new Date(at.getTime() + 6000)
    expect(recordSampleIfDue({ gps: { ...stillGpsAt(later.getTime()), speedKnots: 5, courseDegrees: 0 }, course, windMeasurement: wind, now: later })?.samples.at(-1)?.vmgWindKnots).toBeCloseTo(5)
    expect(updatePreStartCourse({ ...course, startLine: { ...line, port: { latitude: 5, longitude: 6 } } }, wind)?.course?.startLine?.port.latitude).toBe(5)
    pausePlannedStart()
    expect(startRaceLogging({ countdownDurationSeconds: 240, now: at }).id).toBe(race.id)
    expect(startRaceLogging({ countdownDurationSeconds: 180, now: at }).samples).toHaveLength(2)
    expect(updatePreStartCourse({ startLine: line })?.windMeasurement).toBeUndefined()
    updatePreStartCourse(course, wind)
    markStartGun(new Date(at.getTime() + 180_000), getActiveCountdownToken()!)
    expect(updatePreStartCourse(undefined)).toBeNull()
    expect(getRace(race.id)?.course).toEqual(course)
    expect(getRace(race.id)?.windMeasurement).toEqual(wind)
    expect(getRace(race.id)?.samples).toHaveLength(2)
  })
  it('does not attach metadata belonging to another direction', () => {
    vi.stubGlobal('localStorage', new MockStorage())
    startRaceLogging({ countdownDurationSeconds: 300 })
    const wind: WindHeadingMeasurementResult = { headingDegrees: 359, selectedHeadingDegrees: 359,
      selectedHeadingSource: 'back-vector-row', sampleCount: 40, referenceFrame: 'true-north', quality: 'good',
      accuracyDegrees: 3, spreadDegrees: 2, nativeDebug: null }
    expect(updatePreStartCourse({ windDirectionDegrees: 0 }, wind)?.windMeasurement).toBeUndefined()
  })
})

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
    markStartGun(new Date('2026-10-14T09:05:00.000Z'))
    recordSampleIfDue({ gps: stillGpsAt(Date.parse('2026-10-14T09:05:00.000Z')) })

    const autoStopped = recordSampleIfDue({ gps: stillGpsAt(Date.parse('2026-10-14T09:15:00.000Z')) })

    expect(autoStopped?.endTime).toBe('2026-10-14T09:15:00.000Z')
    expect(autoStopped?.samples).toHaveLength(2)
    expect(autoStopped?.samples.at(-1)?.timestamp).toBe('2026-10-14T09:15:00.000Z')
    expect(getActiveRaceId()).toBeNull()
    expect(getRace(started.id)?.samples).toEqual(autoStopped?.samples)
  })

  it('uses callback time for stale GPS fixes before recording or after the callback time', () => {
    vi.stubGlobal('localStorage', new MockStorage())
    const start = new Date('2026-10-14T10:00:00.000Z')
    const race = startRaceLogging({ countdownDurationSeconds: 300, now: start })
    const before = new Date(start.getTime() - 60_000)
    const accepted = recordSampleIfDue({ gps: stillGpsAt(before.getTime()), now: start })!
    expect(accepted.samples[0]?.timestamp).toBe(start.toISOString())
    const lateFix = new Date(start.getTime() + 300_000)
    const callbackTime = new Date(start.getTime() + 360_000)
    const withLateFix = recordSampleIfDue({ gps: stillGpsAt(lateFix.getTime()), now: callbackTime })!
    expect(withLateFix.samples.at(-1)?.timestamp).toBe(lateFix.toISOString())
    stopActiveRace({ now: new Date(start.getTime() + 420_000) })
    expect(getRace(race.id)?.samples.map(sample => sample.timestamp)).toEqual([start.toISOString(), lateFix.toISOString()])
  })

  it('keeps an out-of-order GPS point with a monotonic callback timestamp', () => {
    vi.stubGlobal('localStorage', new MockStorage())
    const start = new Date('2026-10-14T11:00:00.000Z')
    const race = startRaceLogging({ countdownDurationSeconds: 300, now: start })
    recordSampleIfDue({ gps: stillGpsAt(start.getTime() + 10_000), now: start })
    const callbackTime = new Date(start.getTime() + 20_000)
    const updated = recordSampleIfDue({ gps: stillGpsAt(start.getTime() + 5_000), now: callbackTime })!
    expect(updated.samples).toHaveLength(2)
    expect(updated.samples.at(-1)?.timestamp).toBe(callbackTime.toISOString())
    stopActiveRace({ now: new Date(start.getTime() + 30_000) })
    expect(getRace(race.id)?.samples).toHaveLength(2)
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

describe('pre-start countdown synchronization', () => {
  const base = Date.parse('2026-01-01T12:00:00.000Z')
  const at = (seconds: number) => new Date(base + seconds * 1000)
  const storedState = (storage: MockStorage) => JSON.parse(storage.getItem('aster-race:race-logger:v1')!)

  it('reuses the 5:00 race for repeated resynchronizations and retains every sample', () => {
    const storage = new MockStorage()
    vi.stubGlobal('localStorage', storage)
    const race = startRaceLogging({ countdownDurationSeconds: 300, now: at(0) })
    const firstToken = getActiveCountdownToken()!
    recordSampleIfDue({ gps: stillGpsAt(at(5).getTime()) })
    pausePlannedStart()
    expect(storedState(storage).scheduledStartTime).toBeUndefined()
    expect(getActiveRaceId()).toBe(race.id)
    const same = startRaceLogging({ countdownDurationSeconds: 240, now: at(60) })
    expect(same.id).toBe(race.id)
    expect(storedState(storage).scheduledStartTime).toBe(at(300).toISOString())
    expect(getActiveCountdownToken()).not.toEqual(firstToken)
    recordSampleIfDue({ gps: stillGpsAt(at(65).getTime()) })
    const secondToken = updatePlannedStart(180, at(90))!
    expect(storedState(storage).scheduledStartTime).toBe(at(270).toISOString())
    recordSampleIfDue({ gps: stillGpsAt(at(95).getTime()) })
    expect(getRace(race.id)?.samples).toHaveLength(3)
    expect(getRace(race.id)?.endTime).toBeUndefined()
    expect(listRaces()).toHaveLength(1)
    expect(markStartGun(at(300), firstToken)).toBeNull()
    expect(getRace(race.id)?.startGunTime).toBeUndefined()
    expect(markStartGun(at(270), secondToken)?.startGunTime).toBe(at(270).toISOString())
  })

  it('rejects a cancelled, premature or stale callback and records the gun exactly once', () => {
    const storage = new MockStorage()
    vi.stubGlobal('localStorage', storage)
    const race = startRaceLogging({ countdownDurationSeconds: 300, now: at(0) })
    const cancelled = getActiveCountdownToken()!
    pausePlannedStart()
    expect(markStartGun(at(300), cancelled)).toBeNull()
    const current = updatePlannedStart(60, at(301))!
    expect(markStartGun(at(360), current)).toBeNull()
    expect(markStartGun(at(361), cancelled)).toBeNull()
    expect(markStartGun(at(361), current)?.startGunTime).toBe(at(361).toISOString())
    expect(markStartGun(at(370), current)?.startGunTime).toBe(at(361).toISOString())
    expect(getRace(race.id)?.startGunTime).toBe(at(361).toISOString())
  })

  it('saves an ended pre-start attempt and rejects its token even after a new race begins', () => {
    vi.stubGlobal('localStorage', new MockStorage())
    const first = startRaceLogging({ countdownDurationSeconds: 60, now: at(0) })
    const oldToken = getActiveCountdownToken()!
    recordSampleIfDue({ gps: stillGpsAt(at(5).getTime()) })
    stopActiveRace({ now: at(10) })
    expect(getActiveCountdownToken()).toBeNull()
    expect(markStartGun(at(60), oldToken)).toBeNull()
    expect(getRace(first.id)?.startGunTime).toBeUndefined()
    expect(getRace(first.id)?.samples).toHaveLength(1)
    expect(getRace(first.id)?.endTime).toBe(at(10).toISOString())

    const next = startRaceLogging({ countdownDurationSeconds: 60, now: at(61) })
    expect(next.id).not.toBe(first.id)
    expect(markStartGun(at(121), oldToken)).toBeNull()
    expect(getRace(next.id)?.startGunTime).toBeUndefined()
    expect(markStartGun(at(121), getActiveCountdownToken()!)?.id).toBe(next.id)
  })

  it('does not use the old high-frequency start window when paused', () => {
    vi.stubGlobal('localStorage', new MockStorage())
    const race = startRaceLogging({ countdownDurationSeconds: 300, now: at(0) })
    recordSampleIfDue({ gps: stillGpsAt(at(250).getTime()) })
    pausePlannedStart()
    expect(recordSampleIfDue({ gps: stillGpsAt(at(251).getTime()) })).toBeNull()
    expect(getRace(race.id)?.samples).toHaveLength(1)
    updatePlannedStart(50, at(250))
    expect(recordSampleIfDue({ gps: stillGpsAt(at(251).getTime()) })?.samples).toHaveLength(2)
  })

  it('restores the active countdown token across a logger reload', async () => {
    vi.stubGlobal('localStorage', new MockStorage())
    const race = startRaceLogging({ countdownDurationSeconds: 300, now: at(0) })
    const token = updatePlannedStart(240, at(20))!
    vi.resetModules()
    const restored = await import('./raceLogger')
    expect(restored.getActiveRaceId()).toBe(race.id)
    expect(restored.getActiveCountdownToken()).toEqual(token)
    expect(restored.markStartGun(at(260), token)?.startGunTime).toBe(at(260).toISOString())
    restored.stopActiveRace({ now: at(270) })
  })

  it('resumes the same post-gun countdown without creating a race and starts a new race only for a new countdown', () => {
    vi.stubGlobal('localStorage', new MockStorage())
    const first = startRaceLogging({ countdownDurationSeconds: 60, now: at(0) })
    recordSampleIfDue({ gps: stillGpsAt(at(5).getTime()) })
    const oldToken = getActiveCountdownToken()!
    markStartGun(at(60), oldToken)
    pausePlannedStart()
    expect(updatePlannedStart(-5, at(65))).toBeNull()
    expect(getActiveRaceId()).toBe(first.id)
    expect(listRaces()).toHaveLength(1)
    const second = startRaceLogging({ countdownDurationSeconds: 240, now: at(90) })
    expect(second.id).not.toBe(first.id)
    expect(getActiveRaceId()).toBe(second.id)
    expect(getRace(first.id)).toMatchObject({ startGunTime: at(60).toISOString(), endTime: at(90).toISOString() })
    expect(getRace(first.id)?.samples).toHaveLength(1)
    expect(listRaces()).toHaveLength(2)
    expect(markStartGun(at(330), oldToken)).toBeNull()
    expect(getRace(second.id)?.startGunTime).toBeUndefined()
    expect(stopActiveRace({ now: at(100) })?.id).toBe(second.id)
    expect(getRace(second.id)?.endTime).toBe(at(100).toISOString())
  })

  it('does not auto-stop while awaiting a start, including when the clock is paused', () => {
    vi.stubGlobal('localStorage', new MockStorage())
    const race = startRaceLogging({ countdownDurationSeconds: 300, now: at(0) })
    recordSampleIfDue({ gps: stillGpsAt(at(0).getTime()) })
    recordSampleIfDue({ gps: stillGpsAt(at(700).getTime()) })
    expect(getActiveRaceId()).toBe(race.id)
    pausePlannedStart()
    recordSampleIfDue({ gps: stillGpsAt(at(1200).getTime()) })
    expect(getActiveRaceId()).toBe(race.id)
    expect(getRace(race.id)?.samples).toHaveLength(3)
    expect(getRace(race.id)?.endTime).toBeUndefined()
    const token = updatePlannedStart(60, at(1200))!
    markStartGun(at(1260), token)
    recordSampleIfDue({ gps: stillGpsAt(at(1260).getTime()) })
    recordSampleIfDue({ gps: stillGpsAt(at(1859).getTime()) })
    expect(getActiveRaceId()).toBe(race.id)
    recordSampleIfDue({ gps: stillGpsAt(at(1864).getTime()) })
    expect(getActiveRaceId()).toBeNull()
    expect(getRace(race.id)?.endTime).toBe(at(1864).toISOString())
  })

  it('rejects invalid schedules before changing the active race', () => {
    vi.stubGlobal('localStorage', new MockStorage())
    const race = startRaceLogging({ countdownDurationSeconds: 300, now: at(0) })
    const token = getActiveCountdownToken()
    expect(() => startRaceLogging({ countdownDurationSeconds: -1, now: at(1) })).toThrow(RangeError)
    expect(() => updatePlannedStart(Number.NaN, at(1))).toThrow(RangeError)
    expect(getActiveRaceId()).toBe(race.id)
    expect(getActiveCountdownToken()).toEqual(token)
    expect(getRace(race.id)?.endTime).toBeUndefined()
  })
})
