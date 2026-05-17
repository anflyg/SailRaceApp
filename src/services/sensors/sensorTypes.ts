export interface GeoPoint {
  latitude: number
  longitude: number
}

export interface LocationReading extends GeoPoint {
  accuracyMeters: number
  timestamp: number
}

export interface SpeedReading {
  speedKnots: number
  accuracyKnots?: number
  source: 'gps'
  timestamp: number
}

export interface CourseReading {
  courseDegrees: number
  accuracyDegrees?: number
  speedKnots: number
  source: 'gps-course'
  isReliable: boolean
  timestamp: number
}

export interface BoatForwardHeadingReading {
  headingDegrees: number
  accuracyDegrees?: number
  source: 'device-back-fused'
  isReliable: boolean
  timestamp: number
}

export interface WindHeadingReading {
  headingDegrees: number
  sampleCount: number
  accuracyDegrees?: number
  spreadDegrees?: number
  quality?: 'good' | 'ok' | 'poor' | 'unstable' | 'unknown'
  source: 'averaged-device-back-heading'
  timestamp: number
}
