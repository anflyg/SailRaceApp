import type { GpsPositionCallback, GpsSource, GpsSourceOptions } from '../services/gps/gpsSource'
import {
  sampleToGpsPosition,
  type SailingSimulationSample,
  type SailingSimulator,
} from './sailingSimulator'

export interface SimulatedGpsSource extends GpsSource {
  currentSample(): SailingSimulationSample
  advance(): SailingSimulationSample
}

export function createSimulatedGpsSource(simulator: SailingSimulator): SimulatedGpsSource {
  const callbacks = new Map<string, GpsPositionCallback>()
  let nextWatchId = 1

  return {
    isAvailable: () => true,
    requestPermission: async () => 'granted',
    getCurrentPosition: async (_options: GpsSourceOptions) => sampleToGpsPosition(simulator.currentSample()),
    watchPosition: async (_options: GpsSourceOptions, callback: GpsPositionCallback) => {
      const watchId = `simulated-watch-${nextWatchId}`
      nextWatchId += 1
      callbacks.set(watchId, callback)
      return watchId
    },
    clearWatch: async (watchId: string) => {
      callbacks.delete(watchId)
    },
    currentSample: () => simulator.currentSample(),
    advance: () => {
      const sample = simulator.step()
      const position = sampleToGpsPosition(sample)

      callbacks.forEach((callback) => callback(position))

      return sample
    },
  }
}
