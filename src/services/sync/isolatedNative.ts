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
  purpose: 'synthetic-nonproduction'
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

/** No shipped caller. Explicit future approved test only; creation does no Auth,
 * filesystem or HTTP work. There is no user-race argument or automatic sync. */
export async function createIsolatedNativeSync(config: IsolatedNativeConfig, runtime = nativeRuntime) {
  const auth = publicAuthConfig(config?.auth?.url, config?.auth?.publishableKey)
  const configured = runtime.configuredAuth()
  if (runtime.platform() !== 'ios' || config?.purpose !== 'synthetic-nonproduction' || !auth || !configured
    || auth.url !== configured.url || auth.publishableKey !== configured.publishableKey
    || !config.workerOrigin || config.workerOrigin !== config.approvedWorkerOrigin) throw new SyncError('transport_unavailable')
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
    label: 'SYNTHETIC NATIVE WORKER TEST — NONPRODUCTION' as const,
    account, // The same native singleton; no separate Auth credential store/provider.
    sync: (options: SyncOptions = {}) => { live(); return coordinator.sync(race.id, options) },
    read: () => { live(); return coordinator.read(race.id) },
    removeLocalArtifact: () => { live(); return coordinator.removeLocalArtifact(race.id) },
    // Stops later phases/admission, not a submitted native HTTP request or server work.
    stop: () => { stopped = true },
  }
}
