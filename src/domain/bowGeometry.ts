import type { CoursePoint, GeoPoint } from '../types'
import { isFreshTacticalHeading, type TacticalHeading } from './tacticalHeading'

export function isValidBowDistance(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 15
}

export function validPosition(p: GeoPoint): boolean {
  return Number.isFinite(p.latitude) && Math.abs(p.latitude) < 85 &&
    Number.isFinite(p.longitude) && Math.abs(p.longitude) <= 180
}

// Transform only the current phone position, never an already saved endpoint.
export function bowPosition(phone: GeoPoint, distance: number, heading: TacticalHeading, now = Date.now()): GeoPoint | null {
  if (!validPosition(phone) || !isValidBowDistance(distance) || !isFreshTacticalHeading(heading, now)) return null
  const radians = heading.degrees! * Math.PI / 180
  const position = {
    latitude: phone.latitude + distance * Math.cos(radians) / 111320,
    longitude: phone.longitude + distance * Math.sin(radians) / (111320 * Math.cos(phone.latitude * Math.PI / 180)),
  }
  return validPosition(position) ? position : null
}

// Called only for a new tap while the bow is at the physical mark. At zero,
// GPS alone suffices for capture; live TTL/BURN still requires heading.
export function captureStartPoint(phone: CoursePoint, distance: number, heading: TacticalHeading, now = Date.now()): CoursePoint | null {
  if (!validPosition(phone) || !isValidBowDistance(distance)) return null
  const position = distance === 0 ? phone : bowPosition(phone, distance, heading, now)
  return position ? { ...phone, ...position } : null
}

export function lineAdvantage(a: CoursePoint | null, b: CoursePoint | null, wind: number | null): { favored: 'A' | 'B' | null; degrees: number } | null {
  if (!a || !b || !validPosition(a) || !validPosition(b) || a.quality !== 'good' || b.quality !== 'good' ||
      wind === null || !Number.isFinite(wind) || wind < 0 || wind > 360 || Math.abs(a.longitude - b.longitude) > 180) return null
  const x = (b.longitude - a.longitude) * 111320 * Math.cos(a.latitude * Math.PI / 180)
  const y = (b.latitude - a.latitude) * 111320
  const length = Math.hypot(x, y)
  if (length < 1 || length > 10000) return null
  const projection = x * Math.sin(wind * Math.PI / 180) + y * Math.cos(wind * Math.PI / 180)
  const bias = Math.asin(Math.min(1, Math.abs(projection) / length)) * 180 / Math.PI
  return { favored: bias <= 2 + 1e-9 ? null : projection > 0 ? 'B' : 'A', degrees: Math.round(bias) }
}
