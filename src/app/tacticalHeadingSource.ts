import { isFreshTacticalHeading, NO_TACTICAL_HEADING, type TacticalHeading } from '../hooks/useTacticalHeading'
import type { FilteredGpsReading } from '../types'

/** Explicit fixture source for manual GUI and allowed sailing simulations only. */
export function getDevelopmentTacticalHeading(
  allowed: boolean,
  gps: FilteredGpsReading,
  now = Date.now(),
): TacticalHeading {
  if (!allowed || gps.displayCourseDegrees === null) return NO_TACTICAL_HEADING
  const heading = { degrees: gps.displayCourseDegrees, timestamp: gps.presentationTimestamp ?? gps.timestamp }
  return isFreshTacticalHeading(heading, now) ? heading : NO_TACTICAL_HEADING
}
