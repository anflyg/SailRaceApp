import { uuid, record, type Session } from '../sync/types'
import { AuthError, type AccountSession, type AccountSnapshot, type AppleAdapter, type AppleCredential, type AuthTokens, type SessionVault, type StoredSession, type SupabaseAdapter } from './types'

export async function verifyNonce(credential: AppleCredential): Promise<void> {
  try {
    if (!/^[0-9a-f]{64}$/.test(credential.rawNonce) || credential.identityToken.length > 16384 || !credential.appleUser || credential.appleUser.length > 512) throw new Error()
    const parts = credential.identityToken.split('.')
    if (parts.length !== 3) throw new Error()
    const claims = JSON.parse(atob(parts[1].replaceAll('-', '+').replaceAll('_', '/')))
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(credential.rawNonce))), b => b.toString(16).padStart(2, '0')).join('')
    if (claims.nonce !== hash || claims.sub !== credential.appleUser) throw new Error()
    // Shape/association check only. Supabase verifies signature, issuer, audience and nonce.
  } catch { throw new AuthError('invalid_credentials') }
}
export function checkTokens(value: AuthTokens): AuthTokens {
  if (!value || !uuid.test(value.ownerId) || typeof value.accessToken !== 'string' || !value.accessToken || value.accessToken.length > 8192
    || typeof value.refreshToken !== 'string' || !value.refreshToken || value.refreshToken.length > 2048
    || !Number.isSafeInteger(value.expiresAt) || value.expiresAt <= 0) throw new AuthError('invalid_credentials')
  return { ownerId: value.ownerId, accessToken: value.accessToken, refreshToken: value.refreshToken, expiresAt: value.expiresAt }
}

