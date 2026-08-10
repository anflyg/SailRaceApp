import type { GpsPosition, GpsPositionCallback, GpsSource, GpsSourceOptions } from './gpsSource'

/** A deterministic GPS source for unit tests; it intentionally has no sailing behaviour. */
export interface FakeGpsSource extends GpsSource {
  emitPosition(position: GpsPosition): void
  emitError(error: unknown): void
  readonly clearedWatchIds: readonly string[]
}

export function createFakeGpsSource(initialPosition: GpsPosition): FakeGpsSource {
  let callback: GpsPositionCallback | null = null
  let nextWatchId = 1
  const clearedWatchIds: string[] = []

  return {
    isAvailable: () => true,
    requestPermission: async () => 'granted',
    getCurrentPosition: async (_options: GpsSourceOptions) => initialPosition,
    watchPosition: async (_options: GpsSourceOptions, nextCallback: GpsPositionCallback) => {
      callback = nextCallback
      const watchId = `fake-watch-${nextWatchId}`
      nextWatchId += 1
      return watchId
    },
    clearWatch: async (watchId: string) => {
      clearedWatchIds.push(watchId)
      callback = null
    },
    emitPosition: (position: GpsPosition) => callback?.(position),
    emitError: (error: unknown) => callback?.(null, error),
    clearedWatchIds,
  }
}
