import { describe, expect, it, vi } from 'vitest'
import { NativeAccountSession, verifyNonce } from './session'
import { AuthError, type AppleCredential, type AuthTokens, type SessionVault, type VaultEnvelope } from './types'
import { harness } from '../sync/testSupport'
import { syntheticSession } from '../sync/mockWorker'
import { WorkerClient } from '../sync/workerClient'
import { RaceSyncCoordinator } from '../sync/coordinator'
const owner = syntheticSession.ownerId
const other = '22222222-2222-4222-8222-222222222222'
const time = 1800000000000
const project = 'https://synthetic.invalid'
const tokens: AuthTokens = { ownerId: owner, accessToken: syntheticSession.accessToken, refreshToken: 'synthetic-refresh', expiresAt: time + 3600000 }
async function appleCredential(): Promise<AppleCredential> {
  const rawNonce = 'ab'.repeat(32)
  const nonce = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawNonce))), b => b.toString(16).padStart(2, '0')).join('')
  return { rawNonce, appleUser: 'synthetic-apple-user', identityToken: `header.${btoa(JSON.stringify({ nonce, sub: 'synthetic-apple-user' }))}.synthetic-signature` }
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r }); return { promise, resolve } }
function fixture() {
  let envelope: VaultEnvelope = { revision: crypto.randomUUID(), value: null }
  const vault: SessionVault = {
    read: vi.fn(async () => ({ ...envelope })),
    write: vi.fn(async (revision, value) => { if (revision !== envelope.revision) throw new AuthError('stale_session'); envelope.value = value }),
    clear: vi.fn(async () => { envelope = { revision: crypto.randomUUID(), value: null }; return { ...envelope } }),
  }
  const apple = { signIn: vi.fn(appleCredential), credentialState: vi.fn(async () => 'authorized' as 'authorized' | 'revoked' | 'unknown') }
  const auth = { exchange: vi.fn(async () => ({ ...tokens })), refresh: vi.fn(async () => ({ ...tokens, accessToken: 'rotated-access', refreshToken: 'rotated-refresh', expiresAt: time + 7200000 })), verify: vi.fn(async () => owner), revoke: vi.fn(async () => {}) }
  const runtime = { online: true, now: time }
  const create = () => new NativeAccountSession(apple, auth, vault, project, () => runtime.online, () => runtime.now)
  return { vault, apple, auth, runtime, create, session: create(), saved: () => envelope.value, set: (value: string) => { envelope.value = value } }
}
describe('native Apple/Supabase session authority', () => {
  it('checks SHA-256 nonce and Apple subject before sending the raw nonce for server verification', async () => {
    const f = fixture(); await f.session.signIn()
    expect(f.auth.exchange).toHaveBeenCalledWith(await appleCredential())
    expect(await f.session.current()).toEqual({ ownerId: owner, accessToken: tokens.accessToken })
    expect(Object.keys(JSON.parse(f.saved()!)).sort()).toEqual(['accessToken','appleUser','expiresAt','ownerId','project','refreshToken','version'])
    expect(f.saved()).not.toMatch(/email|fullName|identityToken|rawNonce/)
  })
  it.each(['nonce', 'subject', 'malformed', 'weak_nonce'])('rejects %s without token exchange', async kind => {
    const f = fixture(), value = await appleCredential()
    if (kind === 'nonce') value.rawNonce = 'ff'.repeat(32)
    if (kind === 'subject') value.appleUser = 'other'
    if (kind === 'malformed') value.identityToken = 'bad'
    if (kind === 'weak_nonce') value.rawNonce = 'not-random'
    f.apple.signIn.mockResolvedValue(value)
    await expect(f.session.signIn()).rejects.toThrow('invalid_credentials')
    expect(f.auth.exchange).not.toHaveBeenCalled(); expect(f.saved()).toBeNull()
  })
  it('uses a known SHA-256 vector rather than accepting a double hash', async () => {
    const c = await appleCredential(); await expect(verifyNonce(c)).resolves.toBeUndefined()
    c.identityToken = `h.${btoa(JSON.stringify({ sub: c.appleUser, nonce: c.rawNonce }))}.s`
    await expect(verifyNonce(c)).rejects.toThrow('invalid_credentials')
  })
  it('requires explicit logout before replacing a persisted account after restart', async () => {
    const f = fixture(); await f.session.signIn(); const before = f.saved()
    const restarted = f.create(); await expect(restarted.signIn()).rejects.toThrow('busy')
    expect(f.saved()).toBe(before); expect(f.apple.signIn).toHaveBeenCalledOnce()
    await restarted.logout(); f.auth.exchange.mockResolvedValue({ ...tokens, ownerId: other })
    await restarted.signIn(); expect(await restarted.current()).toMatchObject({ ownerId: other })
  })
  it('restores only the protected session, checks Apple credential state and verifies the Supabase UUID', async () => {
    const f = fixture(); await f.session.signIn(); const restart = f.create(); await restart.restore()
    expect(await restart.current()).toMatchObject({ ownerId: owner })
    expect(f.auth.verify).toHaveBeenCalledWith(tokens.accessToken)
    expect(f.apple.signIn).toHaveBeenCalledOnce()
  })
  it('restores expired tokens through one controlled rotating refresh and persists before exposing them', async () => {
    const f = fixture(); await f.session.signIn(); f.runtime.now += 3600000
    const restarted = f.create(); await restarted.restore()
    expect(f.auth.refresh).toHaveBeenCalledOnce(); expect(f.auth.refresh).toHaveBeenCalledWith(tokens.refreshToken)
    expect(JSON.parse(f.saved()!).refreshToken).toBe('rotated-refresh')
    expect(await restarted.current()).toEqual({ ownerId: owner, accessToken: 'rotated-access' })
  })
  it('coalesces concurrent refreshes and throttles subsequent forced retries', async () => {
    const f = fixture(); await f.session.signIn()
    const [a, b] = await Promise.all([f.session.current(true), f.session.current(true)])
    expect(a).toEqual(b); expect(f.auth.refresh).toHaveBeenCalledOnce()
    expect(await f.session.current(true)).toBeNull(); expect(f.auth.refresh).toHaveBeenCalledOnce()
  })
  it('keeps offline credentials private and performs no Apple/exchange/refresh network work', async () => {
    const f = fixture(); await f.session.signIn(); const saved = f.saved(); f.runtime.online = false
    const restarted = f.create(); await expect(restarted.restore()).rejects.toThrow('offline')
    expect(restarted.snapshot().status).toBe('offline'); expect(await restarted.current()).toBeNull()
    expect(f.auth.verify).not.toHaveBeenCalled(); expect(f.auth.refresh).not.toHaveBeenCalled(); expect(f.saved()).toBe(saved)
    f.runtime.online = true; await restarted.restore(); expect(await restarted.current()).toMatchObject({ ownerId: owner })
  })
  it('handles cancellation and does not automatically restart Apple sign-in', async () => {
    const f = fixture(); f.apple.signIn.mockRejectedValue(new AuthError('cancelled'))
    await expect(f.session.signIn()).rejects.toThrow('cancelled'); await f.session.restore()
    expect(await f.session.current()).toBeNull(); expect(f.apple.signIn).toHaveBeenCalledOnce()
  })
  it('fails closed on invalid exchange, revoked Apple credentials and unknown credential status', async () => {
    const f = fixture(); f.auth.exchange.mockRejectedValueOnce(new AuthError('invalid_credentials'))
    await expect(f.session.signIn()).rejects.toThrow('invalid_credentials'); expect(f.saved()).toBeNull()
    await f.session.signIn(); f.apple.credentialState.mockResolvedValue('unknown')
    expect(await f.session.current()).toBeNull(); expect(f.saved()).not.toBeNull()
    f.apple.credentialState.mockResolvedValue('revoked')
    expect(await f.session.current()).toBeNull(); expect(f.saved()).toBeNull()
  })
  it.each(['verify', 'refresh'] as const)('clears invalid Supabase %s credentials', async operation => {
    const f = fixture(); await f.session.signIn(); f.auth[operation].mockRejectedValue(new AuthError('invalid_credentials'))
    if (operation === 'verify') await expect(f.create().restore()).rejects.toThrow('invalid_credentials')
    else expect(await f.session.current(true)).toBeNull()
    expect(f.saved()).toBeNull()
  })
  it('rejects a refreshed or restored different Supabase owner', async () => {
    const f = fixture(); await f.session.signIn(); f.auth.refresh.mockResolvedValue({ ...tokens, ownerId: other })
    expect(await f.session.current(true)).toBeNull(); expect(f.saved()).toBeNull()
    await f.session.signIn(); f.auth.verify.mockResolvedValue(other)
    await expect(f.create().restore()).rejects.toThrow('invalid_credentials'); expect(f.saved()).toBeNull()
  })
  it.each(['corrupt', 'project', 'extra'])('fails closed on %s protected state', async kind => {
    const f = fixture(); await f.session.signIn()
    const value = JSON.parse(f.saved()!)
    if (kind === 'project') value.project = 'https://foreign.invalid'
    if (kind === 'extra') value.email = 'not-collected'
    f.set(kind === 'corrupt' ? '{' : JSON.stringify(value))
    await expect(f.create().restore()).rejects.toThrow('invalid_credentials'); expect(f.saved()).toBeNull()
  })
  it('never exposes restored credentials after an uncertain verification result', async () => {
    const f = fixture(); await f.session.signIn(); f.auth.verify.mockRejectedValueOnce(new AuthError('unavailable'))
    const restarted = f.create(); await expect(restarted.restore()).rejects.toThrow('unavailable')
    expect(await restarted.current()).toBeNull(); expect(f.saved()).not.toBeNull()
    await restarted.restore(); expect(await restarted.current()).toMatchObject({ ownerId: owner })
  })
  it('does not expose a session when Keychain persistence fails', async () => {
    const f = fixture(); vi.mocked(f.vault.write).mockRejectedValue(new AuthError('storage_unavailable'))
    await expect(f.session.signIn()).rejects.toThrow('storage_unavailable'); expect(await f.session.current()).toBeNull()
  })
  it('persists logout before network revocation, including offline and restart', async () => {
    const f = fixture(); await f.session.signIn()
    f.auth.revoke.mockImplementation(async () => { expect(f.saved()).toBeNull() })
    await f.session.logout(); expect(f.auth.revoke).toHaveBeenCalledWith(tokens.accessToken)
    await f.create().restore(); expect(await f.session.current()).toBeNull(); expect(f.apple.signIn).toHaveBeenCalledOnce()
    await f.session.signIn(); f.runtime.online = false; await f.session.logout()
    expect(f.saved()).toBeNull(); expect(f.auth.revoke).toHaveBeenCalledOnce()
  })
  it('does not resurrect a logged-out account from a delayed sign-in response', async () => {
    const f = fixture(), wait = deferred<AuthTokens>()
    f.auth.exchange.mockReturnValue(wait.promise)
    const pending = f.session.signIn(); await vi.waitFor(() => expect(f.auth.exchange).toHaveBeenCalled())
    await f.session.logout(); wait.resolve(tokens)
    await expect(pending).rejects.toThrow('stale_session'); expect(f.saved()).toBeNull(); expect(await f.session.current()).toBeNull()
  })
  it('rejects an old Keychain revision after logout even if a writer was already submitted', async () => {
    const f = fixture(); await f.session.signIn(); const before = await f.vault.read(); await f.session.logout()
    await expect(f.vault.write(before.revision, before.value!)).rejects.toThrow('stale_session')
    expect(f.saved()).toBeNull()
  })
  it('does not resurrect a logged-out account from delayed refresh or restore', async () => {
    const f = fixture(); await f.session.signIn(); const wait = deferred<AuthTokens>()
    f.auth.refresh.mockReturnValue(wait.promise)
    const pending = f.session.current(true); await vi.waitFor(() => expect(f.auth.refresh).toHaveBeenCalled())
    await f.session.logout(); wait.resolve(tokens)
    expect(await pending).toBeNull(); expect(f.saved()).toBeNull()
    await f.session.signIn(); const check = deferred<string>(); f.auth.verify.mockReturnValue(check.promise)
    const restored = f.create(); const restore = restored.restore(); await vi.waitFor(() => expect(f.auth.verify).toHaveBeenCalled())
    await restored.logout(); check.resolve(owner); await expect(restore).rejects.toThrow('stale_session')
    expect(f.saved()).toBeNull()
  })
  it('reports failed durable logout instead of claiming success', async () => {
    const f = fixture(); await f.session.signIn(); vi.mocked(f.vault.clear).mockRejectedValue(new AuthError('storage_unavailable'))
    await expect(f.session.logout()).rejects.toThrow('storage_unavailable'); expect(await f.session.current()).toBeNull()
    expect(f.session.snapshot()).toMatchObject({ status: 'error', error: 'storage_unavailable' })
  })
  it('preserves local races and immutable coordinator checkpoints across logout and account switching', async () => {
    const f = fixture(), h = harness(); await f.session.signIn()
    const engine = new RaceSyncCoordinator({ ...h.dependencies, api: new WorkerClient(h.transport, f.session) })
    const race = structuredClone(h.race)
    const state = await engine.sync(h.race.id), artifact = await h.store.artifact(h.race.id)
    expect(state.status).toBe('accepted')
    await f.session.logout(); expect(await h.store.state(h.race.id)).toEqual(state)
    f.auth.exchange.mockResolvedValue({ ...tokens, ownerId: other }); await f.session.signIn()
    await expect(engine.sync(h.race.id)).rejects.toThrow('account_changed')
    expect(await h.store.artifact(h.race.id)).toEqual(artifact); expect(await h.store.state(h.race.id)).toEqual(state); expect(h.race).toEqual(race)
  })
})
