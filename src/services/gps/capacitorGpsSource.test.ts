import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Capacitor } from '@capacitor/core'
import { Geolocation, type Position } from '@capacitor/geolocation'
import { capacitorGpsSource } from './capacitorGpsSource'

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn(),
    isPluginAvailable: vi.fn(),
  },
}))

vi.mock('@capacitor/geolocation', () => ({
  Geolocation: {
    requestPermissions: vi.fn(),
    getCurrentPosition: vi.fn(),
    watchPosition: vi.fn(),
    clearWatch: vi.fn(),
  },
}))

const options = {
  enableHighAccuracy: true,
  timeout: 10_000,
  maximumAge: 1_000,
  minimumUpdateInterval: 1_000,
  interval: 1_000,
}

const capacitorPosition = {
  coords: {
    latitude: 59.3293,
    longitude: 18.0686,
    accuracy: 4.5,
    speed: 5,
    course: 271,
    heading: 123,
    altitude: null,
    altitudeAccuracy: null,
  },
  timestamp: 1_700_000_000_000,
} as unknown as Position

function invocationCallOrder(fn: unknown): number[] {
  return (fn as { mock: { invocationCallOrder: number[] } }).mock.invocationCallOrder
}

describe('capacitorGpsSource', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
    vi.mocked(Capacitor.isPluginAvailable).mockReturnValue(true)
    vi.mocked(Geolocation.requestPermissions).mockResolvedValue({ location: 'granted', coarseLocation: 'granted' })
    vi.mocked(Geolocation.getCurrentPosition).mockResolvedValue(capacitorPosition)
    vi.mocked(Geolocation.watchPosition).mockResolvedValue('watch-1')
    vi.mocked(Geolocation.clearWatch).mockResolvedValue()
  })

  it('uses native permission, initial position, watch and unchanged options', async () => {
    const watchCallback = vi.fn()
    await capacitorGpsSource.requestPermission()
    await capacitorGpsSource.getCurrentPosition(options)
    await capacitorGpsSource.watchPosition(options, watchCallback)

    expect(Geolocation.requestPermissions).toHaveBeenCalledWith({ permissions: ['location'] })
    expect(Geolocation.getCurrentPosition).toHaveBeenCalledWith(options)
    expect(Geolocation.watchPosition).toHaveBeenCalledWith(options, expect.any(Function))
    expect(invocationCallOrder(Geolocation.requestPermissions)[0]).toBeLessThan(
      invocationCallOrder(Geolocation.getCurrentPosition)[0],
    )
    expect(invocationCallOrder(Geolocation.getCurrentPosition)[0]).toBeLessThan(
      invocationCallOrder(Geolocation.watchPosition)[0],
    )
  })

  it('maps live GPS fields and preserves m/s speed and course values', async () => {
    const mapped = await capacitorGpsSource.getCurrentPosition(options)

    expect(mapped).toEqual({
      latitude: 59.3293,
      longitude: 18.0686,
      accuracyMeters: 4.5,
      speedMetersPerSecond: 5,
      courseDegrees: 271,
      headingDegrees: 123,
      timestamp: 1_700_000_000_000,
    })
  })

  it('does not use native heading when course is missing', async () => {
    vi.mocked(Geolocation.getCurrentPosition).mockResolvedValue({
      ...capacitorPosition,
      coords: { ...capacitorPosition.coords, course: null },
    } as unknown as Position)

    const mapped = await capacitorGpsSource.getCurrentPosition(options)

    expect(mapped.courseDegrees).toBeNull()
    expect(mapped.headingDegrees).toBe(123)
  })

  it('uses heading as a web fallback when course is missing', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false)
    vi.mocked(Geolocation.getCurrentPosition).mockResolvedValue({
      ...capacitorPosition,
      coords: { ...capacitorPosition.coords, course: null },
    } as unknown as Position)

    const mapped = await capacitorGpsSource.getCurrentPosition(options)

    expect(mapped.courseDegrees).toBe(123)
  })

  it('forwards watch errors and null positions and clears the watch id', async () => {
    const callback = vi.fn()
    const watchCallback = vi.mocked(Geolocation.watchPosition).mock.calls
    await capacitorGpsSource.watchPosition(options, callback)
    const nativeCallback = vi.mocked(Geolocation.watchPosition).mock.calls[0]?.[1]

    nativeCallback?.(null, { code: 1, message: 'GPS failed' })
    expect(callback).toHaveBeenCalledWith(null, { code: 1, message: 'GPS failed' })
    expect(watchCallback).toHaveLength(1)

    await capacitorGpsSource.clearWatch('watch-1')
    expect(Geolocation.clearWatch).toHaveBeenCalledWith({ id: 'watch-1' })
  })
})
