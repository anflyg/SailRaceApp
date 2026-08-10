export interface GpsPosition {
  latitude: number | null
  longitude: number | null
  accuracyMeters: number | null
  speedMetersPerSecond: number | null
  courseDegrees: number | null
  headingDegrees: number | null
  timestamp: number | null
}

export interface GpsSourceOptions {
  enableHighAccuracy: boolean
  timeout: number
  maximumAge: number
  minimumUpdateInterval: number
  interval: number
}

export type GpsPositionCallback = (position: GpsPosition | null, error?: unknown) => void

export interface GpsSource {
  isAvailable(): boolean
  requestPermission(): Promise<'granted' | 'denied'>
  getCurrentPosition(options: GpsSourceOptions): Promise<GpsPosition>
  watchPosition(options: GpsSourceOptions, callback: GpsPositionCallback): Promise<string>
  clearWatch(watchId: string): Promise<void>
}
