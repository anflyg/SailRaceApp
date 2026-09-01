import { afterEach, describe, expect, it, vi } from 'vitest'
import { ensureLoggedRaceAnalysis } from './loggedRaceAnalysisValidation'
import { listRaces } from './raceStorage'

class MockStorage implements Storage {
  private values = new Map<string, string>()
  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, value) }
}

afterEach(() => vi.unstubAllGlobals())

describe('logged race analysis pipeline', () => {
  it('runs the real logger pipeline again instead of reusing a stale fixture', () => {
    vi.stubGlobal('localStorage', new MockStorage())
    const first = ensureLoggedRaceAnalysis()
    const second = ensureLoggedRaceAnalysis()

    expect(first.report.logging).toMatchObject({ observationCount: 9, storedSampleCount: 9, pass: true })
    expect(second.report.logging).toMatchObject({ observationCount: 9, storedSampleCount: 9, pass: true })
    expect(second.report.storage.pass).toBe(true)
    expect(second.report.analysis.pass).toBe(true)
    expect(second.race.id).not.toBe(first.race.id)
    expect(listRaces().filter((race) => race.name === 'Logged race analysis fixture')).toHaveLength(1)
  })
})
