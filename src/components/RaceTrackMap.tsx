import { useMemo, useRef, type KeyboardEvent, type PointerEvent } from 'react'
import { createRaceMapProjection, type MapGeoPoint, type ProjectedMapPoint } from '../services/raceMapProjection'
import type { CourseDefinition, Race, RaceSample } from '../types'
import {
  buildRaceMapTransform,
  clampRaceMapPanOffset,
  DEFAULT_RACE_MAP_PAN_OFFSET,
  type RaceMapPanOffset,
} from './raceTrackMapPan'

const VIEWBOX_SIZE = 320
const VIEWBOX_PADDING = 26
const MIN_ZOOM_SCALE = 1

export type RaceTrackMapTrack = {
  id: string
  label: string
  samples: RaceSample[]
  className?: string
}

export type RaceTrackMapMarker = {
  id: string
  point: MapGeoPoint
  className?: string
  label?: string
}

interface RaceTrackMapProps {
  race: Race
  currentPoint?: MapGeoPoint | null
  currentMarkers?: RaceTrackMapMarker[]
  tracks?: RaceTrackMapTrack[]
  highlightSegment?: {
    before: MapGeoPoint
    after: MapGeoPoint
  }
  highlightPoint?: MapGeoPoint | null
  emphasizeStartLine?: boolean
  zoomScale?: number
  panOffset?: RaceMapPanOffset
  onPanOffsetChange?: (offset: RaceMapPanOffset) => void
  panEnabled?: boolean
  onActivate?: () => void
  activationLabel?: string
  className?: string
}

type ScreenPoint = {
  x: number
  y: number
}

