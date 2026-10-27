import { AuthError } from '../auth/types'
import { createIsolatedNativeSync, type IsolatedNativeConfig } from './isolatedNative'
import { SyncError } from './types'

type Handle = Awaited<ReturnType<typeof createIsolatedNativeSync>>
export type Action = 'prepare' | 'restore' | 'signIn' | 'sync' | 'retry'
const codes = new Set(['invalid_request','unauthorized','cloud_access_unavailable','upload_not_found','race_conflict','upload_expired','payload_too_large','unsupported_media_type','invalid_race_payload','rate_limited','upstream_unavailable','recording_active','offline','account_changed','intent_expired','issuance_uncertain','artifact_missing','storage_unavailable','transport_unavailable','cancelled','unavailable','invalid_credentials','busy','stale_session','configuration_missing','uploads_disabled'])
const safeCode = (code: unknown) => typeof code === 'string' && codes.has(code) ? code : 'unavailable'
export class NativeTestControl {
  private handle?: Handle
  private pendingLogout?: Handle['account']
  private generation = 0
  private uploading = false
  private listeners = new Set<() => void>()
  private state = { status: 'Not prepared', busy: false, prepared: false, signedIn: false, logoutPending: false, error: '' }
  private readonly config: IsolatedNativeConfig | null
  private readonly create: typeof createIsolatedNativeSync
  constructor(config: IsolatedNativeConfig | null, create = createIsolatedNativeSync) { this.config = config; this.create = create }
  snapshot = () => this.state
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  get configured() { return !!this.config }
  private publish(patch: Partial<typeof this.state>) { this.state = { ...this.state, ...patch }; this.listeners.forEach(fn => fn()) }
  /** One explicit app button reuses the same manual preparation/account/sync steps. */
  async upload() {
    if (!this.config || this.uploading || this.state.busy || this.pendingLogout) return
    this.uploading = true
    const generation = this.generation
    try {
      if (!this.state.prepared) await this.run('prepare')
      if (generation !== this.generation || !this.state.prepared) return
      if (!this.state.signedIn) await this.run('restore')
      if (generation !== this.generation || !this.state.signedIn) return
      await this.run('retry') // Same checkpoint; never requests a replacement intent.
    } finally { this.uploading = false }
  }
  async run(action: Action) {
    if (!this.config || this.state.busy || this.pendingLogout || (action !== 'prepare' && !this.handle)) return
    const generation = this.generation
    this.publish({ busy: true, error: '', status: action === 'sync' || action === 'retry' ? 'Syncing synthetic telemetry' : 'Working' })
    try {
      if (action === 'prepare') {
        const handle = await this.create(this.config)
        if (generation !== this.generation) { handle.stop(); return }
        this.handle?.stop(); this.handle = handle
        this.publish({ prepared: true, status: 'Prepared — no request sent' })
      } else if (action === 'restore' || action === 'signIn') {
        await this.handle!.account[action]()
        if (generation !== this.generation) return
        this.publish({ status: this.handle!.account.snapshot().status === 'signed_in' ? 'Signed in' : 'Signed out' })
      } else {
        const result = await this.handle!.sync(action === 'retry' ? { retry: true } : {})
        if (generation !== this.generation) return
        this.publish({ status: result.status === 'accepted' ? 'Synthetic upload accepted — not analysis completion' : 'Synthetic upload unresolved', error: result.error ? safeCode(result.error) : '' })
      }
    } catch (error) {
      if (generation === this.generation) this.publish({ status: 'Action failed', error: error instanceof AuthError || error instanceof SyncError ? safeCode(error.code) : 'unavailable' })
    } finally {
      if (generation === this.generation) this.publish({ busy: false, signedIn: this.handle?.account.snapshot().status === 'signed_in' })
    }
  }
  stop = () => {
    ++this.generation; this.handle?.stop(); this.handle = undefined
    this.publish({ status: 'Stopped — submitted server work may still complete', busy: false, prepared: false, signedIn: false, error: '' })
  }
  async logout() {
    const account = this.pendingLogout ?? this.handle?.account
    if (!account) return
    this.stop()
    this.pendingLogout = account
    const generation = this.generation
    this.publish({ busy: true, logoutPending: true })
    try { await account.logout(); this.pendingLogout = undefined; this.publish({ logoutPending: false }); if (generation === this.generation) this.publish({ status: 'Signed out locally' }) }
    catch { if (generation === this.generation) this.publish({ status: 'Logout not confirmed — retry logout', error: 'storage_unavailable' }) }
    finally { if (generation === this.generation) this.publish({ busy: false }) }
  }
}
