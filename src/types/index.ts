export type AppView = 'course' | 'timer' | 'race' | 'analysis'

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

export type CoursePointKey = 'startA' | 'startB' | 'kryss1' | 'kryss2' | 'lans1' | 'lans2'

export type CoursePointState = Record<CoursePointKey, GeoPoint | null>

export interface CourseState {
  points: CoursePointState
  windHeadingDegrees: number | null
}

export interface RaceMetrics {
  speedKnots: string
  headingDegrees: string
  vmg: string
}