export function RaceTrackMap({
  race,
  currentPoint,
  currentMarkers,
  tracks,
  highlightSegment,
  highlightPoint,
  emphasizeStartLine = false,
  zoomScale = MIN_ZOOM_SCALE,
  panOffset = DEFAULT_RACE_MAP_PAN_OFFSET,
  onPanOffsetChange,
  panEnabled = false,
  onActivate,
  activationLabel = 'Racekarta',
  className = '',
}: RaceTrackMapProps) {
  const dragStateRef = useRef<{
    pointerId: number
    startClientX: number
    startClientY: number
    startOffset: RaceMapPanOffset
  } | null>(null)
  const mapTracks = useMemo(() => (
    tracks ?? [{
      id: race.id,
      label: race.name,
      samples: race.samples,
      className: 'primary-track',
    }]
  ), [race.id, race.name, race.samples, tracks])
  const allSamples = useMemo(() => (
    mapTracks.flatMap((track) => track.samples)
  ), [mapTracks])
  const projection = useMemo(() => (
    createRaceMapProjection({
      samples: allSamples,
      course: race.course,
      currentPoint: highlightPoint ?? currentPoint,
    })
  ), [allSamples, currentPoint, highlightPoint, race.course])
  const screenProjector = useMemo(() => (
    projection ? createScreenProjector(projection.bounds) : null
  ), [projection])

  if (race.samples.length === 0 || !projection || !screenProjector) {
    return (
      <div className="race-track-map empty">
        <span>Inga datapunkter finns för karta ännu</span>
      </div>
    )
  }

  const handleMapKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!onActivate) {
      return
    }

    if (event.key !== 'Enter' && event.key !== ' ') {
      return
    }

    event.preventDefault()
    onActivate()
  }

  const projectedCurrentPoint = currentPoint ? screenProjector(projection.project(currentPoint)) : null
  const projectedCurrentMarkers = currentMarkers
    ? currentMarkers.map((marker) => ({
      ...marker,
      point: screenProjector(projection.project(marker.point)),
    }))
    : []
  const projectedHighlightPoint = highlightPoint ? screenProjector(projection.project(highlightPoint)) : null
  const projectedHighlightSegment = highlightSegment
    ? {
      before: screenProjector(projection.project(highlightSegment.before)),
      after: screenProjector(projection.project(highlightSegment.after)),
    }
    : null
  const startLine = getStartLine(race.course, projection.project, screenProjector)
  const windwardMark = getCourseMark(race.course?.windwardMark, projection.project, screenProjector)
  const leewardMark = getCourseMark(race.course?.leewardMark, projection.project, screenProjector)
  const windArrow = getWindArrow(race.course, projection.project, projection.projectHeadingDegrees, screenProjector)
  const canPan = panEnabled && Boolean(onPanOffsetChange)
  const clampedPanOffset = canPan
    ? clampRaceMapPanOffset(panOffset, zoomScale, VIEWBOX_SIZE, VIEWBOX_PADDING)
    : DEFAULT_RACE_MAP_PAN_OFFSET
  const mapTransform = buildRaceMapTransform(zoomScale, clampedPanOffset, VIEWBOX_SIZE)

  const svg = (
    <svg
      className={className}
      viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
      role="img"
      aria-label="Racebana och spår"
    >
      <rect className="race-map-water" x="0" y="0" width={VIEWBOX_SIZE} height={VIEWBOX_SIZE} rx="10" />
      <g transform={mapTransform}>
        {mapTracks.map((track) => {
          const path = createTrackPath(track.samples, projection.project, screenProjector)

          return path ? (
            <path
              key={track.id}
              className={`race-map-track ${track.className ?? ''}`}
              d={path}
              aria-label={track.label}
            />
          ) : null
        })}

        {startLine ? (
          <line
            className={`race-map-start-line ${emphasizeStartLine ? 'emphasized' : ''}`}
            x1={startLine.port.x}
            y1={startLine.port.y}
            x2={startLine.starboard.x}
            y2={startLine.starboard.y}
          />
        ) : null}

        {windwardMark ? <CourseMarker point={windwardMark} label="K1" className="windward" /> : null}
        {leewardMark ? <CourseMarker point={leewardMark} label="L1" className="leeward" /> : null}

        {projectedHighlightSegment ? (
          <line
            className="race-map-highlight-segment"
            x1={projectedHighlightSegment.before.x}
            y1={projectedHighlightSegment.before.y}
            x2={projectedHighlightSegment.after.x}
            y2={projectedHighlightSegment.after.y}
          />
        ) : null}

        {windArrow ? (
          <g className="race-map-wind-arrow" transform={`translate(${windArrow.x} ${windArrow.y}) rotate(${windArrow.rotation})`}>
            <path d="M 0 -18 L 8 4 L 2 2 L 2 18 L -2 18 L -2 2 L -8 4 Z" />
            <text x="0" y="31">Vind</text>
          </g>
        ) : null}

        {projectedCurrentPoint ? (
          <g className="race-map-boat" transform={`translate(${projectedCurrentPoint.x} ${projectedCurrentPoint.y})`}>
            <circle r="7" />
            <circle r="3" />
          </g>
        ) : null}

        {projectedCurrentMarkers.map((marker) => (
          <g
            key={marker.id}
            className={`race-map-boat ${marker.className ?? ''}`}
            transform={`translate(${marker.point.x} ${marker.point.y})`}
            aria-label={marker.label}
          >
            <circle r="7" />
            <circle r="3" />
          </g>
        ))}

        {projectedHighlightPoint ? (
          <g className="race-map-crossing-point" transform={`translate(${projectedHighlightPoint.x} ${projectedHighlightPoint.y})`}>
            <circle r="8" />
            <path d="M -5 0 L 5 0 M 0 -5 L 0 5" />
          </g>
        ) : null}
      </g>
    </svg>
  )

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!canPan || (event.pointerType === 'mouse' && event.button !== 0)) {
      return
    }

    dragStateRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startOffset: clampedPanOffset,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const dragState = dragStateRef.current

    if (!canPan || !dragState || dragState.pointerId !== event.pointerId) {
      return
    }

    onPanOffsetChange?.(clampRaceMapPanOffset({
      x: dragState.startOffset.x + (event.clientX - dragState.startClientX),
      y: dragState.startOffset.y + (event.clientY - dragState.startClientY),
    }, zoomScale, VIEWBOX_SIZE, VIEWBOX_PADDING))
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    const dragState = dragStateRef.current

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    dragStateRef.current = null
  }

  if (!onActivate) {
    return (
      <div
        className={`race-track-map${canPan ? ' race-track-map-pannable' : ''}`}
        onPointerDown={canPan ? handlePointerDown : undefined}
        onPointerMove={canPan ? handlePointerMove : undefined}
        onPointerUp={canPan ? handlePointerUp : undefined}
        onPointerCancel={canPan ? handlePointerUp : undefined}
      >
        {svg}
      </div>
    )
  }

  return (
    <div
      className="race-track-map race-track-map-interactive"
      role="button"
      tabIndex={0}
      aria-label={activationLabel}
      onClick={onActivate}
      onKeyDown={handleMapKeyDown}
    >
      {svg}
      <span className="race-map-open-button">Tryck för att förstora</span>
    </div>
  )
}

