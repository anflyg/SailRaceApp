import type { CourseDefinition, RaceSample } from '../types'

export type MapGeoPoint = {
  latitude: number
  longitude: number
}

export type ProjectedMapPoint = {
  x: number
  y: number
}

export type RaceMapProjection = {
  project: (point: MapGeoPoint) => ProjectedMapPoint
  projectHeadingDegrees: (headingDegrees: number) => number
  bounds: {
    minX: number
    maxX: number
    minY: number
    maxY: number
  }
  orientation: 'course-axis' | 'north-up'
}

const FALLBACK_HALF_SIZE_METERS = 50
const MIN_TRACK_BOUND_SIZE_METERS = 80
const AUXILIARY_POINT_INFLUENCE_FACTOR = 0.65
const AUXILIARY_POINT_MIN_INFLUENCE_METERS = 90
const TRACK_PADDING_FACTOR = 0.08

export function createRaceMapProjection({
  samples,
  course,
  currentPoint,
}: {
  samples: RaceSample[]
  course?: CourseDefinition
  currentPoint?: MapGeoPoint | null
}): RaceMapProjection | null {
  const trackGeoPoints = samples.filter(isGeoPoint)
  const auxiliaryGeoPoints = getAuxiliaryGeoPoints(course, currentPoint)
  const referenceGeoPoints = trackGeoPoints.length > 0
    ? trackGeoPoints
    : [...trackGeoPoints, ...auxiliaryGeoPoints]

  if (referenceGeoPoints.length === 0) {
    return null
  }

  const origin = getAveragePoint(referenceGeoPoints)
  const rotationRadians = getCourseAxisRotationRadians(course)
  const projectedTrackPoints = trackGeoPoints.map((point) => projectPoint(point, origin, rotationRadians))
  const projectedAuxiliaryPoints = auxiliaryGeoPoints.map((point) => projectPoint(point, origin, rotationRadians))
  const bounds = projectedTrackPoints.length > 0
    ? getTrackFocusedBounds(projectedTrackPoints, projectedAuxiliaryPoints)
    : expandFlatBounds(getBounds(projectedAuxiliaryPoints))

  return {
    project: (point) => projectPoint(point, origin, rotationRadians),
    projectHeadingDegrees: (headingDegrees) => projectHeadingDegrees(headingDegrees, rotationRadians),
    bounds,
    orientation: rotationRadians === 0 ? 'north-up' : 'course-axis',
  }
}

function getAuxiliaryGeoPoints(
  course: CourseDefinition | undefined,
  currentPoint: MapGeoPoint | null | undefined,
): MapGeoPoint[] {
  return [
    currentPoint,
    course?.startLine?.port,
    course?.startLine?.starboard,
    course?.windwardMark,
    course?.leewardMark,
  ].filter(isGeoPoint)
}

function getAveragePoint(points: MapGeoPoint[]): MapGeoPoint {
  const sums = points.reduce((currentSums, point) => ({
    latitude: currentSums.latitude + point.latitude,
    longitude: currentSums.longitude + point.longitude,
  }), {
    latitude: 0,
    longitude: 0,
  })

  return {
    latitude: sums.latitude / points.length,
    longitude: sums.longitude / points.length,
  }
}

function projectPoint(
  point: MapGeoPoint,
  origin: MapGeoPoint,
  rotationRadians: number,
): ProjectedMapPoint {
  const localPoint = toLocalMeters(point, origin)
  const cos = Math.cos(rotationRadians)
  const sin = Math.sin(rotationRadians)

  return {
    x: localPoint.x * cos - localPoint.y * sin,
    y: localPoint.x * sin + localPoint.y * cos,
  }
}

function toLocalMeters(point: MapGeoPoint, origin: MapGeoPoint): ProjectedMapPoint {
  const metersPerDegreeLatitude = 111_320
  const metersPerDegreeLongitude = metersPerDegreeLatitude * Math.cos(toRadians(origin.latitude))

  return {
    x: (point.longitude - origin.longitude) * metersPerDegreeLongitude,
    y: (point.latitude - origin.latitude) * metersPerDegreeLatitude,
  }
}

function getCourseAxisRotationRadians(course: CourseDefinition | undefined): number {
  if (!course?.windwardMark || !course.leewardMark) {
    return 0
  }

  const origin = course.leewardMark
  const windwardLocalPoint = toLocalMeters(course.windwardMark, origin)

  if (windwardLocalPoint.x === 0 && windwardLocalPoint.y === 0) {
    return 0
  }

  return Math.atan2(windwardLocalPoint.x, windwardLocalPoint.y)
}

