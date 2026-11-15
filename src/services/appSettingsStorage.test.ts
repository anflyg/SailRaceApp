import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clampLaylineAlphaDegrees,
  clampWindShiftDegreesPerDot,
  DEFAULT_WIND_SHIFT_DEGREES_PER_DOT,
  loadAppSettings,
  saveAppSettings,
} from './appSettingsStorage'

const STORAGE_KEY = 'aster-race:app-settings:v1'

class MockStorage implements Storage {
  public readonly length = 0
  private readonly values = new Map<string, string>()

  clear(): void {
    this.values.clear()
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('appSettingsStorage layline alpha', () => {
  it('clamp:ar alpha till 70–110°', () => {
    expect(clampLaylineAlphaDegrees(69)).toBe(70)
    expect(clampLaylineAlphaDegrees(70)).toBe(70)
    expect(clampLaylineAlphaDegrees(90)).toBe(90)
    expect(clampLaylineAlphaDegrees(110)).toBe(110)
    expect(clampLaylineAlphaDegrees(111)).toBe(110)
  })

  it('normaliserar sparade värden inom tillåtna gränser', () => {
    const storage = new MockStorage()
    storage.setItem(STORAGE_KEY, JSON.stringify({
      layline: {
        enabled: true,
        alphaDegrees: 999,
      },
      displayMode: 'standard',
    }))
    vi.stubGlobal('localStorage', storage)

    const loaded = loadAppSettings()

    expect(loaded.layline.enabled).toBe(true)
    expect(loaded.layline.alphaDegrees).toBe(110)
    expect(loaded.language).toBe('sv')
  })

  it('bevarar äldre layline-inställningar när displayMode finns kvar', () => {
    const storage = new MockStorage()
    storage.setItem(STORAGE_KEY, JSON.stringify({
      layline: {
        enabled: false,
        alphaDegrees: 72,
      },
      displayMode: 'sun',
    }))
    vi.stubGlobal('localStorage', storage)

    expect(loadAppSettings().layline).toEqual({ enabled: false, alphaDegrees: 72 })
    expect(loadAppSettings().language).toBe('sv')
  })

  it('sparar och läser tillbaka layline-inställningar', () => {
    const storage = new MockStorage()
    vi.stubGlobal('localStorage', storage)

    saveAppSettings({
      layline: {
        enabled: false,
        alphaDegrees: 72,
      },
    })

    const loaded = loadAppSettings()
    expect(loaded.layline.enabled).toBe(false)
    expect(loaded.layline.alphaDegrees).toBe(72)
  })

  it('sparar och läser tillbaka valt språk', () => {
    const storage = new MockStorage()
    vi.stubGlobal('localStorage', storage)
    saveAppSettings({ layline: { enabled: true, alphaDegrees: 90 }, language: 'en' })
    expect(loadAppSettings().language).toBe('en')
  })

  it('sparar och läser tillbaka valt kompassläge mellan appstarter', () => {
    const storage = new MockStorage()
    vi.stubGlobal('localStorage', storage)
    saveAppSettings({
      layline: { enabled: true, alphaDegrees: 90 },
      language: 'sv',
      compassDisplayMode: 'wind-relative',
    })
    expect(loadAppSettings().compassDisplayMode).toBe('wind-relative')
  })
})

describe('wind shift degrees per dot setting', () => {
  it('defaults to 5 and clamps integer controls to 2–10', () => {
    expect(DEFAULT_WIND_SHIFT_DEGREES_PER_DOT).toBe(5)
    expect(clampWindShiftDegreesPerDot(1)).toBe(2)
    expect(clampWindShiftDegreesPerDot(2)).toBe(2)
    expect(clampWindShiftDegreesPerDot(10)).toBe(10)
    expect(clampWindShiftDegreesPerDot(11)).toBe(10)
  })

  it('adds the default to older settings without changing existing values', () => {
    const storage = new MockStorage()
    storage.setItem(STORAGE_KEY, JSON.stringify({ layline: { enabled: false, alphaDegrees: 72 }, language: 'en', compassDisplayMode: 'wind-relative' }))
    vi.stubGlobal('localStorage', storage)
    expect(loadAppSettings()).toMatchObject({
      layline: { enabled: false, alphaDegrees: 72 }, language: 'en', compassDisplayMode: 'wind-relative', windShiftDegreesPerDot: 5,
    })
  })

  it('round-trips valid values and safely defaults invalid stored values', () => {
    const storage = new MockStorage()
    vi.stubGlobal('localStorage', storage)
    saveAppSettings({ layline: { enabled: true, alphaDegrees: 90 }, windShiftDegreesPerDot: 8 })
    expect(loadAppSettings().windShiftDegreesPerDot).toBe(8)
    storage.setItem(STORAGE_KEY, JSON.stringify({ layline: { enabled: false, alphaDegrees: 72 }, windShiftDegreesPerDot: '8' }))
    expect(loadAppSettings()).toMatchObject({ layline: { enabled: false, alphaDegrees: 72 }, windShiftDegreesPerDot: 5 })
    storage.setItem(STORAGE_KEY, JSON.stringify({ windShiftDegreesPerDot: 99 }))
    expect(loadAppSettings().windShiftDegreesPerDot).toBe(10)
  })
})
