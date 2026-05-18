export type SailingDay = {
  id: string
  date: string
  raceIds: string[]
}

export type Race = {
  id: string
  dayId: string
  name: string
  createdAt: string
  startGunTime?: string
  endTime?: string
  course?: CourseDefinition
  samples: RaceSample[]
  summary?: RaceSummary
  isFavorite?: boolean
}

export type RaceSample = {
  timestamp: string
  elapsedSeconds?: number
  latitude: number
  longitude: number
  accuracy?: number
  speedKnots?: number
  cogDegrees?: number
  headingDegrees?: number
  windDirectionDegrees?: number
  vmgCourseKnots?: number
  vmgWindKnots?: number
}

export type CourseDefinition = {
  startLine?: {
    port: { latitude: number; longitude: number }
    starboard: { latitude: number; longitude: number }
  }
  windwardMark?: { latitude: number; longitude: number }
  leewardMark?: { latitude: number; longitude: number }
  windDirectionDegrees?: number
  courseAxisDegrees?: number
  marksEstimated?: boolean
}

export type RaceSummary = {
  durationSeconds?: number
  distanceMeters?: number
  maxSpeedKnots?: number
  averageSpeedKnots?: number
  sampleCount: number
}
