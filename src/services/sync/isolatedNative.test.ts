import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { Directory } from '@capacitor/filesystem'
import { NativeAccountSession } from '../auth/session'
import { AuthError, type AuthTokens, type StoredSession } from '../auth/types'
import { createIsolatedNativeSync, existingWorkerOrigin, type IsolatedNativeConfig, type IsolatedNativeRuntime } from './isolatedNative'
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
const existingConfig: IsolatedNativeConfig = { ...config, purpose: 'synthetic-existing-backend', workerOrigin: existingWorkerOrigin, approvedWorkerOrigin: existingWorkerOrigin }
function existingFixture() {
  const f = fixture(), request = f.runtime.request
  const probe = vi.fn(async () => ({ status: 401, headers: {}, data: JSON.stringify({ code: 'unauthorized', requestId: 'probe-request' }) }))
  f.runtime.request = vi.fn(async options => options.headers?.Authorization ? request(options) : { ...await probe(), url: options.url })
  return { ...f, probe, open: () => createIsolatedNativeSync(existingConfig, f.runtime) }
}
describe('fixed synthetic upload to the existing backend', () => {
  async function expiredTest() {
    const f = existingFixture(), handle = await f.open()
    await handle.account.restore()
    f.intercept(async (wire, next) => wire.path.endsWith('/content')
      ? { status: 422, headers: {}, body: '{"code":"invalid_race_payload","requestId":"fixture"}' } : next())
    const previous = await handle.sync()
    const oldFiles = new Map(f.files)
    f.intercept(async (wire, next) => wire.path === `/v1/races/${previous.cloudRaceId}/upload`
      ? { status: 410, headers: {}, body: '{"code":"upload_expired","requestId":"fixture"}' } : next())
    return { ...f, handle, previous, oldFiles }
  }
  it('starts a separate test only on explicit action after server-confirmed expiry; old evidence survives restart', async () => {
    const f = await expiredTest(), calls = vi.mocked(f.runtime.request).mock.calls.length
    await f.handle.newTest()
    expect(vi.mocked(f.runtime.request).mock.calls).toHaveLength(calls + 1)
    expect(vi.mocked(f.runtime.request).mock.calls.at(-1)![0].url).toBe(`${existingWorkerOrigin}/v1/races/${f.previous.cloudRaceId}/upload`)
    expect(f.worker.intents.size).toBe(1)
    for (const [path, text] of f.oldFiles) expect(f.files.get(path)).toBe(text)
    f.handle.stop()
    const restarted = await f.open()
    expect(await restarted.read()).toBeNull()
    const uploaded = await restarted.sync()
    expect(uploaded.status).toBe('accepted')
    expect(uploaded.cloudRaceId).not.toBe(f.previous.cloudRaceId)
    expect(uploaded.localRaceId).toMatch(/^synthetic-test-/)
    expect(f.worker.races.get(f.previous.cloudRaceId!)?.accepted).toBe(false)
    expect(f.worker.intents.size).toBe(2)
    const count = f.worker.requests.length
    expect((await (await f.open()).sync()).cloudRaceId).toBe(uploaded.cloudRaceId)
    expect(f.worker.requests).toHaveLength(count)
    for (const [path, text] of f.oldFiles) expect(f.files.get(path)).toBe(text)
    await expect(restarted.newTest()).rejects.toThrow('race_conflict')
  })
  it.each([400, 401, 403, 404, 409, 422, 503])('does not start another test after non-expiry or ambiguous prepare (%s)', async status => {
    const f = await expiredTest()
    f.intercept(async () => ({ status, headers: {}, body: '{"code":"upstream_unavailable","requestId":"fixture"}' }))
    await expect(f.handle.newTest()).rejects.toThrow()
    expect(f.files).toEqual(f.oldFiles)
    expect(f.worker.intents.size).toBe(1)
  })
  it('does not replace a test whose reservation is still prepared, even after a content-route 410', async () => {
    const f = await expiredTest()
    f.intercept(async (wire, next) => wire.path.endsWith('/content')
      ? { status: 410, headers: {}, body: '{"code":"upload_expired","requestId":"fixture"}' } : next())
    await expect(f.handle.newTest()).rejects.toThrow('race_conflict')
    expect(f.files).toEqual(f.oldFiles)
  })
  it('rejects corrupt selection instead of silently returning to an earlier test', async () => {
    const f = await expiredTest()
    await f.handle.newTest()
    const selectionPath = [...f.files.keys()].find(path => !f.oldFiles.has(path))!
    f.files.set(selectionPath, '{"version":1,"localRaceId":"bad"}')
    await expect((await f.open()).sync()).rejects.toThrow('storage_unavailable')
    expect(f.worker.intents.size).toBe(1)
  })
  it('fails closed for a missing saved artifact and for a remotely accepted old test', async () => {
    const f = await expiredTest()
    f.worker.races.get(f.previous.cloudRaceId!)!.accepted = true
    f.intercept(undefined)
    await expect(f.handle.newTest()).rejects.toThrow('race_conflict')
    expect(f.files).toEqual(f.oldFiles)
    f.worker.races.get(f.previous.cloudRaceId!)!.accepted = false
    await f.handle.removeLocalArtifact()
    const calls = vi.mocked(f.runtime.request).mock.calls.length
    await expect(f.handle.newTest()).rejects.toThrow('artifact_missing')
    expect(vi.mocked(f.runtime.request).mock.calls).toHaveLength(calls)
    expect(f.worker.intents.size).toBe(1)
  })
  it('does not select a new test if the account changes while expiry is being checked', async () => {
    const f = await expiredTest()
    f.intercept(async () => {
      f.switchOwner(); await f.account.restore()
      return { status: 410, headers: {}, body: '{"code":"upload_expired","requestId":"fixture"}' }
    })
    await expect(f.handle.newTest()).rejects.toThrow('account_changed')
    expect(f.files).toEqual(f.oldFiles)
    expect(f.worker.intents.size).toBe(1)
  })
  it('retains selection ownership, rejects overlapping actions, and admits no new test after stop', async () => {
    const f = await expiredTest(), wait = barrier()
    f.intercept(async () => { await wait.promise; return { status: 410, headers: {}, body: '{"code":"upload_expired","requestId":"fixture"}' } })
    const pending = f.handle.newTest()
    await expect(f.handle.newTest()).rejects.toThrow('race_conflict')
    f.handle.stop(); wait.release()
    await expect(pending).rejects.toThrow('unauthorized')
    expect(f.files).toEqual(f.oldFiles)
    const fresh = await f.open(); await fresh.newTest()
    f.switchOwner(); const otherHandle = await f.open(); await otherHandle.account.restore()
    await expect(otherHandle.sync()).rejects.toThrow('account_changed')
    expect(f.worker.intents.size).toBe(1)
  })
  it('checks admission without a bearer, uploads the same fixed race, and retains its accepted receipt', async () => {
    const f = existingFixture(), handle = await f.open()
    expect(f.runtime.request).not.toHaveBeenCalled()
    await handle.account.restore()
    const result = await handle.sync()
    expect(result).toMatchObject({ status: 'accepted', mode: 'worker', ownerId: syntheticOwner })
    expect(handle.label).not.toContain('NONPRODUCTION')
    expect(f.probe).toHaveBeenCalledOnce()
    expect(vi.mocked(f.runtime.request).mock.calls[0][0]).toMatchObject({ url: existingWorkerOrigin + '/v1/race-creation-intents', method: 'POST', headers: { 'Content-Type': 'application/json' }, data: '{}' })
    expect(vi.mocked(f.runtime.request).mock.calls[0][0].headers?.Authorization).toBeUndefined()
    expect(f.worker.requests).toHaveLength(5)
    expect(await handle.sync({ retry: true })).toEqual(result)
    expect(f.probe).toHaveBeenCalledOnce()
    expect(f.worker.requests).toHaveLength(5)
    expect(fetch).not.toHaveBeenCalled()
  })
  it('reports disabled uploads before creating any checkpoint, intent or R2 work', async () => {
    const f = existingFixture(), handle = await f.open(); await handle.account.restore()
    f.probe.mockResolvedValue({ status: 404, headers: {}, data: '{"error":"not_found"}' })
    await expect(handle.sync()).rejects.toThrow('uploads_disabled')
    expect(f.files.size).toBe(0); expect(f.worker.requests).toHaveLength(0)
    // Once admitted, retry uses the existing protocol without uncertain issuance.
    f.probe.mockResolvedValue({ status: 401, headers: {}, data: '{"code":"unauthorized","requestId":"probe"}' })
    expect((await handle.sync({ retry: true })).status).toBe('accepted')
  })
  it.each([
    [200, '{"code":"unauthorized","requestId":"probe"}'],
    [401, '{"code":"unauthorized"}'], [401, '{"code":"other","requestId":"probe"}'],
    [404, '{"error":"other"}'], [500, 'PRIVATE_PROVIDER_ERROR'], [401, 'x'.repeat(8193)],
  ])('fails closed for unexpected probe response %s without persisting issuance', async (status, data) => {
    const f = existingFixture(), handle = await f.open(); await handle.account.restore()
    f.probe.mockResolvedValue({ status: Number(status), headers: {}, data: String(data) })
    await expect(handle.sync()).rejects.toThrow('upstream_unavailable')
    expect(f.files.size).toBe(0); expect(f.worker.requests).toHaveLength(0)
  })
  it.each(['stop', 'logout', 'switch'])('does not begin issuance after %s during admission', async action => {
    const f = existingFixture(), handle = await f.open(); await handle.account.restore()
    const entered = barrier(), release = barrier()
    f.probe.mockImplementationOnce(async () => { entered.release(); await release.promise; return { status: 401, headers: {}, data: '{"code":"unauthorized","requestId":"probe"}' } })
    const pending = handle.sync(); await entered.promise
    if (action === 'stop') handle.stop()
    else { await handle.account.logout(); if (action === 'switch') { f.switchOwner(); await handle.account.restore() } }
    release.release()
    await expect(pending).rejects.toThrow(action === 'stop' ? 'unauthorized' : 'account_changed')
    expect(f.files.size).toBe(0); expect(f.worker.requests).toHaveLength(0)
  })
  it('requires the exact existing origin and does not probe while recording or offline', async () => {
    const f = existingFixture()
    await expect(createIsolatedNativeSync({ ...existingConfig, workerOrigin: config.workerOrigin, approvedWorkerOrigin: config.workerOrigin }, f.runtime)).rejects.toThrow('transport_unavailable')
    const handle = await f.open(); await handle.account.restore()
    f.state.active = 'recording'
    await expect(handle.sync()).rejects.toThrow('recording_active')
    f.state.active = null; f.state.online = false
    await expect(handle.sync()).rejects.toThrow('offline')
    expect(f.runtime.request).not.toHaveBeenCalled()
  })
})
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
      await expect(test.sync()).rejects.toThrow('unauthorized')
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
