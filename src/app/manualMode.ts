import type {
  AppView,
  CourseState,
  DeviceAttitudeReading,
  FilteredGpsReading,
  LiveGpsReading,
  RollPitchValues,
} from '../types'

export interface ManualModeConfig {
  enabled: boolean
  initialView: AppView | null
  laylineCountdownValue: number | null
}

const MANUAL_MODE_QUERY_KEY = 'manual'
const MANUAL_VIEW_QUERY_KEY = 'view'
const MANUAL_LAYLINE_QUERY_KEY = 'layline'

const MANUAL_NOW = Date.parse('2026-05-20T14:30:00.000Z')

const manualCourse: CourseState = {
  points: {
    startA: {
      latitude: 59.3296,
      longitude: 18.059,
      quality: 'good',
      accuracyAtSet: 2.9,
    },
    startB: {
      latitude: 59.3296,
      longitude: 18.061,
      quality: 'poor',
      accuracyAtSet: 14.5,
    },
    kryss1: {
      latitude: 59.3334,
      longitude: 18.06,
      quality: 'good',
      accuracyAtSet: 3.1,
    },
    lans1: {
      latitude: 59.3262,
      longitude: 18.06,
      quality: 'good',
      accuracyAtSet: 3.4,
    },
  },
  windHeadingDegrees: 22,
}

const manualLiveGps: LiveGpsReading = {
  status: 'watching',
  error: null,
  latitude: 59.3286,
  longitude: 18.0601,
  accuracyMeters: 3.8,
  speedKnots: 6.4,
  courseDegrees: 18,
  courseReliable: true,
  timestamp: MANUAL_NOW,
}

const manualFilteredGps: FilteredGpsReading = {
  ...manualLiveGps,
  sampleCount: 6,
  displayCourseDegrees: 18,
}

const manualAttitude: DeviceAttitudeReading = {
  status: 'watching',
  error: null,
  rollDegrees: -3.2,
  pitchDegrees: 1.4,
  motionAvailable: true,
  headingAvailable: true,
  timestamp: MANUAL_NOW,
}

const manualRollPitch: RollPitchValues = {
  rollDegrees: -3.2,
  pitchDegrees: 1.4,
}

export const MANUAL_FIXTURES = {
  course: manualCourse,
  liveGps: manualLiveGps,
  filteredGps: manualFilteredGps,
  attitude: manualAttitude,
  rollPitch: manualRollPitch,
}

export function getManualModeConfig(): ManualModeConfig {
  const search = getSearchParams()
  const enabled = search?.get(MANUAL_MODE_QUERY_KEY) === '1'

  if (!enabled) {
    return {
      enabled: false,
      initialView: null,
      laylineCountdownValue: null,
    }
  }

  return {
    enabled: true,
    initialView: parseView(search?.get(MANUAL_VIEW_QUERY_KEY) ?? null),
    laylineCountdownValue: parseLaylineCountdownValue(search?.get(MANUAL_LAYLINE_QUERY_KEY) ?? null),
  }
}

function getSearchParams(): URLSearchParams | null {
  if (typeof window === 'undefined') {
    return null
  }

  return new URLSearchParams(window.location.search)
}

function parseView(value: string | null): AppView | null {
  if (value === 'setup' || value === 'course' || value === 'timer' || value === 'race' || value === 'analysis') {
    return value
  }

  return null
}

function parseLaylineCountdownValue(value: string | null): number | null {
  if (!value) {
    return null
  }

  const parsed = Number.parseInt(value, 10)

  if (!Number.isFinite(parsed)) {
    return null
  }

  return Math.max(-5, Math.min(10, parsed))
}
