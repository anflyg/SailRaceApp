import { describe, expect, it } from 'vitest'
import { RaceVmgWind, localRaceVmgEnabled, raceVmgOwnerContext } from './raceVmgWind'
import { createWindInstrumentState, stepWindInstrument } from './windShiftInstrument'
import type { CourseState, FilteredGpsReading } from '../types'

const course = (wind = 180): CourseState => ({
  points: { startA: null, startB: null, kryss1: null, lans1: null }, windHeadingDegrees: wind,
  windMeasurement: { headingDegrees: wind, selectedHeadingDegrees: wind, selectedHeadingSource: 'back-vector-row',
    qualityModel: 'core-motion-v1', sampleCount: 40, referenceFrame: 'true-north', quality: 'good',
    accuracyDegrees: 2, spreadDegrees: 1, nativeDebug: null },
})
const noWind = { ...course(), windHeadingDegrees: null, windMeasurement: undefined }
const gps = (time: number, cog = 180): FilteredGpsReading => ({
  status: 'watching', error: null, latitude: null, longitude: null, accuracyMeters: 2,
  speedKnots: 6, courseDegrees: cog, courseReliable: true, timestamp: time,
  nativeCourseDegrees: cog, positionCourseDegrees: cog, fusedCourseDegrees: cog,
  nativeSpeedKnots: 6, positionSpeedKnots: 6, fusedSpeedKnots: 6,
  sampleCount: 1, displayCourseDegrees: cog, presentationTimestamp: time,
})
function fixture(wind = 180) {
  const runtime = new RaceVmgWind()
  const origin = course(wind)
  runtime.begin('race-a', 'local', 1000, origin, 1000)
  const step = (time: number, hdg: number | null, alpha = 90, current = origin) =>
    runtime.step('race-a', 'local', current, { degrees: hdg, timestamp: time }, alpha, time)
  const feed = (from: number, to: number, hdg: number, alpha = 90) => {
    for (let t = from; t <= to; t += 1000) step(t, hdg, alpha)
  }
  return { runtime, origin, step, feed }
}

