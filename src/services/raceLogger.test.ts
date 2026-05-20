import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getActiveRaceId,
  recordLaylineTackEventIfActive,
  startRaceLogging,
  stopActiveRace,
} from './raceLogger'
import { getRace, listRaces } from './raceStorage'

class MockStorage implements Storage {
  public get length(): number {
    return this.values.size
  }

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

describe('recordLaylineTackEventIfActive', () => {
  it('sparar inget event utan aktiv race logging', () => {
    vi.stubGlobal('localStorage', new MockStorage())

    const result = recordLaylineTackEventIfActive({
      timestamp: '2026-05-20T12:00:00.000Z',
      latitude: 59.33,
      longitude: 18.06,
      speedKnots: 6.1,
      cogDegrees: 42,
      alphaDegrees: 90,
      postTackHeadingDegrees: 132,
      laylineVariant: 'plus-alpha',
    })

    expect(result).toBeNull()
    expect(listRaces()).toHaveLength(0)
  })

  it('sparar event när race logging är aktiv', () => {
    vi.stubGlobal('localStorage', new MockStorage())

    const startedRace = startRaceLogging({
      countdownDurationSeconds: 300,
      now: new Date('2026-05-20T12:00:00.000Z'),
    })
    const activeRaceId = getActiveRaceId()

    expect(activeRaceId).toBe(startedRace.id)

    const updatedRace = recordLaylineTackEventIfActive({
      timestamp: '2026-05-20T12:01:00.000Z',
      latitude: 59.33,
      longitude: 18.06,
      speedKnots: 6.1,
      cogDegrees: 42,
      alphaDegrees: 90,
      postTackHeadingDegrees: 132,
      laylineVariant: 'plus-alpha',
    })

    expect(updatedRace).not.toBeNull()
    expect(updatedRace?.events).toHaveLength(1)
    expect(updatedRace?.events[0]?.type).toBe('layline-tack')
    expect(getRace(startedRace.id)?.events).toHaveLength(1)

    stopActiveRace({ now: new Date('2026-05-20T12:20:00.000Z') })
  })
})
