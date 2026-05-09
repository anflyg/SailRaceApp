export type AppView = 'course' | 'timer' | 'race' | 'analysis'

export interface GeoPoint {
  latitude: number
  longitude: number
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
