import { beforeEach, describe, expect, it, vi } from 'vitest'

const { capacitor, nativeAppInfo } = vi.hoisted(() => ({
  capacitor: {
    getPlatform: vi.fn(),
    isPluginAvailable: vi.fn(),
  },
  nativeAppInfo: {
    getInfo: vi.fn(),
  },
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: capacitor,
  registerPlugin: () => nativeAppInfo,
}))

import {
  formatInstalledAppVersion,
  getInstalledAppInfo,
  normalizeInstalledAppInfo,
} from './installedAppInfo'

describe('installed iOS app version', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capacitor.getPlatform.mockReturnValue('ios')
    capacitor.isPluginAvailable.mockReturnValue(true)
  })

  it('reads version and build from the native app-info plugin', async () => {
    nativeAppInfo.getInfo.mockResolvedValue({ version: '9.8.7', build: '42' })

    const info = await getInstalledAppInfo()

    expect(nativeAppInfo.getInfo).toHaveBeenCalledOnce()
    expect(info).toEqual({ version: '9.8.7', build: '42' })
    expect(formatInstalledAppVersion(info)).toBe('9.8.7 (42)')
    expect(formatInstalledAppVersion(info)).not.toBe('0.1.0 (74)')
  })

  it('returns no version when native metadata is missing or blank', async () => {
    nativeAppInfo.getInfo.mockResolvedValue({ version: '', build: null })

    expect(await getInstalledAppInfo()).toBeNull()
    expect(normalizeInstalledAppInfo({ version: '1.0.0' })).toBeNull()
    expect(formatInstalledAppVersion(null)).toBeNull()
  })

  it('does not call the native plugin in browser or simulation', async () => {
    capacitor.getPlatform.mockReturnValue('web')

    expect(await getInstalledAppInfo()).toBeNull()
    expect(nativeAppInfo.getInfo).not.toHaveBeenCalled()
  })

  it('fails safely when the native plugin is unavailable or rejects', async () => {
    capacitor.isPluginAvailable.mockReturnValue(false)
    expect(await getInstalledAppInfo()).toBeNull()
    expect(nativeAppInfo.getInfo).not.toHaveBeenCalled()

    capacitor.isPluginAvailable.mockReturnValue(true)
    nativeAppInfo.getInfo.mockRejectedValue(new Error('unavailable'))
    expect(await getInstalledAppInfo()).toBeNull()
  })
})
