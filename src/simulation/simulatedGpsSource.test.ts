import { describe, expect, it, vi } from 'vitest'
import { NORTHBOUND_SIX_KNOTS_SCENARIO } from './sailingSimulator.fixtures'
import { createSailingSimulator } from './sailingSimulator'
import { createSimulatedGpsSource } from './simulatedGpsSource'

const sourceOptions = {
  enableHighAccuracy: true,
  timeout: 10_000,
  maximumAge: 1_000,
  minimumUpdateInterval: 1_000,
  interval: 1_000,
}

describe('simulatedGpsSource', () => {
  it('provides simulator samples through the GpsSource contract', async () => {
    const source = createSimulatedGpsSource(createSailingSimulator(NORTHBOUND_SIX_KNOTS_SCENARIO))
    const callback = vi.fn()

    expect(await source.requestPermission()).toBe('granted')
    expect(source.isAvailable()).toBe(true)
    expect(await source.getCurrentPosition(sourceOptions)).toMatchObject({
      latitude: NORTHBOUND_SIX_KNOTS_SCENARIO.origin.latitude,
      longitude: NORTHBOUND_SIX_KNOTS_SCENARIO.origin.longitude,
      speedMetersPerSecond: null,
    })

    const watchId = await source.watchPosition(sourceOptions, callback)
    expect(source.currentSample()).toMatchObject({ elapsedTimeSeconds: 0 })
    const sample = source.advance()

    expect(source.currentSample()).toEqual(sample)

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({
      latitude: sample.latitude,
      longitude: sample.longitude,
      speedMetersPerSecond: sample.speedMetersPerSecond,
      courseDegrees: 0,
    }))

    await source.clearWatch(watchId)
    source.advance()
    expect(callback).toHaveBeenCalledTimes(1)
  })
})
