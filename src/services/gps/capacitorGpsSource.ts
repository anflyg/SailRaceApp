import { Capacitor } from '@capacitor/core'
import { Geolocation, type Position } from '@capacitor/geolocation'
import type { GpsPosition, GpsPositionCallback, GpsSource, GpsSourceOptions } from './gpsSource'

function finiteNumberOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function positionFromCapacitor(position: Position): GpsPosition {
  const course = finiteNumberOrNull(position.coords.course)
  const heading = finiteNumberOrNull(position.coords.heading)

  return {
    latitude: finiteNumberOrNull(position.coords.latitude),
    longitude: finiteNumberOrNull(position.coords.longitude),
    accuracyMeters: finiteNumberOrNull(position.coords.accuracy),
    speedMetersPerSecond: finiteNumberOrNull(position.coords.speed),
    courseDegrees: course ?? (Capacitor.isNativePlatform() ? null : heading),
    headingDegrees: heading,
    timestamp: finiteNumberOrNull(position.timestamp),
  }
}

export const capacitorGpsSource: GpsSource = {
  isAvailable: () => (
    Capacitor.isPluginAvailable('Geolocation') ||
    (typeof navigator !== 'undefined' && typeof navigator.geolocation !== 'undefined')
  ),

  async requestPermission() {
    if (!Capacitor.isNativePlatform()) {
      return 'granted'
    }

    const permissions = await Geolocation.requestPermissions({ permissions: ['location'] })
    return permissions.location === 'granted' ? 'granted' : 'denied'
  },

  async getCurrentPosition(options: GpsSourceOptions) {
    return positionFromCapacitor(await Geolocation.getCurrentPosition(options))
  },

  async watchPosition(options: GpsSourceOptions, callback: GpsPositionCallback) {
    return Geolocation.watchPosition(options, (position, error) => {
      callback(position ? positionFromCapacitor(position) : null, error)
    })
  },

  async clearWatch(watchId: string) {
    await Geolocation.clearWatch({ id: watchId })
  },
}
