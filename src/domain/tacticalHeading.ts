export interface TacticalHeading { degrees: number | null; timestamp: number | null }
export const NO_TACTICAL_HEADING: TacticalHeading = { degrees: null, timestamp: null }
export const TACTICAL_HEADING_MAX_AGE_MS = 1500

export function isFreshTacticalHeading(value: TacticalHeading, now = Date.now()): boolean {
  return value.degrees !== null && Number.isFinite(value.degrees) && value.degrees >= 0 && value.degrees < 360 &&
    value.timestamp !== null && Number.isFinite(value.timestamp) && value.timestamp <= now && now - value.timestamp <= TACTICAL_HEADING_MAX_AGE_MS
}
