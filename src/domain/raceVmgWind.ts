import { normalizeDegrees } from './angles'
import { calculateVelocityMadeGood } from './navigation'
import { isFreshReliableGps, isUsableWindReference } from './windReference'
import { createWindInstrumentState, stepWindInstrument } from './windShiftInstrument'
import { isFreshTacticalHeading, type TacticalHeading } from './tacticalHeading'
import type { CourseState, FilteredGpsReading } from '../types'

/** Development-only, transient state. No checkpoint/history or ownership inference on recovery. */
export class RaceVmgWind {
  private raceId: string | null = null
  private owner: string | null = null
  private gun: number | null = null
  private blocked = true
  private acquisition = createWindInstrumentState()
  private eligibleAfter = 0
  private referenceTime = 0
  private lastProcessedTime = 0
  private origin: CourseState | null = null
  w0: number | null = null
  wvmg: number | null = null
  acceptedReferences = 0

  begin(raceId: string, owner: string, gun: number, course: CourseState, now: number) {
    if (this.matches(raceId, owner) && this.gun === gun) return
    this.clear()
    if (!Number.isFinite(gun) || !Number.isFinite(now) || gun > now) return
    this.raceId = raceId
    this.owner = owner
    this.gun = gun
    this.blocked = false
    this.eligibleAfter = now
    this.bindOrigin(course, gun)
  }

  clear() {
    this.raceId = this.owner = null
    this.gun = null
    this.blocked = true
    this.origin = null
    this.w0 = this.wvmg = null
    this.acceptedReferences = 0
    this.referenceTime = this.lastProcessedTime = this.eligibleAfter = 0
    this.acquisition = createWindInstrumentState()
  }

  /** Owner change and recovery fail closed for this race; only a new gun can begin again. */
  invalidate() { this.clear() }

  interrupt(now: number) {
    this.acquisition = createWindInstrumentState()
    this.eligibleAfter = Math.max(this.eligibleAfter, now)
  }

  private matches(raceId: string | null, owner: string) {
    return !this.blocked && this.raceId === raceId && this.owner === owner
  }

  private bindOrigin(course: CourseState, time: number) {
    if (this.w0 !== null || !isUsableWindReference(course.windHeadingDegrees, course.windMeasurement)) return
    this.origin = { ...course, windMeasurement: { ...course.windMeasurement! } }
    this.w0 = this.wvmg = normalizeDegrees(course.windHeadingDegrees)
    this.referenceTime = time
  }

  /** Called only by the Course approval action, never by restored/current Course rendering. */
  approveCourse(raceId: string | null, owner: string, course: CourseState, now: number) {
    if (!this.matches(raceId, owner) || this.gun === null || !Number.isFinite(now) || now < this.gun || now < this.lastProcessedTime) return
    if (this.w0 === null) {
      this.bindOrigin(course, now)
      this.interrupt(now)
    }
  }

  private compatible(course: CourseState) {
    return this.origin !== null && isUsableWindReference(course.windHeadingDegrees, course.windMeasurement) &&
      isUsableWindReference(course.windHeadingDegrees, this.origin.windMeasurement)
  }

  step(raceId: string | null, owner: string, course: CourseState, heading: TacticalHeading, alpha: number, now: number) {
    if (!this.matches(raceId, owner)) { this.invalidate(); return }
    if (!Number.isFinite(now) || now < this.lastProcessedTime) { this.interrupt(this.lastProcessedTime); return }
    this.lastProcessedTime = now
    if (!this.compatible(course) || this.w0 === null) { this.interrupt(now); return }
    // Same stable-tack engine and acceptance gates as Wtactical, with an independent lifecycle.
    const previous = this.acquisition
    const next = stepWindInstrument(previous, {
      nowMs: now, timestamp: heading.timestamp, courseDegrees: heading.degrees,
      courseReliable: isFreshTacticalHeading(heading, now), windHeadingDegrees: this.w0,
      windReferenceFrame: 'true-north', alphaDegrees: alpha,
      startGunTimeMs: Math.max(this.gun!, this.eligibleAfter),
    }).state
    this.acquisition = next
    if (previous.phase === 'establishing' && previous.alphaDegrees === alpha && next.phase === 'steady' &&
        next.lockedCourseReferenceDegrees !== null && next.tack !== null && heading.timestamp !== null && heading.timestamp > this.referenceTime) {
      this.wvmg = normalizeDegrees(next.lockedCourseReferenceDegrees + (next.tack === 'starboard' ? alpha / 2 : -alpha / 2))
      this.referenceTime = heading.timestamp
      this.acceptedReferences += 1
    }
  }

  liveVmg(raceId: string | null, owner: string, course: CourseState, gps: FilteredGpsReading, now: number): number | null {
    if (!this.matches(raceId, owner) || !this.compatible(course) || this.wvmg === null ||
        !isFreshReliableGps(gps, gps.courseDegrees, gps.timestamp, now) || gps.timestamp! < this.referenceTime) return null
    return calculateVelocityMadeGood(gps.speedKnots!, gps.courseDegrees!, this.wvmg)
  }
}

// Production builds cannot opt in through an environment flag. Recovery and logger parity remain gates.
export function localRaceVmgEnabled(development: boolean): boolean { return development }

/** A same-account validation on Setup remount is not an owner switch. */
export function raceVmgOwnerContext(snapshot: { status: string; ownerId?: string } | null | undefined, previous = 'unavailable'): string {
  if (snapshot?.ownerId) return snapshot.ownerId
  if (snapshot?.status === 'restoring') return previous
  return !snapshot || snapshot.status === 'signed_out' ? 'local' : 'unavailable'
}
