const EARTH_RADIUS_METERS = 6_371_000
const METERS_PER_SECOND_TO_KNOTS = 1.943844

export const GPS_SPEED_SOURCE_AGREEMENT_KNOTS = 1.5
export const GPS_SPEED_COORDS_WEIGHT = 0.7
export const GPS_SPEED_MAX_REASONABLE_KNOTS = 60
export const GPS_SPEED_MAX_POSITION_ACCURACY_METERS = 25

export interface GpsSpeedPosition {
  latitude: number | null
  longitude: number | null
  accuracyMeters: number | null
  timestamp: number | null
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

function isReasonableSpeed(speedKnots: number | null): speedKnots is number {
  return (
    speedKnots !== null &&
    Number.isFinite(speedKnots) &&
    speedKnots >= 0 &&
    speedKnots <= GPS_SPEED_MAX_REASONABLE_KNOTS
  )
}

export function isReliableGpsSpeedPosition(
  position: GpsSpeedPosition,
): position is GpsSpeedPosition & {
  latitude: number
  longitude: number
  accuracyMeters: number
  timestamp: number
} {
  return (
    position.latitude !== null &&
    Number.isFinite(position.latitude) &&
    position.latitude >= -90 &&
    position.latitude <= 90 &&
    position.longitude !== null &&
    Number.isFinite(position.longitude) &&
    position.longitude >= -180 &&
    position.longitude <= 180 &&
    position.accuracyMeters !== null &&
    Number.isFinite(position.accuracyMeters) &&
    position.accuracyMeters >= 0 &&
    position.accuracyMeters <= GPS_SPEED_MAX_POSITION_ACCURACY_METERS &&
    position.timestamp !== null &&
    Number.isFinite(position.timestamp)
  )
}

export function calculatePositionSpeedKnots(
  previous: GpsSpeedPosition | null,
  current: GpsSpeedPosition,
): number | null {
  if (
    previous === null ||
    !isReliableGpsSpeedPosition(previous) ||
    !isReliableGpsSpeedPosition(current)
  ) {
    return null
  }

  const elapsedSeconds = (current.timestamp - previous.timestamp) / 1000

  if (elapsedSeconds <= 0) {
    return null
  }

  const previousLatitude = toRadians(previous.latitude)
  const currentLatitude = toRadians(current.latitude)
  const latitudeDelta = currentLatitude - previousLatitude
  const longitudeDelta = toRadians(current.longitude - previous.longitude)
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(previousLatitude) *
      Math.cos(currentLatitude) *
      Math.sin(longitudeDelta / 2) ** 2
  const distanceMeters =
    EARTH_RADIUS_METERS *
    2 *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(Math.max(0, 1 - haversine)))
  const speedKnots = (distanceMeters / elapsedSeconds) * METERS_PER_SECOND_TO_KNOTS

  return isReasonableSpeed(speedKnots) ? speedKnots : null
}

export function fuseGpsSpeedKnots(
  coordsSpeedKnots: number | null,
  positionSpeedKnots: number | null,
  previousSpeedKnots: number | null,
): number | null {
  const coordsSpeed = isReasonableSpeed(coordsSpeedKnots) ? coordsSpeedKnots : null
  const positionSpeed = isReasonableSpeed(positionSpeedKnots) ? positionSpeedKnots : null

  if (coordsSpeed === null) {
    return positionSpeed
  }

  if (positionSpeed === null) {
    return coordsSpeed
  }

  if (Math.abs(coordsSpeed - positionSpeed) <= GPS_SPEED_SOURCE_AGREEMENT_KNOTS) {
    return (
      coordsSpeed * GPS_SPEED_COORDS_WEIGHT +
      positionSpeed * (1 - GPS_SPEED_COORDS_WEIGHT)
    )
  }

  if (!isReasonableSpeed(previousSpeedKnots)) {
    return coordsSpeed
  }

  const coordsDelta = Math.abs(coordsSpeed - previousSpeedKnots)
  const positionDelta = Math.abs(positionSpeed - previousSpeedKnots)

  if (
    coordsDelta > GPS_SPEED_SOURCE_AGREEMENT_KNOTS &&
    positionDelta > GPS_SPEED_SOURCE_AGREEMENT_KNOTS
  ) {
    return previousSpeedKnots
  }

  return coordsDelta <= positionDelta ? coordsSpeed : positionSpeed
}

export function filterGpsSpeedKnots(speedValues: Array<number | null>): number | null {
  const sortedValues = speedValues
    .filter(isReasonableSpeed)
    .sort((first, second) => first - second)

  if (sortedValues.length === 0) {
    return null
  }

  const middleIndex = Math.floor(sortedValues.length / 2)

  if (sortedValues.length % 2 === 1) {
    return sortedValues[middleIndex]
  }

  return (sortedValues[middleIndex - 1] + sortedValues[middleIndex]) / 2
}
