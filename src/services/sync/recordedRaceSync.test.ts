import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { gunzipSync, strFromU8 } from 'fflate'
import { NativeAccountSession } from '../auth/session'
import type { StoredSession } from '../auth/types'
import { startRaceLogging, recordSampleIfDue, stopActiveRace, getActiveRaceId } from '../raceLogger'
import { getRace, updateRace } from '../raceStorage'
import { createRecordedRaceSync } from './recordedRaceSync'
import { existingAuthOrigin, existingWorkerOrigin, type NativeSyncRuntime } from './nativeRuntime'
import { createMockWorker, syntheticOwner } from './mockWorker'
import { unbase64 } from './artifact'
import { createSyncStore } from './storage'
import { barrier, memoryFiles } from './testSupport'
import type { WireRequest } from './types'

beforeEach(() => {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) })
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('network forbidden') }))
})
afterEach(() => vi.unstubAllGlobals())

function recordedRace() {
  const start = Date.parse('2026-10-29T12:00:00Z')
  const race = startRaceLogging({ countdownDurationSeconds: 300, name: 'Private local race', now: new Date(start) })
  for (const offset of [0, 10000]) recordSampleIfDue({ gps: {
    status: 'watching', error: null, latitude: 59.3 + offset / 10000000, longitude: 18,
    accuracyMeters: 3, speedKnots: 4, nativeSpeedKnots: 4, positionSpeedKnots: 4, fusedSpeedKnots: 4,
    courseDegrees: 0, nativeCourseDegrees: 0, positionCourseDegrees: 0, fusedCourseDegrees: 0,
    courseReliable: true, timestamp: start + offset, displayCourseDegrees: 0, presentationTimestamp: start + offset, sampleCount: 1,
  } })
  stopActiveRace({ now: new Date(start + 20000) })
  return getRace(race.id)!
}

function fixture() {
  let time = Date.parse('2026-10-29T12:01:00Z'), online = true
  const auth = { url: existingAuthOrigin, publishableKey: 'sb_publishable_fictional_public_configuration' }
  let saved: StoredSession = { version: 1, project: auth.url, appleUser: 'fictional-apple', ownerId: syntheticOwner,
    accessToken: 'fictional-access', refreshToken: 'fictional-refresh', expiresAt: time + 3600000 }
  let value: string | null = JSON.stringify(saved)
  const vault = { read: vi.fn(async () => ({ revision: 'v1', value })), write: vi.fn(async (_revision: string, next: string) => { value = next }),
    clear: vi.fn(async () => { value = null; return { revision: 'v1', value } }) }
  const account = new NativeAccountSession({ signIn: vi.fn(), credentialState: vi.fn(async () => 'authorized' as const) }, {
    exchange: vi.fn(), verify: vi.fn(async () => saved.ownerId), refresh: vi.fn(async () => saved), revoke: vi.fn(),
  }, vault, auth.url, () => online, () => time)
  const memory = memoryFiles()
  const worker = createMockWorker(() => time, undefined, async header => header === `Bearer ${saved.accessToken}` ? saved.ownerId : null)
  let intercept: ((wire: WireRequest, next: () => ReturnType<typeof worker.transport.request>) => ReturnType<typeof worker.transport.request>) | undefined
  const runtime: NativeSyncRuntime = {
    platform: () => 'ios', configuredAuth: () => auth, account: vi.fn(() => account), files: vi.fn(() => memory.files),
    request: vi.fn(async options => {
      expect(options.url.startsWith(existingWorkerOrigin + '/v1/')).toBe(true)
      expect(options.disableRedirects).toBe(true)
      const wire: WireRequest = { path: new URL(options.url).pathname, method: options.method as WireRequest['method'],
        headers: options.headers!, body: options.dataType === 'file' ? unbase64(options.data) : options.data }
      const next = () => worker.transport.request(wire)
      const result = await (intercept ? intercept(wire, next) : next())
      return { status: result.status, headers: result.headers, data: result.body, url: options.url }
    }),
    activeRace: getActiveRaceId, online: () => online, now: () => time, random: () => 0, sleep: async ms => { time += ms },
  }
  return { runtime, account, vault, memory, worker, open: () => createRecordedRaceSync(runtime)!,
    intercept: (fn: typeof intercept) => { intercept = fn },
    offline: () => { online = false }, advance: () => { time += 10000 },
    switchOwner: async () => { await account.logout(); saved = { ...saved, ownerId: '22222222-2222-4222-8222-222222222222' }; value = JSON.stringify(saved); await account.restore() } }
}