function CourseMarker({
  point,
  label,
  className,
}: {
  point: ScreenPoint
  label: string
  className: string
}) {
  return (
    <g className={`race-map-mark ${className}`} transform={`translate(${point.x} ${point.y})`}>
      <circle r="10" />
      <text x="0" y="4">{label}</text>
    </g>
  )
}

function createTrackPath(
  samples: RaceSample[],
  project: (point: MapGeoPoint) => ProjectedMapPoint,
  toScreenPoint: (point: ProjectedMapPoint) => ScreenPoint,
): string | null {
  const points = samples.map((sample) => toScreenPoint(project(sample)))

  if (points.length === 0) {
    return null
  }

  if (points.length === 1) {
    const point = points[0]

    return `M ${point.x.toFixed(2)} ${point.y.toFixed(2)} l 0.1 0`
  }

  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ')
}

function getStartLine(
  course: CourseDefinition | undefined,
  project: (point: MapGeoPoint) => ProjectedMapPoint,
  toScreenPoint: (point: ProjectedMapPoint) => ScreenPoint,
): { port: ScreenPoint; starboard: ScreenPoint } | null {
  if (!course?.startLine) {
    return null
  }

  return {
    port: toScreenPoint(project(course.startLine.port)),
    starboard: toScreenPoint(project(course.startLine.starboard)),
  }
}

function getCourseMark(
  point: MapGeoPoint | undefined,
  project: (point: MapGeoPoint) => ProjectedMapPoint,
  toScreenPoint: (point: ProjectedMapPoint) => ScreenPoint,
): ScreenPoint | null {
  return point ? toScreenPoint(project(point)) : null
}

function getWindArrow(
  course: CourseDefinition | undefined,
  project: (point: MapGeoPoint) => ProjectedMapPoint,
  projectHeadingDegrees: (headingDegrees: number) => number,
  toScreenPoint: (point: ProjectedMapPoint) => ScreenPoint,
): { x: number; y: number; rotation: number } | null {
  if (course?.windDirectionDegrees === undefined) {
    return null
  }

  const anchor = course.windwardMark ?? course.leewardMark ?? course.startLine?.starboard

  if (!anchor) {
    return {
      x: VIEWBOX_SIZE - VIEWBOX_PADDING,
      y: VIEWBOX_PADDING + 10,
      rotation: projectHeadingDegrees(course.windDirectionDegrees),
    }
  }

  const screenPoint = toScreenPoint(project(anchor))

  return {
    x: clamp(screenPoint.x + 22, VIEWBOX_PADDING, VIEWBOX_SIZE - VIEWBOX_PADDING),
    y: clamp(screenPoint.y + 22, VIEWBOX_PADDING + 10, VIEWBOX_SIZE - VIEWBOX_PADDING),
    rotation: projectHeadingDegrees(course.windDirectionDegrees),
  }
}

function createScreenProjector(bounds: {
  minX: number
  maxX: number
  minY: number
  maxY: number
}): (point: ProjectedMapPoint) => ScreenPoint {
  const width = Math.max(1, bounds.maxX - bounds.minX)
  const height = Math.max(1, bounds.maxY - bounds.minY)
  const drawableSize = VIEWBOX_SIZE - VIEWBOX_PADDING * 2
  const scale = Math.min(drawableSize / width, drawableSize / height)
  const projectedWidth = width * scale
  const projectedHeight = height * scale
  const offsetX = (VIEWBOX_SIZE - projectedWidth) / 2
  const offsetY = (VIEWBOX_SIZE - projectedHeight) / 2

  return (point) => ({
    x: offsetX + (point.x - bounds.minX) * scale,
    y: offsetY + (bounds.maxY - point.y) * scale,
  })
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
