import type { CoursePoint, CoursePointQuality, LiveGpsReading } from '../types'
import { formatMeters } from './format'

export const GOOD_GPS_ACCURACY_METERS = 5

export type GpsStatusText = 'GPS SAKNAS' | 'GPS OSÄKER'

export interface GpsStatusDisplay {
  label: string
  statusText: GpsStatusText | null
  hasPosition: boolean
  isGood: boolean
}

export function getPointQuality(accuracyMeters: number | null): Exclude<CoursePointQuality, 'unset'> {
  return accuracyMeters !== null && accuracyMeters <= GOOD_GPS_ACCURACY_METERS ? 'good' : 'poor'
}

export function getGpsStatusDisplay(gps: Pick<
  LiveGpsReading,
  'latitude' | 'longitude' | 'accuracyMeters'
>): GpsStatusDisplay {
  const hasPosition = gps.latitude !== null && gps.longitude !== null

  if (!hasPosition) {
    return {
      label: 'GPS —',
      statusText: 'GPS SAKNAS',
      hasPosition: false,
      isGood: false,
    }
  }

  if (gps.accuracyMeters === null) {
    return {
      label: 'GPS —',
      statusText: 'GPS OSÄKER',
      hasPosition: true,
      isGood: false,
    }
  }

  const isGood = gps.accuracyMeters <= GOOD_GPS_ACCURACY_METERS

  return {
    label: `GPS ±${formatMeters(gps.accuracyMeters)} m`,
    statusText: isGood ? null : 'GPS OSÄKER',
    hasPosition: true,
    isGood,
  }
}

export function getStartLineQuality(startA: CoursePoint | null, startB: CoursePoint | null): CoursePointQuality {
  if (!startA || !startB) {
    return 'unset'
  }

  return startA.quality === 'poor' || startB.quality === 'poor' ? 'poor' : 'good'
}
