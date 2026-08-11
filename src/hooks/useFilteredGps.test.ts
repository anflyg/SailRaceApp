import { describe, expect, it } from 'vitest'
import {
  COURSE_DISPLAY_FAST_SMOOTHING_ALPHA,
  COURSE_DISPLAY_LOW_SPEED_ALPHA,
  COURSE_DISPLAY_SMOOTHING_ALPHA,
  getCourseDisplaySmoothingAlpha,
  getLatestProcessedGpsTimestamp,
} from './useFilteredGps'

describe('filtered GPS presentation metadata', () => {
  it('uses the latest processed GPS sample timestamp rather than a raw reading outside the sample pipeline', () => {
    expect(getLatestProcessedGpsTimestamp([
      { gpsTimestamp: 1_000 },
      { gpsTimestamp: 2_000 },
    ])).toBe(2_000)
  })

  it('remains unavailable until the filtering pipeline has a processed sample timestamp', () => {
    expect(getLatestProcessedGpsTimestamp([])).toBeNull()
    expect(getLatestProcessedGpsTimestamp([{ gpsTimestamp: null }])).toBeNull()
  })
})

describe('course display smoothing', () => {
  it('uses normal smoothing for a small course delta at normal speed', () => {
    expect(getCourseDisplaySmoothingAlpha(6, 5, 0)).toBe(COURSE_DISPLAY_SMOOTHING_ALPHA)
  })

  it('uses fast smoothing for a large course delta at normal speed', () => {
    expect(getCourseDisplaySmoothingAlpha(6, 30, 0)).toBe(COURSE_DISPLAY_FAST_SMOOTHING_ALPHA)
  })

  it('switches to fast smoothing at the threshold', () => {
    expect(getCourseDisplaySmoothingAlpha(6, 11.9, 0)).toBe(COURSE_DISPLAY_SMOOTHING_ALPHA)
    expect(getCourseDisplaySmoothingAlpha(6, 12, 0)).toBe(COURSE_DISPLAY_FAST_SMOOTHING_ALPHA)
  })

  it.each([
    [350, 10],
    [10, 350],
  ])('uses fast smoothing for a wrap-around delta from %i° to %i°', (currentCourse, filteredCourse) => {
    expect(getCourseDisplaySmoothingAlpha(6, filteredCourse, currentCourse)).toBe(COURSE_DISPLAY_FAST_SMOOTHING_ALPHA)
  })

  it('keeps low-speed smoothing ahead of fast mode', () => {
    expect(getCourseDisplaySmoothingAlpha(0.8, 30, 0)).toBe(COURSE_DISPLAY_LOW_SPEED_ALPHA)
  })

  it('keeps the display frozen below the freeze speed', () => {
    expect(getCourseDisplaySmoothingAlpha(0.6, 30, 0)).toBeNull()
  })
})
