import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clampLaylineAlphaDegrees,
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
    }))
    vi.stubGlobal('localStorage', storage)

    const loaded = loadAppSettings()

    expect(loaded.layline.enabled).toBe(true)
    expect(loaded.layline.alphaDegrees).toBe(110)
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
})
