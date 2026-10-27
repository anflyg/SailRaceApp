import { Capacitor, CapacitorHttp, type HttpOptions, type HttpResponse } from '@capacitor/core'
import { accountSession } from '../auth/native'
import { publicAuthConfig, type PublicAuthConfig } from '../auth/supabase'
import type { AccountSession } from '../auth/types'
import { getActiveRaceId } from '../raceLogger'
import { RaceSyncCoordinator, type SyncOptions } from './coordinator'
import { createSyncStore, localKey, nativePrivateFiles, type PrivateFiles } from './storage'
import { syntheticRace } from './syntheticRace'
import { SyncError } from './types'
import { nativeWorkerTransport, WorkerClient } from './workerClient'

export interface IsolatedNativeConfig {
  purpose: 'synthetic-nonproduction' | 'synthetic-existing-backend'
  workerOrigin: string
  approvedWorkerOrigin: string
  auth: PublicAuthConfig
}
/** Existing adapters are injectable for local tests, never selected by a runtime flag. */
export interface IsolatedNativeRuntime {
  platform(): string
  configuredAuth(): PublicAuthConfig | null
  account(): AccountSession | null
  files(): PrivateFiles
  request(options: HttpOptions): Promise<HttpResponse>
  activeRace(): string | null
  online(): boolean
  now(): number
  sleep(ms: number): Promise<void>
  random(): number
}
const nativeRuntime: IsolatedNativeRuntime = {
  platform: () => Capacitor.getPlatform(),
  configuredAuth: () => publicAuthConfig(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY),
  account: accountSession, files: nativePrivateFiles, request: options => CapacitorHttp.request(options),
  activeRace: getActiveRaceId, online: () => navigator.onLine && document.visibilityState === 'visible',
  now: Date.now, sleep: ms => new Promise(resolve => setTimeout(resolve, ms)), random: Math.random,
}

export const existingWorkerOrigin = 'https://api.tackwise.se'

/** Fixed synthetic caller only; creation does no Auth,
 * filesystem or HTTP work. There is no user-race argument or automatic sync. */
export async function createIsolatedNativeSync(config: IsolatedNativeConfig, runtime = nativeRuntime) {
  const auth = publicAuthConfig(config?.auth?.url, config?.auth?.publishableKey)
  const configured = runtime.configuredAuth()
  const existingBackend = config?.purpose === 'synthetic-existing-backend'
  if (runtime.platform() !== 'ios' || (!existingBackend && config?.purpose !== 'synthetic-nonproduction') || !auth || !configured
    || auth.url !== configured.url || auth.publishableKey !== configured.publishableKey
    || !config.workerOrigin || config.workerOrigin !== config.approvedWorkerOrigin
    || (existingBackend && config.workerOrigin !== existingWorkerOrigin)) throw new SyncError('transport_unavailable')
  // The existing adapter rejects paths, credentials, ports normalized away by URL,
  // query/fragment/trailing slash and non-HTTPS origins before any native dispatch.
  const transport = nativeWorkerTransport(config.workerOrigin, runtime.request, runtime.platform)
  const account = runtime.account()
  if (!account) throw new SyncError('unauthorized')
  const race = structuredClone(syntheticRace)
  race.id = `isolated-native-v1-${await localKey(JSON.stringify([config.workerOrigin, auth.url]))}`
  const store = createSyncStore(runtime.files(), 'worker')
  let stopped = false
  const sessions = { async current(refresh = false) {
    if (stopped || !runtime.online()) return null
    const current = await account.current(refresh)
    return stopped || !runtime.online() ? null : current
  } }
  const coordinator = new RaceSyncCoordinator({
    store, api: new WorkerClient(transport, sessions), race: id => id === race.id ? race : null,
    activeRace: runtime.activeRace, online: runtime.online, now: runtime.now, sleep: runtime.sleep, random: runtime.random,
  })
  const live = () => { if (stopped) throw new SyncError('unauthorized') }
  return {
    label: existingBackend ? 'SYNTHETIC UPLOAD — EXISTING TACKWISE BACKEND' as const : 'SYNTHETIC NATIVE WORKER TEST — NONPRODUCTION' as const,
    account, // The same native singleton; no separate Auth credential store/provider.
    sync: async (options: SyncOptions = {}) => {
      live()
      if (existingBackend) {
        if (!runtime.online()) throw new SyncError('offline')
        if (runtime.activeRace() !== null) throw new SyncError('recording_active')
        const session = await sessions.current()
        if (!session) throw new SyncError('unauthorized')
        live()
        const saved = await coordinator.read(race.id)
        live()
        if (saved?.status === 'accepted') {
          if ((await sessions.current())?.ownerId !== session.ownerId) throw new SyncError('account_changed')
          live()
          return saved
        }
        // Token-free admission probe before persisting issuancePending. Disabled
        // routes return 404; enabled routes reject missing auth before DB/R2 work.
        let response
        try { response = await transport.request({ path: '/v1/race-creation-intents', method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }) }
        catch { throw new SyncError('upstream_unavailable') }
        live()
        if (!runtime.online()) throw new SyncError('offline')
        let body: unknown
        try {
          if (response.body.length > 8192) throw new Error()
          body = JSON.parse(response.body)
        } catch { throw new SyncError('upstream_unavailable') }
        if (response.status === 404 && typeof body === 'object' && body !== null && Object.keys(body).join() === 'error' && 'error' in body && body.error === 'not_found') throw new SyncError('uploads_disabled')
        if (response.status !== 401 || typeof body !== 'object' || body === null
          || Object.keys(body).sort().join() !== 'code,requestId' || !('code' in body) || body.code !== 'unauthorized'
          || !('requestId' in body) || typeof body.requestId !== 'string' || !body.requestId || body.requestId.length > 128) throw new SyncError('upstream_unavailable')
        if ((await sessions.current())?.ownerId !== session.ownerId) throw new SyncError('account_changed')
      }
      live()
      return coordinator.sync(race.id, options)
    },
    read: () => { live(); return coordinator.read(race.id) },
    removeLocalArtifact: () => { live(); return coordinator.removeLocalArtifact(race.id) },
    // Stops later phases/admission, not a submitted native HTTP request or server work.
    stop: () => { stopped = true },
  }
}
