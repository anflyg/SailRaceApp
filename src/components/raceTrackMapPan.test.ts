import { describe, expect, it } from 'vitest'
import {
  buildRaceMapTransform,
  clampRaceMapPanOffset,
  DEFAULT_RACE_MAP_PAN_OFFSET,
} from './raceTrackMapPan'

describe('raceTrackMapPan', () => {
  it('returns no transform for neutral zoom and pan', () => {
    expect(buildRaceMapTransform(1, DEFAULT_RACE_MAP_PAN_OFFSET)).toBeUndefined()
  })

  it('combines zoom and pan in the same transform', () => {
    expect(buildRaceMapTransform(2, { x: 12, y: -8 })).toBe(
      'translate(172 152) scale(2) translate(-160 -160)',
    )
  })

  it('allows limited pan even at 1x zoom', () => {
    expect(clampRaceMapPanOffset({ x: 40, y: -50 }, 1)).toEqual({ x: 26, y: -26 })
  })

  it('expands clamp range when zoom increases', () => {
    expect(clampRaceMapPanOffset({ x: 999, y: -999 }, 2)).toEqual({ x: 186, y: -186 })
  })
})
