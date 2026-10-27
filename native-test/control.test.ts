import { describe, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NativeTestControl, testConfig } from './control'
import { SyncError } from '../src/services/sync/types'
import { createIsolatedNativeSync } from '../src/services/sync/isolatedNative'
import { barrier } from '../src/services/sync/testSupport'

const env = { VITE_NATIVE_TEST_APPROVAL: 'approved-synthetic-only', VITE_NATIVE_TEST_WORKER_ORIGIN: 'https://worker.synthetic.invalid', VITE_NATIVE_TEST_APPROVED_WORKER_ORIGIN: 'https://worker.synthetic.invalid', VITE_SUPABASE_URL: 'https://auth.synthetic.invalid', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic_public_only' }
function fixture() {
  const account = { snapshot: () => ({ status: 'signed_in' as const, ownerId: 'PRIVATE_UUID' }), subscribe: vi.fn(), current: vi.fn(), restore: vi.fn(async () => {}), signIn: vi.fn(async () => {}), logout: vi.fn(async () => {}) }
  const handle = { label: 'SYNTHETIC NATIVE WORKER TEST — NONPRODUCTION' as const, account, stop: vi.fn(), sync: vi.fn(async (_options?: unknown) => ({ status: 'accepted', ownerId: 'PRIVATE_UUID', accessToken: 'PRIVATE_TOKEN' })), read: vi.fn(), removeLocalArtifact: vi.fn() }
  // UI action stub only; transport, Auth and storage are exercised by existing M6b tests.
  const create = vi.fn(async () => handle) as unknown as typeof createIsolatedNativeSync
  return { handle, create, control: new NativeTestControl(testConfig(env), create) }
}
describe('dedicated manual native test caller', () => {
  it('runs the app upload button explicitly with the same checkpoint and no second sign-in', async () => {
    const f = fixture()
    expect(f.create).not.toHaveBeenCalled()
    await f.control.upload()
    expect(f.create).toHaveBeenCalledOnce()
    expect(f.handle.account.signIn).not.toHaveBeenCalled()
    expect(f.handle.sync).toHaveBeenCalledWith({ retry: true })
    expect(JSON.stringify(f.control.snapshot())).not.toMatch(/PRIVATE|ownerId|accessToken/)
    await f.control.upload()
    expect(f.create).toHaveBeenCalledOnce()
    expect(f.handle.sync).toHaveBeenLastCalledWith({ retry: true })
  })
  it('stops a delayed app preparation without restoring or sending an upload', async () => {
    const f = fixture(), release = barrier()
    vi.mocked(f.create).mockImplementationOnce(async () => { await release.promise; return f.handle as never })
    const pending = f.control.upload()
    f.control.stop(); release.release(); await pending
    expect(f.handle.stop).toHaveBeenCalledOnce()
    expect(f.handle.sync).not.toHaveBeenCalled()
    expect(f.handle.account.restore).not.toHaveBeenCalled()
  })
  it('does nothing on construction; config/approval must be supplied before manual preparation', async () => {
    const f = fixture(); expect(f.create).not.toHaveBeenCalled()
    const absent = new NativeTestControl(null, f.create)
    await absent.run('prepare'); await absent.run('sync'); expect(f.create).not.toHaveBeenCalled()
    await f.control.run('prepare'); expect(f.create).toHaveBeenCalledOnce()
    expect(f.handle.account.restore).not.toHaveBeenCalled(); expect(f.handle.sync).not.toHaveBeenCalled()
    await f.control.run('restore'); expect(f.handle.account.restore).toHaveBeenCalledOnce()
    expect(f.handle.sync).not.toHaveBeenCalled()
  })
  it.each(Object.keys(env))('requires explicit valid %s configuration', key => {
    expect(testConfig({ ...env, [key]: '' })).toBeNull()
  })
  it('rejects a secret key or mismatched approved origin', () => {
    expect(testConfig({ ...env, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_forbidden' })).toBeNull()
    expect(testConfig({ ...env, VITE_NATIVE_TEST_APPROVED_WORKER_ORIGIN: 'https://other.invalid' })).toBeNull()
  })
  it('only sends explicit sync/retry and exposes no provider identity, token or full response', async () => {
    const f = fixture(); await f.control.run('prepare'); await f.control.run('signIn')
    await f.control.run('sync'); expect(f.handle.sync).toHaveBeenCalledWith({})
    await f.control.run('retry'); expect(f.handle.sync).toHaveBeenLastCalledWith({ retry: true })
    expect(f.handle.sync).toHaveBeenCalledTimes(2)
    expect(f.control.snapshot().status).toContain('Synthetic upload accepted')
    expect(JSON.stringify(f.control.snapshot())).not.toMatch(/PRIVATE|ownerId|accessToken/)
  })
  it('only displays whitelisted categories and never raw Error messages', async () => {
    const f = fixture(); await f.control.run('prepare')
    f.handle.sync.mockRejectedValueOnce(new Error('PRIVATE_TOKEN provider dump'))
    await f.control.run('sync'); expect(f.control.snapshot().error).toBe('unavailable')
    f.handle.sync.mockRejectedValueOnce(new SyncError('issuance_uncertain'))
    await f.control.run('retry'); expect(f.control.snapshot().error).toBe('issuance_uncertain')
    expect(JSON.stringify(f.control.snapshot())).not.toContain('PRIVATE')
  })
  it('stops late preparation and late sync responses without restarting requests', async () => {
    const f = fixture(), wait = barrier()
    vi.mocked(f.create).mockImplementation(async () => { await wait.promise; return f.handle as never })
    const preparing = f.control.run('prepare'); f.control.stop(); wait.release(); await preparing
    expect(f.handle.stop).toHaveBeenCalledOnce(); expect(f.control.snapshot().prepared).toBe(false)
    vi.mocked(f.create).mockResolvedValue(f.handle as never); await f.control.run('prepare')
    const content = barrier(); f.handle.sync.mockImplementation(async () => { await content.promise; return { status: 'accepted', ownerId: 'PRIVATE_UUID', accessToken: 'PRIVATE_TOKEN' } })
    const pending = f.control.run('sync'); f.control.stop(); content.release(); await pending
    expect(f.control.snapshot().status).toContain('Stopped'); expect(f.control.snapshot().busy).toBe(false)
    await f.control.run('retry'); expect(f.handle.sync).toHaveBeenCalledOnce()
  })
  it('stops before logout and preserves a retry after durable logout failure', async () => {
    const f = fixture(); await f.control.run('prepare')
    f.handle.account.logout.mockImplementationOnce(async () => { expect(f.handle.stop).toHaveBeenCalled(); throw new Error('PRIVATE') })
    await f.control.logout(); expect(f.control.snapshot()).toMatchObject({ logoutPending: true, error: 'storage_unavailable' })
    await f.control.run('prepare'); await f.control.run('signIn'); expect(f.create).toHaveBeenCalledOnce()
    await f.control.logout(); expect(f.handle.account.logout).toHaveBeenCalledTimes(2)
    expect(f.control.snapshot()).toMatchObject({ status: 'Signed out locally', logoutPending: false, error: '' })
  })
})
describe('native test distribution guard', () => {
  it.each(['marker', 'html'])('rejects Release/archive/missing opt-in for %s test assets', mode => {
    const dir = mkdtempSync(join(tmpdir(), 'm6c-guard-'))
    try {
      writeFileSync(join(dir, mode === 'marker' ? 'native-test-only.json' : 'index.html'), mode === 'marker' ? '{}' : '<meta name="TACKWISE_NATIVE_TEST_ONLY">')
      const run = (overrides: NodeJS.ProcessEnv = {}) => execFileSync('/bin/sh', ['scripts/guard-native-test-build.sh', dir], { env: { ...process.env, CONFIGURATION: 'Debug', ACTION: 'build', TACKWISE_NATIVE_TEST_BUILD: '1', SKIP_INSTALL: 'YES', ...overrides }, stdio: 'pipe' })
      expect(() => run()).not.toThrow()
      for (const change of [{ CONFIGURATION: 'Release' }, { ACTION: 'install' }, { TACKWISE_NATIVE_TEST_BUILD: '' }, { SKIP_INSTALL: 'NO' }]) expect(() => run(change)).toThrow()
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
  it('allows ordinary Release assets without native-test opt-in', () => {
    const dir = mkdtempSync(join(tmpdir(), 'm6c-normal-'))
    try {
      writeFileSync(join(dir, 'index.html'), '<title>TackWise Race</title>')
      expect(() => execFileSync('/bin/sh', ['scripts/guard-native-test-build.sh', dir], { env: { ...process.env, CONFIGURATION: 'Release', ACTION: 'install', TACKWISE_NATIVE_TEST_BUILD: '' }, stdio: 'pipe' })).not.toThrow()
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})
