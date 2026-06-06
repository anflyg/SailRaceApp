export type RaceMapPanOffset = {
  x: number
  y: number
}

const DEFAULT_VIEWBOX_SIZE = 320
const DEFAULT_VIEWBOX_PADDING = 26
const MIN_ZOOM_SCALE = 1

export const DEFAULT_RACE_MAP_PAN_OFFSET: RaceMapPanOffset = {
  x: 0,
  y: 0,
}

export function clampRaceMapPanOffset(
  offset: RaceMapPanOffset,
  zoomScale: number,
  viewboxSize = DEFAULT_VIEWBOX_SIZE,
  viewboxPadding = DEFAULT_VIEWBOX_PADDING,
): RaceMapPanOffset {
  const maxPanOffset = getRaceMapMaxPanOffset(zoomScale, viewboxSize, viewboxPadding)

  return {
    x: clamp(offset.x, -maxPanOffset, maxPanOffset),
    y: clamp(offset.y, -maxPanOffset, maxPanOffset),
  }
}

export function buildRaceMapTransform(
  zoomScale: number,
  panOffset: RaceMapPanOffset,
  viewboxSize = DEFAULT_VIEWBOX_SIZE,
): string | undefined {
  const normalizedZoomScale = Number.isFinite(zoomScale) ? Math.max(MIN_ZOOM_SCALE, zoomScale) : MIN_ZOOM_SCALE
  const center = viewboxSize / 2
  const hasPan = panOffset.x !== 0 || panOffset.y !== 0

  if (normalizedZoomScale === MIN_ZOOM_SCALE && !hasPan) {
    return undefined
  }

  return `translate(${center + panOffset.x} ${center + panOffset.y}) scale(${normalizedZoomScale}) translate(-${center} -${center})`
}

function getRaceMapMaxPanOffset(
  zoomScale: number,
  viewboxSize: number,
  viewboxPadding: number,
): number {
  const normalizedZoomScale = Number.isFinite(zoomScale) ? Math.max(MIN_ZOOM_SCALE, zoomScale) : MIN_ZOOM_SCALE
  return viewboxPadding + Math.max(0, (normalizedZoomScale - MIN_ZOOM_SCALE) * (viewboxSize / 2))
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
