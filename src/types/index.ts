export type AppView = 'setup' | 'course' | 'timer' | 'race' | 'analysis'

export type CountdownDuration = 5 | 4 | 3 | 2 | 1

export type LiveGpsStatus = 'idle' | 'requesting' | 'watching' | 'error' | 'unavailable'

export interface GeoPoint {
  latitude: number
  longitude: number
}

export interface LiveGpsReading {
  status: LiveGpsStatus
  error: string | null
  latitude: number | null
  longitude: number | null
  accuracyMeters: number | null
  speedKnots: number | null
  courseDegrees: number | null
  courseReliable: boolean
  timestamp: number | null
}

export interface FilteredGpsReading extends LiveGpsReading {
  sampleCount: number
}

export type CoursePointQuality = 'unset' | 'good' | 'poor'

export interface CoursePoint extends GeoPoint {
  accuracyAtSet?: number
  quality: Exclude<CoursePointQuality, 'unset'>
}

export type CoursePointKey = 'startA' | 'startB' | 'kryss1' | 'lans1'

export type CoursePointState = Record<CoursePointKey, CoursePoint | null>

export interface CourseState {
  points: CoursePointState
  windHeadingDegrees: number | null
}

export type DeviceAttitudeStatus = 'idle' | 'watching' | 'error' | 'unavailable'

export interface DeviceAttitudeReading {
  status: DeviceAttitudeStatus
  error: string | null
  rollDegrees: number | null
  pitchDegrees: number | null
  motionAvailable: boolean
  headingAvailable: boolean
  timestamp: number | null
}

export interface RollPitchCalibration {
  rollDegrees: number
  pitchDegrees: number
}

export interface RollPitchValues {
  rollDegrees: number
  pitchDegrees: number
}

export interface RaceMetrics {
  speedKnots: string
  headingDegrees: string
  vmg: string
}
