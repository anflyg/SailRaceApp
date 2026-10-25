import { afterEach, describe, expect, it, vi } from 'vitest'
import { NativeAccountSession } from '../auth/session'
import { AuthError, type AuthTokens, type StoredSession } from '../auth/types'
import { createSyntheticAccountSync } from './accountIntegration'
import { createMockWorker } from './mockWorker'
import { createSyncStore } from './storage'
import { syntheticRace } from './syntheticRace'
import { barrier, memoryFiles, response } from './testSupport'
import type { WireRequest, WireResponse } from './types'

const owner = '22222222-2222-4222-8222-222222222222'
const other = '33333333-3333-4333-8333-333333333333'
function fixture() {
  const runtime = { now: Date.parse('2026-01-02T12:00:00Z'), online: true, active: null as string | null }
  let tokens: AuthTokens = { ownerId: owner, accessToken: 'synthetic-access', refreshToken: 'synthetic-refresh', expiresAt: runtime.now + 3600000 }
  let revision = 'initial', value: string | null = null
  const seed = () => { value = JSON.stringify({ ...tokens, version: 1, project: 'synthetic-project', appleUser: 'opaque-apple-subject' } satisfies StoredSession) }
  seed()
  const vault = {
    read: async () => ({ revision, value }),
    write: async (expected: string, next: string) => { if (revision !== expected) throw new AuthError('stale_session'); value = next },
    clear: async () => { revision = crypto.randomUUID(); value = null; return { revision, value } },
  }
  const auth = {
    exchange: vi.fn(async () => tokens), verify: vi.fn(async () => tokens.ownerId), revoke: vi.fn(async () => {}),
    refresh: vi.fn(async () => { tokens = { ...tokens, accessToken: 'synthetic-rotated-access', refreshToken: 'synthetic-rotated-refresh', expiresAt: runtime.now + 3600000 }; return tokens }),
  }
  const apple = { signIn: vi.fn(), credentialState: vi.fn(async () => 'authorized' as const) }
  const account = () => new NativeAccountSession(apple, auth, vault, 'synthetic-project', () => runtime.online, () => runtime.now)
  const session = account(), memory = memoryFiles(), store = createSyncStore(memory.files, 'mock')
  const authenticate = async (header: string) => header === `Bearer ${tokens.accessToken}` ? tokens.ownerId : null
  let worker = createMockWorker(() => runtime.now, undefined, authenticate)
  let intercept: ((request: WireRequest, next: () => Promise<WireResponse>) => Promise<WireResponse>) | undefined
  const transport = { mode: 'mock' as const, request: vi.fn((request: WireRequest) => intercept ? intercept(request, () => worker.transport.request(request)) : worker.transport.request(request)) }
  const options = { store, session, transport, activeRace: () => runtime.active, online: () => runtime.online,
    now: () => runtime.now, sleep: async (ms: number) => { runtime.now += ms }, random: () => 0 }
  const engine = createSyntheticAccountSync(options)
  return { session, account, auth, apple, runtime, store, memory, transport, options, engine,
    worker: () => worker, intercept: (fn: typeof intercept) => { intercept = fn },
    switchOwner: () => { tokens = { ...tokens, ownerId: other }; seed() },
    restartWorker: () => { worker = createMockWorker(() => runtime.now, worker.snapshot(), authenticate) } }
}
afterEach(() => vi.unstubAllGlobals())
describe('native account / synthetic Worker composition', () => {
  it('completes the fixed race with canonical Supabase ownership and no network or token persistence', async () => {
    const network = vi.fn(() => { throw new Error('network forbidden') }); vi.stubGlobal('fetch', network)
    const f = fixture(); await f.session.restore()
    const state = await f.engine.sync(syntheticRace.id)
    expect(state).toMatchObject({ status: 'accepted', ownerId: owner, step: 'done', mode: 'mock' })
    expect(state.ownerId).not.toBe('opaque-apple-subject')
    expect(f.worker().races.get(state.cloudRaceId!)?.ownerId).toBe(owner)
    expect(f.worker().requests.map(r => r.method)).toEqual(['POST','POST','POST','PUT','POST'])
    expect([...f.memory.values.values()].join('') + JSON.stringify(f.worker().snapshot()) + JSON.stringify(f.worker().requests)).not.toMatch(/synthetic-access|synthetic-refresh/)
    expect(network).not.toHaveBeenCalled(); expect(f.apple.signIn).not.toHaveBeenCalled()
  })
  it.each(['expiry', '401'])('refreshes through the native session for %s', async kind => {
    const f = fixture(); await f.session.restore()
    if (kind === 'expiry') f.runtime.now += 3600000
    else { let first = true; f.intercept(async (_r, next) => { if (first) { first = false; return response(401, 'unauthorized') } return next() }) }
    expect((await f.engine.sync(syntheticRace.id)).status).toBe('accepted')
    expect(f.auth.refresh).toHaveBeenCalledOnce()
    expect(f.transport.request.mock.calls.at(-1)![0].headers.Authorization).toBe('Bearer synthetic-rotated-access')
  })
  it('fails closed when expired credentials cannot refresh', async () => {
    const f = fixture(); await f.session.restore(); f.runtime.now += 3600000
    f.auth.refresh.mockRejectedValue(new AuthError('invalid_credentials'))
    await expect(f.engine.sync(syntheticRace.id)).rejects.toThrow('unauthorized')
    expect(f.transport.request).not.toHaveBeenCalled(); expect(await f.session.current()).toBeNull()
  })
  it.each(['logout', 'switch'])('stops after an in-flight content response on %s and preserves its owner/bytes', async action => {
    const f = fixture(); await f.session.restore(); const entered = barrier(), release = barrier()
    f.intercept(async (request, next) => { const result = await next(); if (request.method === 'PUT') { entered.release(); await release.promise } return result })
    const pending = f.engine.sync(syntheticRace.id); await entered.promise
    const artifact = await f.store.artifact(syntheticRace.id)
    await f.session.logout()
    if (action === 'switch') { f.switchOwner(); await f.session.restore() }
    release.release(); const state = await pending
    expect(state.status).toBe('queued'); expect(state.ownerId).toBe(owner)
    expect(f.worker().requests.some(r => r.path.endsWith('/finalize'))).toBe(false)
    expect(await f.store.artifact(syntheticRace.id)).toEqual(artifact)
    if (action === 'switch') await expect(f.engine.sync(syntheticRace.id)).rejects.toThrow('account_changed')
  })
  it('recovers lost content responses after network failure and restart using identical committed bytes', async () => {
    const f = fixture(); await f.session.restore()
    f.intercept(async (request, next) => { const result = await next(); if (request.method === 'PUT') throw new Error('synthetic lost response'); return result })
    const queued = await f.engine.sync(syntheticRace.id), artifact = await f.store.artifact(syntheticRace.id)
    expect(queued).toMatchObject({ status: 'queued', attempts: 3 })
    f.intercept(undefined); f.restartWorker(); f.runtime.now += 10000
    const session = f.account(); await session.restore()
    const restarted = createSyntheticAccountSync({ ...f.options, session })
    const accepted = await restarted.sync(syntheticRace.id, { retry: true })
    expect(accepted).toMatchObject({ status: 'accepted', cloudRaceId: queued.cloudRaceId, ownerId: owner })
    expect(await f.store.artifact(syntheticRace.id)).toEqual(artifact)
    expect(f.worker().races.get(accepted.cloudRaceId!)?.bytes).toEqual(artifact!.bytes)
    expect(f.auth.verify).toHaveBeenCalledTimes(2)
  })
  it('defers offline and during recording, never accepts local race inputs or starts on construction', async () => {
    const f = fixture(); await f.session.restore()
    expect(f.transport.request).not.toHaveBeenCalled()
    await expect(f.engine.sync('local-user-recording')).rejects.toThrow('invalid_race_payload')
    f.runtime.active = 'recording'
    expect((await f.engine.sync(syntheticRace.id)).error).toBe('recording_active')
    f.runtime.active = null; f.runtime.online = false
    // The native provider deliberately exposes no offline bearer.
    await expect(f.engine.sync(syntheticRace.id)).rejects.toThrow('unauthorized')
    expect(f.transport.request).not.toHaveBeenCalled()
    f.runtime.online = true
    expect((await f.engine.sync(syntheticRace.id)).status).toBe('accepted')
  })
  it('rejects real transport/store composition', () => {
    const f = fixture()
    expect(() => createSyntheticAccountSync({ ...f.options, transport: { ...f.transport, mode: 'worker' } })).toThrow('transport_unavailable')
    expect(() => createSyntheticAccountSync({ ...f.options, store: { ...f.store, mode: 'worker' } })).toThrow('transport_unavailable')
  })
})
