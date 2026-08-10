import type { GeoPoint } from '../types'

const METERS_PER_DEGREE_LATITUDE = 111_320

export interface LocalPosition {
  xMeters: number
  yMeters: number
}

/**
 * Converts small local east/north offsets to GPS coordinates using an
 * equirectangular approximation around the supplied origin.
 */
export function localPositionToGeoPoint(origin: GeoPoint, position: LocalPosition): GeoPoint {
  const metersPerDegreeLongitude =
    METERS_PER_DEGREE_LATITUDE * Math.cos((origin.latitude * Math.PI) / 180)

  return {
    latitude: origin.latitude + position.yMeters / METERS_PER_DEGREE_LATITUDE,
    longitude: origin.longitude + position.xMeters / metersPerDegreeLongitude,
  }
}
