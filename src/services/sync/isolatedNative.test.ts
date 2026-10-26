import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { Directory } from '@capacitor/filesystem'
import { NativeAccountSession } from '../auth/session'
import { AuthError, type AuthTokens, type StoredSession } from '../auth/types'
import { createIsolatedNativeSync, type IsolatedNativeConfig, type IsolatedNativeRuntime } from './isolatedNative'
import { createMockWorker, syntheticOwner } from './mockWorker'
import { digest, unbase64 } from './artifact'
import { createSyncStore, nativePrivateFiles } from './storage'
import { barrier } from './testSupport'
import type { WireRequest } from './types'

const authConfig = { url: 'https://auth.synthetic.invalid', publishableKey: 'sb_publishable_synthetic_public_only' }
const config: IsolatedNativeConfig = { purpose: 'synthetic-nonproduction', workerOrigin: 'https://worker.synthetic.invalid', approvedWorkerOrigin: 'https://worker.synthetic.invalid', auth: authConfig }
const other = '22222222-2222-4222-8222-222222222222'
function fixture() {
  const state = { time: Date.parse('2026-10-25T12:00:00Z'), online: true, active: null as string | null }
  let tokens: AuthTokens = { ownerId: syntheticOwner, accessToken: 'synthetic-native-access', refreshToken: 'synthetic-native-refresh', expiresAt: state.time + 3600000 }
  let revision = 'original', value: string | null = null
  const seed = () => { value = JSON.stringify({ ...tokens, version: 1, project: authConfig.url, appleUser: 'opaque-apple-subject' } satisfies StoredSession) }
  seed()
  const vault = { read: vi.fn(async () => ({ revision, value })), write: async (expected: string, next: string) => { if (expected !== revision) throw new AuthError('stale_session'); value = next },
    clear: async () => { revision = crypto.randomUUID(); value = null; return { revision, value } } }
  const auth = { exchange: vi.fn(async () => tokens), verify: vi.fn(async () => tokens.ownerId), refresh: vi.fn(async () => tokens), revoke: vi.fn(async () => {}) }
  const account = new NativeAccountSession({ signIn: vi.fn(), credentialState: async () => 'authorized' }, auth, vault, authConfig.url, () => state.online, () => state.time)
  const files = new Map<string, string>()
  const missing = () => Object.assign(new Error('missing'), { code: 'OS-PLUG-FILE-0008' })
  const fs = {
    readdir: vi.fn(async (o: { path: string; directory: Directory }) => { expect(o.directory).toBe(Directory.Library); return { files: [...files.keys()].filter(k => k.startsWith(o.path + '/')).map(k => ({ name: k.slice(o.path.length + 1) })) } }),
    readFile: async (o: { path: string; directory: Directory }) => { expect(o.directory).toBe(Directory.Library); if (!files.has(o.path)) throw missing(); return { data: files.get(o.path)! } },
    writeFile: async (o: { path: string; directory: Directory; data: string }) => { expect(o.directory).toBe(Directory.Library); files.set(o.path, o.data); return { uri: o.path } },
    rename: async (o: { from: string; to: string; directory: Directory; toDirectory: Directory }) => { expect(o.directory).toBe(Directory.Library); expect(o.toDirectory).toBe(Directory.Library); files.set(o.to, files.get(o.from)!); files.delete(o.from) },
    deleteFile: async (o: { path: string; directory: Directory }) => { expect(o.directory).toBe(Directory.Library); files.delete(o.path) },
  }
  const privateFiles = () => nativePrivateFiles(fs as unknown as Parameters<typeof nativePrivateFiles>[0])
  const worker = createMockWorker(() => state.time, undefined, async header => header === `Bearer ${tokens.accessToken}` ? tokens.ownerId : null)
  let intercept: ((wire: WireRequest, next: () => Promise<Awaited<ReturnType<typeof worker.transport.request>>>) => ReturnType<typeof worker.transport.request>) | undefined
  const runtime: IsolatedNativeRuntime = {
    platform: () => 'ios', configuredAuth: () => authConfig, account: vi.fn(() => account), files: vi.fn(privateFiles),
    request: vi.fn(async options => {
      const wire: WireRequest = { path: new URL(options.url).pathname, method: options.method as WireRequest['method'], headers: options.headers!, body: options.dataType === 'file' ? unbase64(options.data) : options.data }
      const next = () => worker.transport.request(wire)
      const result = await (intercept ? intercept(wire, next) : next())
      return { status: result.status, headers: result.headers, data: result.body, url: options.url }
    }),
    activeRace: () => state.active, online: () => state.online, now: () => state.time,
    sleep: async ms => { state.time += ms }, random: () => 0,
  }
  return { state, account, auth, vault, runtime, files, fs, worker, privateFiles,
    open: (c = config) => createIsolatedNativeSync(c, runtime),
    switchOwner: () => { tokens = { ...tokens, ownerId: other }; seed() },
    intercept: (fn: typeof intercept) => { intercept = fn } }
}
beforeEach(() => vi.stubGlobal('fetch', vi.fn(() => { throw new Error('network forbidden') })))
afterEach(() => vi.unstubAllGlobals())
describe('explicit native nonproduction synthetic composition', () => {
  it.each([
    undefined, {}, { ...config, purpose: 'production' }, { ...config, workerOrigin: '' },
    { ...config, approvedWorkerOrigin: 'https://different.invalid' },
    ...['http://worker.synthetic.invalid', 'https://worker.synthetic.invalid/', 'https://worker.synthetic.invalid/path', 'https://worker.synthetic.invalid?x=1', 'https://worker.synthetic.invalid#x', 'https://user:pass@worker.synthetic.invalid'].map(workerOrigin => ({ ...config, workerOrigin, approvedWorkerOrigin: workerOrigin })),
    { ...config, auth: undefined }, { ...config, auth: { ...authConfig, url: 'https://different.invalid' } },
    { ...config, auth: { ...authConfig, publishableKey: 'sb_secret_forbidden' } },
    { ...config, auth: { ...authConfig, publishableKey: 'sb_publishable_different_public_key' } },
  ])('fails closed before native/session/storage work for invalid configuration %#', async input => {
    const f = fixture()
    await expect(createIsolatedNativeSync(input as IsolatedNativeConfig, f.runtime)).rejects.toThrow('transport_unavailable')
    expect(f.runtime.account).not.toHaveBeenCalled(); expect(f.runtime.files).not.toHaveBeenCalled(); expect(f.runtime.request).not.toHaveBeenCalled()
  })
  it('requires iOS, configured Auth and the native session authority; never restores or syncs on construction', async () => {
    const f = fixture()
    await expect(createIsolatedNativeSync(config, { ...f.runtime, platform: () => 'web' })).rejects.toThrow('transport_unavailable')
    await expect(createIsolatedNativeSync(config, { ...f.runtime, configuredAuth: () => null })).rejects.toThrow('transport_unavailable')
    await expect(createIsolatedNativeSync(config, { ...f.runtime, account: () => null })).rejects.toThrow('unauthorized')
    const test = await f.open()
    expect(test.account).toBe(f.account); expect(f.vault.read).not.toHaveBeenCalled()
    expect(f.fs.readdir).not.toHaveBeenCalled(); expect(f.runtime.request).not.toHaveBeenCalled()
    await expect(test.sync()).rejects.toThrow('unauthorized')
  })
  it('uses exact native gzip headers/bytes and only private worker-mode storage for the fixed synthetic race', async () => {
    const f = fixture(), test = await f.open(); await test.account.restore()
    const result = await test.sync(), store = createSyncStore(f.privateFiles(), 'worker')
    expect(result).toMatchObject({ status: 'accepted', mode: 'worker', ownerId: syntheticOwner })
    expect(test.label).toContain('SYNTHETIC')
    const artifact = (await store.artifact(result.localRaceId))!
    const calls = vi.mocked(f.runtime.request).mock.calls.map(([o]) => o)
    const put = calls.find(o => o.method === 'PUT')!
    expect(calls).toHaveLength(5)
    expect(calls.every(o => new URL(o.url).origin === config.approvedWorkerOrigin && o.disableRedirects)).toBe(true)
    expect(put).toMatchObject({ dataType: 'file', headers: { 'Content-Type': 'application/gzip', 'Content-Length': String(artifact.bytes.length), Authorization: 'Bearer synthetic-native-access' } })
    expect(put.headers!['Content-Encoding']).toBeUndefined()
    expect(unbase64(put.data)).toEqual(artifact.bytes); expect(await digest(unbase64(put.data))).toBe(artifact.prepare.rawSha256)
    expect([...f.worker.races.values()][0].bytes).toEqual(artifact.bytes)
    expect([...f.files.keys()].every(k => /^TackWiseSyncV1\/worker-[a-f0-9]{64}-(state|artifact)\.[0-9]+\.json$/.test(k))).toBe(true)
    expect([...f.files.values()].join('')).not.toMatch(/synthetic-native-access|synthetic-native-refresh|opaque-apple-subject/)
    expect(await createSyncStore(f.privateFiles(), 'mock').state(result.localRaceId)).toBeNull()
    expect(await (await f.open()).read()).toEqual(result)
    expect(fetch).not.toHaveBeenCalled()
  })
  it.each(['logout', 'switch', 'stop'])('stops subsequent phases after %s while native content is in flight', async action => {
    const f = fixture(), test = await f.open(); await test.account.restore()
    const entered = barrier(), release = barrier()
    f.intercept(async (wire, next) => { const result = await next(); if (wire.method === 'PUT') { entered.release(); await release.promise } return result })
    const pending = test.sync(); await entered.promise
    if (action === 'stop') test.stop()
    else { await test.account.logout(); if (action === 'switch') { f.switchOwner(); await test.account.restore() } }
    release.release(); const queued = await pending
    expect(queued.status).toBe('queued'); expect(queued.ownerId).toBe(syntheticOwner)
    expect(f.worker.requests.some(r => r.path.endsWith('/finalize'))).toBe(false)
    if (action === 'switch') { await expect(test.sync()).rejects.toThrow('account_changed'); await expect(test.read()).rejects.toThrow('account_changed') }
    if (action === 'stop') {
      expect(() => test.sync()).toThrow('unauthorized')
      f.intercept(undefined)
      expect((await (await f.open()).sync({ retry: true })).status).toBe('accepted')
    }
  })
  it('retains immutable worker checkpoints after lost native responses and resumes explicitly', async () => {
    const f = fixture(), test = await f.open(); await test.account.restore()
    f.intercept(async (wire, next) => { const result = await next(); if (wire.method === 'PUT') throw new Error('synthetic lost response'); return result })
    const queued = await test.sync(), store = createSyncStore(f.privateFiles(), 'worker')
    const original = await store.artifact(queued.localRaceId)
    expect(queued).toMatchObject({ status: 'queued', attempts: 3 })
    test.stop(); f.intercept(undefined); f.state.time += 10000
    const restart = await f.open()
    const done = await restart.sync({ retry: true })
    expect(done).toMatchObject({ status: 'accepted', cloudRaceId: queued.cloudRaceId, ownerId: queued.ownerId })
    expect(await store.artifact(done.localRaceId)).toEqual(original)
  })
  it('defers active recording and offline/background work without automatic reconnect', async () => {
    const f = fixture(), test = await f.open(); await test.account.restore()
    f.state.active = 'local-recording'
    expect((await test.sync()).error).toBe('recording_active')
    f.state.active = null; f.state.online = false
    await expect(test.sync()).rejects.toThrow('unauthorized')
    expect(f.runtime.request).not.toHaveBeenCalled()
    f.state.online = true
    expect(f.runtime.request).not.toHaveBeenCalled()
    expect((await test.sync()).status).toBe('accepted')
  })
  it('separates origins/projects and fails before HTTP if private storage is unavailable', async () => {
    const f = fixture(), test = await f.open(); await test.account.restore(); const first = await test.sync()
    const changed = { ...config, workerOrigin: 'https://second.synthetic.invalid', approvedWorkerOrigin: 'https://second.synthetic.invalid' }
    expect(await (await f.open(changed)).read()).toBeNull()
    const secondAuth = { ...authConfig, url: 'https://second-auth.synthetic.invalid' }
    // Session is not restored in this different-project construction; verify only empty namespace.
    const second = await createIsolatedNativeSync({ ...config, auth: secondAuth }, { ...f.runtime, configuredAuth: () => secondAuth })
    expect(await second.read()).toBeNull()
    const failed = await createIsolatedNativeSync(config, { ...f.runtime, files: () => ({ read: async () => { throw new Error('storage unavailable') }, write: async () => {}, remove: async () => {} }) })
    const count = vi.mocked(f.runtime.request).mock.calls.length
    await expect(failed.sync()).rejects.toThrow('storage_unavailable')
    expect(f.runtime.request).toHaveBeenCalledTimes(count)
    expect((await test.read())!.cloudRaceId).toBe(first.cloudRaceId)
  })
  it('has no normal app entry point or caller-supplied race lookup', () => {
    for (const path of ['src/App.tsx', 'src/app/AppShell.tsx', 'src/features/setup/SetupView.tsx']) {
      expect(readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8')).not.toContain('isolatedNative')
    }
    const source = readFileSync(new URL('./isolatedNative.ts', import.meta.url), 'utf8')
    expect(source).not.toMatch(/getRace\(|listRaces\(|localStorage|indexedPrivateFiles|createMockWorker/)
  })
})