function projectHeadingDegrees(headingDegrees: number, rotationRadians: number): number {
  const headingRadians = toRadians(headingDegrees)
  const localVector = {
    x: Math.sin(headingRadians),
    y: Math.cos(headingRadians),
  }
  const cos = Math.cos(rotationRadians)
  const sin = Math.sin(rotationRadians)
  const projectedVector = {
    x: localVector.x * cos - localVector.y * sin,
    y: localVector.x * sin + localVector.y * cos,
  }

  return normalizeDegrees(toDegrees(Math.atan2(projectedVector.x, projectedVector.y)))
}

function getBounds(points: ProjectedMapPoint[]): RaceMapProjection['bounds'] {
  return points.reduce((bounds, point) => ({
    minX: Math.min(bounds.minX, point.x),
    maxX: Math.max(bounds.maxX, point.x),
    minY: Math.min(bounds.minY, point.y),
    maxY: Math.max(bounds.maxY, point.y),
  }), {
    minX: points[0].x,
    maxX: points[0].x,
    minY: points[0].y,
    maxY: points[0].y,
  })
}

function getTrackFocusedBounds(
  projectedTrackPoints: ProjectedMapPoint[],
  projectedAuxiliaryPoints: ProjectedMapPoint[],
): RaceMapProjection['bounds'] {
  const expandedTrackBounds = expandFlatBounds(getBounds(projectedTrackPoints))
  const trackWidth = expandedTrackBounds.maxX - expandedTrackBounds.minX
  const trackHeight = expandedTrackBounds.maxY - expandedTrackBounds.minY
  const maxAuxiliaryInfluenceX = Math.max(
    AUXILIARY_POINT_MIN_INFLUENCE_METERS,
    trackWidth * AUXILIARY_POINT_INFLUENCE_FACTOR,
  )
  const maxAuxiliaryInfluenceY = Math.max(
    AUXILIARY_POINT_MIN_INFLUENCE_METERS,
    trackHeight * AUXILIARY_POINT_INFLUENCE_FACTOR,
  )

  return projectedAuxiliaryPoints.reduce((bounds, point) => {
    const boundedX = clamp(
      point.x,
      expandedTrackBounds.minX - maxAuxiliaryInfluenceX,
      expandedTrackBounds.maxX + maxAuxiliaryInfluenceX,
    )
    const boundedY = clamp(
      point.y,
      expandedTrackBounds.minY - maxAuxiliaryInfluenceY,
      expandedTrackBounds.maxY + maxAuxiliaryInfluenceY,
    )

    return {
      minX: Math.min(bounds.minX, boundedX),
      maxX: Math.max(bounds.maxX, boundedX),
      minY: Math.min(bounds.minY, boundedY),
      maxY: Math.max(bounds.maxY, boundedY),
    }
  }, expandedTrackBounds)
}

function expandFlatBounds(bounds: RaceMapProjection['bounds']): RaceMapProjection['bounds'] {
  const width = bounds.maxX - bounds.minX
  const height = bounds.maxY - bounds.minY
  const safeWidth = Math.max(width, MIN_TRACK_BOUND_SIZE_METERS)
  const safeHeight = Math.max(height, MIN_TRACK_BOUND_SIZE_METERS)
  const xHalfExpansion = width === 0
    ? FALLBACK_HALF_SIZE_METERS
    : Math.max(0, (safeWidth - width) / 2)
  const yHalfExpansion = height === 0
    ? FALLBACK_HALF_SIZE_METERS
    : Math.max(0, (safeHeight - height) / 2)
  const xPadding = safeWidth * TRACK_PADDING_FACTOR
  const yPadding = safeHeight * TRACK_PADDING_FACTOR

  return {
    minX: bounds.minX - xHalfExpansion - xPadding,
    maxX: bounds.maxX + xHalfExpansion + xPadding,
    minY: bounds.minY - yHalfExpansion - yPadding,
    maxY: bounds.maxY + yHalfExpansion + yPadding,
  }
}

function isGeoPoint(value: unknown): value is MapGeoPoint {
  return (
    typeof value === 'object' &&
    value !== null &&
    'latitude' in value &&
    'longitude' in value &&
    typeof value.latitude === 'number' &&
    typeof value.longitude === 'number' &&
    Number.isFinite(value.latitude) &&
    Number.isFinite(value.longitude)
  )
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI
}

function normalizeDegrees(degrees: number): number {
  return ((degrees % 360) + 360) % 360
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