describe('race-scoped development VMG wind', () => {
  it.each([[145, 190], [235, 190], [359, 44], [1, 316]])('accepts circular mean HDG %s as %s on either tack', (hdg, expected) => {
    const wind = hdg === 359 ? 45 : hdg === 1 ? 315 : 180
    const f = fixture(wind)
    f.feed(1000, 35000, hdg)
    expect(f.runtime.wvmg).toBe(wind)
    f.step(36000, hdg)
    expect(f.runtime.wvmg).toBeCloseTo(expected)
    expect(f.runtime.w0).toBe(wind)
    f.feed(37000, 45000, hdg + 2 >= 360 ? hdg - 2 : hdg + 2)
    expect(f.runtime.wvmg).toBeCloseTo(expected)
    expect(f.runtime.acceptedReferences).toBe(1)
  })

  it('keeps Wtactical steering behavior separate and uses GPS COG/SOG for VMG', () => {
    const f = fixture()
    f.feed(1000, 36000, 145)
    f.step(37000, 155)
    expect(f.runtime.liveVmg('race-a', 'local', f.origin, gps(37000, 190), 37000)).toBeCloseTo(6)
    let tactical = createWindInstrumentState()
    for (let t = 1000; t <= 37000; t += 1000) tactical = stepWindInstrument(tactical, {
      nowMs: t, timestamp: t, courseDegrees: t === 37000 ? 155 : 145, courseReliable: true,
      windHeadingDegrees: 180, windReferenceFrame: 'true-north', alphaDegrees: 90, startGunTimeMs: 1000,
    }).state
    expect(tactical.estimatedWindHeadingDegrees).toBeCloseTo(200)
    expect(f.runtime.wvmg).toBeCloseTo(190)
    expect(f.origin.windHeadingDegrees).toBe(180)
  })

  it.each([25900, 26000, 31000, 36000])('restarts a changed alpha epoch at %s, retaining accepted wind', change => {
    const f = fixture()
    f.feed(1000, change - 1000, 145)
    f.step(change, 145, 100)
    f.feed(change + 1000, change + 34000, 145, 100)
    expect(f.runtime.acceptedReferences).toBe(0)
    f.step(change + 35000, 145, 100)
    expect(f.runtime.wvmg).toBeCloseTo(195)
    f.step(change + 36000, 145, 90)
    expect(f.runtime.wvmg).toBeCloseTo(195)
  })

  it('no-op alpha writes do not reset and duplicate references are consumed once', () => {
    const f = fixture(); f.feed(1000, 36000, 145, 90)
    f.step(36000, 145, 90); f.step(37000, 145, 90)
    expect(f.runtime.acceptedReferences).toBe(1)
  })

  it('uses a circular sampling mean across north', () => {
    const f = fixture(45)
    for (let t = 1000; t <= 36000; t += 1000) f.step(t, t % 2000 ? 359 : 1)
    expect(Math.abs(f.runtime.wvmg! - 45)).toBeLessThan(0.1)
  })

  it('retains accepted wind through tack, rejection, downwind and temporary HDG loss', () => {
    const f = fixture(); f.feed(1000, 36000, 145)
    f.step(37000, null); f.step(38000, 270)
    f.feed(39000, 43000, 235)
    for (let t = 44000; t <= 78000; t += 1000) f.step(t, t % 2000 ? 215 : 245)
    expect(f.runtime.wvmg).toBeCloseTo(190)
    expect(f.runtime.acceptedReferences).toBe(1)
    expect(f.runtime.liveVmg('race-a', 'local', f.origin, gps(78000, 190), 78000)).toBeCloseTo(6)
    f.feed(79000, 120000, 235)
    expect(f.runtime.wvmg).toBeCloseTo(190)
    expect(f.runtime.acceptedReferences).toBe(2)
  })

  it('rejects a stable mean outside the expected tack sector', () => {
    const f = fixture(); f.feed(1000, 6000, 135); f.feed(7000, 36000, 160)
    expect(f.runtime.acceptedReferences).toBe(0)
    expect(f.runtime.wvmg).toBe(180)
  })

  it('keeps GPS quality/freshness/speed gates and withholds delayed GPS older than the reference', () => {
    const f = fixture(); f.feed(1000, 36000, 145)
    for (const bad of [gps(35000), gps(30000), { ...gps(36000), courseReliable: false },
      { ...gps(36000), speedKnots: null }, { ...gps(36000), speedKnots: -1 },
      { ...gps(36000), courseDegrees: null }, gps(40000)]) {
      expect(f.runtime.liveVmg('race-a', 'local', f.origin, bad, 36000)).toBeNull()
    }
    expect(f.runtime.liveVmg('race-a', 'local', f.origin, gps(36000, 190), 36000)).toBeCloseTo(6)
  })

  it('binds D11 only once on approval, keeps the gun snapshot intact, rejects earlier GPS and later edits', () => {
    const f = fixture(); f.runtime.invalidate(); f.runtime.begin('race-a', 'local', 1000, noWind, 1000)
    f.feed(1000, 40000, 135)
    expect(f.runtime.w0).toBeNull() // rendering Course alone never binds
    for (const bad of [noWind, { ...f.origin, windMeasurement: { ...f.origin.windMeasurement!, quality: 'poor' as const } },
      { ...f.origin, windMeasurement: { ...f.origin.windMeasurement!, referenceFrame: 'magnetic-north' as const } }]) {
      f.runtime.approveCourse('race-a', 'local', bad, 41000)
      expect(f.runtime.w0).toBeNull()
    }
    f.runtime.approveCourse('race-a', 'local', f.origin, 42000)
    expect(f.runtime.w0).toBe(180)
    expect(noWind.windHeadingDegrees).toBeNull()
    expect(f.runtime.liveVmg('race-a', 'local', f.origin, gps(41999), 42000)).toBeNull()
    expect(f.runtime.liveVmg('race-a', 'local', f.origin, gps(42000), 42000)).toBe(6)
    f.runtime.approveCourse('race-a', 'local', course(200), 43000)
    expect(f.runtime.w0).toBe(180)
    expect(f.runtime.liveVmg('race-a', 'local', course(200), gps(43000), 43000)).toBeNull()
    expect(f.runtime.liveVmg('race-a', 'local', f.origin, gps(44000), 44000)).toBe(6)
  })

  it('preserves acquisition across tabs (no runtime event), discards it across background and counts no elapsed samples', () => {
    const f = fixture(); f.feed(1000, 25000, 145)
    f.runtime.interrupt(25000); f.runtime.interrupt(90000)
    f.feed(90000, 124000, 145)
    expect(f.runtime.acceptedReferences).toBe(0)
    f.step(125000, 145)
    expect(f.runtime.wvmg).toBeCloseTo(190)
    f.runtime.interrupt(126000)
    expect(f.runtime.wvmg).toBeCloseTo(190)
  })

  it('does not inherit across owners, races, End, restart or Continue, and cannot bind a late origin after recovery', () => {
    const f = fixture(); f.feed(1000, 36000, 145)
    expect(f.runtime.liveVmg('race-b', 'local', f.origin, gps(36000), 36000)).toBeNull()
    f.runtime.step('race-a', 'other-owner', f.origin, { degrees: 145, timestamp: 37000 }, 90, 37000)
    expect(f.runtime.wvmg).toBeNull()
    f.runtime.approveCourse('race-a', 'other-owner', f.origin, 38000)
    expect(f.runtime.w0).toBeNull()
    f.runtime.begin('race-b', 'other-owner', 40000, course(220), 40000)
    expect(f.runtime.wvmg).toBe(220)
    f.runtime.invalidate() // End / explicit Continue uses no unapproved checkpoint
    expect(f.runtime.liveVmg('race-b', 'other-owner', course(220), gps(41000), 41000)).toBeNull()
    const restarted = new RaceVmgWind()
    restarted.approveCourse('race-b', 'other-owner', course(220), 42000)
    expect(restarted.wvmg).toBeNull()
  })

  it('discards pending samples after HDG quality loss and reacquires a full window', () => {
    const f = fixture(); f.feed(1000, 25000, 145)
    f.step(26000, null)
    f.feed(27000, 61000, 145)
    expect(f.runtime.acceptedReferences).toBe(0)
    f.step(62000, 145)
    expect(f.runtime.acceptedReferences).toBe(1)
  })

  it('does not advance on a duplicate gun callback or stale HDG', () => {
    const f = fixture(); f.feed(1000, 36000, 145)
    f.runtime.begin('race-a', 'local', 1000, f.origin, 37000)
    expect(f.runtime.wvmg).toBeCloseTo(190)
    f.runtime.step('race-a', 'local', f.origin, { degrees: 135, timestamp: 38000 }, 100, 40000)
    expect(f.runtime.wvmg).toBeCloseTo(190)
    expect(f.runtime.acceptedReferences).toBe(1)
  })

  it('keeps same-owner Setup restoration separate from actual account boundaries', () => {
    expect(raceVmgOwnerContext({ status: 'restoring' }, 'owner-a')).toBe('owner-a')
    expect(raceVmgOwnerContext({ status: 'signed_in', ownerId: 'owner-a' }, 'owner-a')).toBe('owner-a')
    expect(raceVmgOwnerContext({ status: 'signed_out' }, 'owner-a')).toBe('local')
    expect(raceVmgOwnerContext({ status: 'signed_in', ownerId: 'owner-b' }, 'owner-a')).toBe('owner-b')
    expect(raceVmgOwnerContext({ status: 'restoring' })).toBe('unavailable')
  })

  it('blocks production activation', () => {
    expect(localRaceVmgEnabled(false)).toBe(false)
    expect(localRaceVmgEnabled(true)).toBe(true)
  })
})