describe('recorded local race → native account → existing Worker coordinator', () => {
  it('constructs without reading races, restoring auth, reading files or dispatching requests', () => {
    const f = fixture(), race = vi.fn(getRace)
    const integration = createRecordedRaceSync(f.runtime, race)!
    expect(integration.account).toBe(f.account)
    expect(integration.coordinator.mode).toBe('worker')
    expect(race).not.toHaveBeenCalled(); expect(f.vault.read).not.toHaveBeenCalled()
    expect(f.memory.values.size).toBe(0); expect(f.runtime.request).not.toHaveBeenCalled()
  })
  it.each(['web', 'android'])('does not compose native sync on %s', platform => {
    const f = fixture()
    expect(createRecordedRaceSync({ ...f.runtime, platform: () => platform })).toBeNull()
    expect(f.runtime.account).not.toHaveBeenCalled(); expect(f.runtime.files).not.toHaveBeenCalled()
  })
  it.each([null, { url: 'https://different.supabase.co', publishableKey: 'sb_publishable_fictional_public_configuration' },
    { url: existingAuthOrigin, publishableKey: 'sb_secret_forbidden' }])('rejects missing, foreign or private Auth configuration %#', config => {
    const f = fixture()
    expect(createRecordedRaceSync({ ...f.runtime, configuredAuth: () => config })).toBeNull()
    expect(f.runtime.account).not.toHaveBeenCalled(); expect(f.runtime.files).not.toHaveBeenCalled()
  })
  it('requires the existing native session and never silently signs in', async () => {
    const f = fixture(), race = recordedRace()
    expect(createRecordedRaceSync({ ...f.runtime, account: () => null })).toBeNull()
    await expect(f.open().coordinator.sync(race.id)).rejects.toThrow('unauthorized')
    expect(f.runtime.request).not.toHaveBeenCalled(); expect(getRace(race.id)).toEqual(race)
  })
  it('uploads exactly the selected logger recording, retains local data and reuses the receipt after reopening', async () => {
    const f = fixture(), first = recordedRace(), selected = recordedRace()
    await f.account.restore()
    const coordinator = f.open().coordinator
    const result = await coordinator.sync(selected.id)
    expect(result).toMatchObject({ status: 'accepted', ownerId: syntheticOwner, localRaceId: selected.id, mode: 'worker' })
    expect(result.cloudRaceId).not.toBe(selected.id)
    const store = createSyncStore(f.memory.files, 'worker'), artifact = (await store.artifact(selected.id))!
    const raw = JSON.parse(strFromU8(gunzipSync(artifact.bytes)))
    expect(raw).toMatchObject({ raceId: result.cloudRaceId, recordingStartedAt: selected.createdAt, endedAt: selected.endTime })
    expect(raw.samples.map((sample: { latitude: number }) => sample.latitude)).toEqual(selected.samples.map(sample => sample.latitude))
    expect(raw).not.toHaveProperty('name'); expect(raw).not.toHaveProperty('ownerId')
    expect(raw.samples[0]).not.toHaveProperty('vmgCourseKnots')
    expect(getRace(selected.id)).toEqual(selected); expect(getRace(first.id)).toEqual(first)
    expect(await store.state(first.id)).toBeNull()
    expect([...f.memory.values.values()].join('')).not.toMatch(/fictional-access|fictional-refresh|Private local race/)
    const count = vi.mocked(f.runtime.request).mock.calls.length
    expect(await f.open().coordinator.sync(selected.id)).toEqual(result)
    expect(f.runtime.request).toHaveBeenCalledTimes(count)
    expect(count).toBe(5); expect(fetch).not.toHaveBeenCalled()
  })
  it('blocks unfinished races and all sync while any recording is active', async () => {
    const f = fixture(), completed = recordedRace(); await f.account.restore()
    const active = startRaceLogging({ countdownDurationSeconds: 300 })
    await expect(f.open().coordinator.sync(active.id)).rejects.toThrow('invalid_race_payload')
    await expect(f.open().coordinator.sync(completed.id)).rejects.toThrow('recording_active')
    expect(f.runtime.request).not.toHaveBeenCalled(); expect(f.memory.values.size).toBe(0)
  })
  it('does not dispatch when recording starts during an awaited session check', async () => {
    const f = fixture(), race = recordedRace(); await f.account.restore()
    const current = f.account.current.bind(f.account)
    vi.spyOn(f.account, 'current').mockImplementationOnce(async refresh => {
      const result = await current(refresh); startRaceLogging({ countdownDurationSeconds: 300 }); return result
    })
    await expect(f.open().coordinator.sync(race.id)).rejects.toThrow('recording_active')
    expect(f.runtime.request).not.toHaveBeenCalled()
  })
  it('defers offline and resumes lost-content responses with the same persisted ID and exact bytes', async () => {
    const f = fixture(), race = recordedRace(); await f.account.restore()
    f.intercept(async (wire, next) => { const result = await next(); if (wire.method === 'PUT') throw new Error('lost'); return result })
    const queued = await f.open().coordinator.sync(race.id)
    expect(queued.status).toBe('queued')
    const store = createSyncStore(f.memory.files, 'worker'), artifact = await store.artifact(race.id)
    expect(getRace(race.id)).toEqual(race)
    f.intercept(undefined); f.advance()
    updateRace(race.id, { name: 'Renamed locally' })
    expect(await f.open().coordinator.sync(race.id, { retry: true })).toMatchObject({ status: 'accepted', cloudRaceId: queued.cloudRaceId })
    expect(await store.artifact(race.id)).toEqual(artifact)
    f.offline()
    const count = vi.mocked(f.runtime.request).mock.calls.length
    await expect(f.open().coordinator.sync(race.id)).rejects.toThrow('offline')
    expect(f.runtime.request).toHaveBeenCalledTimes(count)
  })
  it.each(['logout', 'switch'])('stops after %s during content and never transfers a saved association', async action => {
    const f = fixture(), race = recordedRace(); await f.account.restore()
    const entered = barrier(), release = barrier()
    f.intercept(async (wire, next) => { const result = await next(); if (wire.method === 'PUT') { entered.release(); await release.promise } return result })
    const coordinator = f.open().coordinator, pending = coordinator.sync(race.id)
    await entered.promise
    if (action === 'logout') await f.account.logout(); else await f.switchOwner()
    release.release()
    expect((await pending).status).toBe('queued')
    expect(f.worker.requests.some(wire => wire.path.endsWith('/finalize'))).toBe(false)
    await expect(coordinator.read(race.id)).rejects.toThrow(action === 'logout' ? 'unauthorized' : 'account_changed')
    expect(getRace(race.id)).toEqual(race)
  })
  it('reports the exact disabled gate without poisoning issuance, then permits an explicit retry', async () => {
    const f = fixture(), race = recordedRace(); await f.account.restore()
    f.intercept(async () => ({ status: 404, headers: {}, body: '{"error":"not_found"}' }))
    expect(await f.open().coordinator.sync(race.id)).toMatchObject({ status: 'queued', error: 'uploads_disabled', issuancePending: false })
    expect(f.worker.intents.size).toBe(0); expect(getRace(race.id)).toEqual(race)
    f.intercept(undefined)
    expect((await f.open().coordinator.sync(race.id, { retry: true })).status).toBe('accepted')
    expect(f.worker.intents.size).toBe(1)
  })
  it('retains uncertainty for a lost issuance response and never automatically issues a replacement', async () => {
    const f = fixture(), race = recordedRace(); await f.account.restore()
    f.intercept(async (wire, next) => { const result = await next(); if (wire.path.endsWith('race-creation-intents')) throw new Error('lost'); return result })
    expect(await f.open().coordinator.sync(race.id)).toMatchObject({ error: 'issuance_uncertain', issuancePending: true })
    f.intercept(undefined)
    expect(await f.open().coordinator.sync(race.id, { retry: true })).toMatchObject({ error: 'issuance_uncertain' })
    expect(f.worker.intents.size).toBe(1); expect(getRace(race.id)).toEqual(race)
  })
  it('does not treat malformed or extended 404 envelopes as definite pre-issuance rejection', async () => {
    for (const body of ['{"error":"not_found","extra":true}', '{"error":"other"}', 'not-json']) {
      const f = fixture(), race = recordedRace(); await f.account.restore()
      f.intercept(async () => ({ status: 404, headers: {}, body }))
      expect(await f.open().coordinator.sync(race.id)).toMatchObject({ error: 'issuance_uncertain', issuancePending: true })
      expect(getRace(race.id)).toEqual(race)
    }
  })
})