/** Single foreground session authority. No timers, browser storage or race-storage access. */
export class NativeAccountSession implements AccountSession {
  private state: AccountSnapshot = { status: 'signed_out' }
  private session: StoredSession | null = null
  private listeners = new Set<() => void>()
  private epoch = 0
  private validated = false
  private flight?: Promise<unknown>
  private retryAt = 0
  private currentFlight?: Promise<Session | null>
  private apple: AppleAdapter
  private auth: SupabaseAdapter
  private vault: SessionVault
  private project: string
  private online: () => boolean
  private now: () => number
  constructor(apple: AppleAdapter, auth: SupabaseAdapter, vault: SessionVault,
    project: string, online = () => navigator.onLine, now = () => Date.now()) {
    this.apple = apple; this.auth = auth; this.vault = vault; this.project = project; this.online = online; this.now = now
  }
  snapshot = () => this.state
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private publish(state: AccountSnapshot) { this.state = state; this.listeners.forEach(listener => listener()) }
  private live(epoch: number) { if (epoch !== this.epoch) throw new AuthError('stale_session') }
  private async run<T>(task: (epoch: number) => Promise<T>): Promise<T> {
    const epoch = this.epoch
    const promise = task(epoch)
    this.flight = promise
    try { return await promise } catch (error) {
      if (epoch === this.epoch) {
        const code = error instanceof AuthError ? error.code : 'unavailable'
        this.publish({ status: code === 'offline' ? 'offline' : code === 'cancelled' ? 'signed_out' : 'error', error: code, ...(this.session ? { ownerId: this.session.ownerId } : {}) })
      }
      throw error instanceof AuthError ? error : new AuthError('unavailable')
    } finally { if (this.flight === promise) this.flight = undefined }
  }
  private requireOnline() { if (!this.online()) throw new AuthError('offline') }
  private async credential(user: string, epoch: number) {
    const state = await this.apple.credentialState(user)
    this.live(epoch)
    if (state === 'revoked') { await this.logout(); throw new AuthError('invalid_credentials') }
    if (state !== 'authorized') throw new AuthError('unavailable')
  }
  async restore(): Promise<void> {
    if (this.flight) { await this.flight; return }
    return this.run(async epoch => {
      this.validated = false
      this.publish({ status: 'restoring' })
      const envelope = await this.vault.read(); this.live(epoch)
      if (!envelope.value) { this.session = null; this.publish({ status: 'signed_out' }); return }
      let saved: StoredSession
      try {
        const value: unknown = JSON.parse(envelope.value)
        if (!record(value) || Object.keys(value).sort().join() !== 'accessToken,appleUser,expiresAt,ownerId,project,refreshToken,version'
          || value.version !== 1 || value.project !== this.project || typeof value.appleUser !== 'string' || !value.appleUser || value.appleUser.length > 512) throw new Error()
        saved = { ...checkTokens(value as unknown as AuthTokens), version: 1, project: this.project, appleUser: value.appleUser }
      } catch { await this.logout(); throw new AuthError('invalid_credentials') }
      this.session = saved
      this.requireOnline()
      await this.credential(saved.appleUser, epoch)
      if (saved.expiresAt <= this.now() + 30000) await this.refresh(epoch, envelope.revision)
      else {
        let owner: string
        try { owner = await this.auth.verify(saved.accessToken) }
        catch (error) { if (error instanceof AuthError && error.code === 'invalid_credentials') await this.logout(); throw error }
        this.live(epoch)
        if (owner !== saved.ownerId) { await this.logout(); throw new AuthError('invalid_credentials') }
      }
      this.live(epoch); this.validated = true; this.publish({ status: 'signed_in', ownerId: saved.ownerId })
    })
  }
  async signIn(): Promise<void> {
    if (this.flight) throw new AuthError('busy')
    // Switching accounts always requires explicit logout first.
    if (this.session) throw new AuthError('busy')
    return this.run(async epoch => {
      this.requireOnline(); this.publish({ status: 'signing_in' })
      const envelope = await this.vault.read(); this.live(epoch)
      if (envelope.value) throw new AuthError('busy') // Restore or explicitly log out persisted ownership first.
      const credential = await this.apple.signIn(); this.live(epoch)
      await verifyNonce(credential); this.live(epoch)
      const tokens = checkTokens(await this.auth.exchange(credential)); this.live(epoch)
      const saved: StoredSession = { ...tokens, version: 1, project: this.project, appleUser: credential.appleUser }
      if (tokens.expiresAt <= this.now()) throw new AuthError('invalid_credentials')
      await this.vault.write(envelope.revision, JSON.stringify(saved)); this.live(epoch)
      this.session = saved; this.validated = true; this.retryAt = 0; this.publish({ status: 'signed_in', ownerId: saved.ownerId })
    })
  }
  private async refresh(epoch: number, revision: string) {
    if (!this.session) return
    if (this.now() < this.retryAt) throw new AuthError('unavailable')
    const before = this.session
    this.validated = false
    this.retryAt = this.now() + 30000 // Bounded retries, including explicit 401 refresh.
    let tokens: AuthTokens
    try { tokens = checkTokens(await this.auth.refresh(before.refreshToken)) }
    catch (error) {
      this.live(epoch)
      if (error instanceof AuthError && error.code === 'invalid_credentials') await this.logout()
      throw error
    }
    this.live(epoch)
    if (tokens.ownerId !== before.ownerId || tokens.expiresAt <= this.now()) { await this.logout(); throw new AuthError('invalid_credentials') }
    const saved = { ...before, ...tokens }
    await this.vault.write(revision, JSON.stringify(saved)); this.live(epoch)
    this.session = saved; this.validated = true
  }
  current(forceRefresh = false): Promise<Session | null> {
    if (this.currentFlight) return this.currentFlight
    const task = this.getCurrent(forceRefresh)
    this.currentFlight = task
    void task.finally(() => { if (this.currentFlight === task) this.currentFlight = undefined })
    return task
  }
  private async getCurrent(forceRefresh: boolean): Promise<Session | null> {
    if (this.flight) { try { await this.flight } catch { return null } }
    if (!this.session || !this.validated) return null
    try {
      return await this.run(async epoch => {
        this.requireOnline()
        const saved = this.session!
        await this.credential(saved.appleUser, epoch)
        if (forceRefresh || saved.expiresAt <= this.now() + 30000) {
          const envelope = await this.vault.read(); this.live(epoch)
          await this.refresh(epoch, envelope.revision)
        }
        this.live(epoch)
        this.publish({ status: 'signed_in', ownerId: this.session!.ownerId })
        return { ownerId: this.session!.ownerId, accessToken: this.session!.accessToken }
      })
    } catch { return null }
  }
  async logout(): Promise<void> {
    ++this.epoch
    const old = this.session
    this.session = null; this.validated = false; this.retryAt = 0; this.publish({ status: 'signed_out' })
    try { await this.vault.clear() } catch { this.publish({ status: 'error', error: 'storage_unavailable' }); throw new AuthError('storage_unavailable') }
    // Local logout is complete before optional network revocation. No automatic re-login.
    if (old && this.online()) { try { await this.auth.revoke(old.accessToken) } catch { /* Server expiry still applies; no token retained for retry. */ } }
  }
}
