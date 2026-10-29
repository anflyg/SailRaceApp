import { publicAuthConfig, type PublicAuthConfig } from '../auth/supabase'
import { RaceSyncCoordinator, type SyncOptions } from './coordinator'
import { verifyArtifact } from './artifact'
import { createSyncStore, localKey } from './storage'
import { existingWorkerOrigin, nativeSyncRuntime, type NativeSyncRuntime } from './nativeRuntime'
export { existingWorkerOrigin } from './nativeRuntime'
import { syntheticRace } from './syntheticRace'
import { SyncError } from './types'
import { syntheticTestSelection } from './syntheticTestSelection'
import { nativeWorkerTransport, WorkerClient } from './workerClient'

export interface IsolatedNativeConfig {
  purpose: 'synthetic-nonproduction' | 'synthetic-existing-backend'
  workerOrigin: string
  approvedWorkerOrigin: string
  auth: PublicAuthConfig
}
/** Existing adapters are injectable for local tests, never selected by a runtime flag. */
export type IsolatedNativeRuntime = NativeSyncRuntime

const activeTests = new Set<string>()

/** Fixed synthetic caller only; creation does no Auth,
 * filesystem or HTTP work. There is no user-race argument or automatic sync. */
export async function createIsolatedNativeSync(config: IsolatedNativeConfig, runtime = nativeSyncRuntime) {
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
  const legacyId = race.id
  const files = runtime.files()
  const store = createSyncStore(files, 'worker')
  const selection = syntheticTestSelection(files, `worker-${await localKey(`synthetic-selection-v1:${legacyId}`)}-state`, legacyId)
  let stopped = false
  const sessions = { async current(refresh = false) {
    if (stopped || !runtime.online()) return null
    const current = await account.current(refresh)
    return stopped || !runtime.online() ? null : current
  } }
  const api = new WorkerClient(transport, sessions)
  const coordinator = new RaceSyncCoordinator({
    store, api, race: id => id === race.id ? race : null,
    activeRace: runtime.activeRace, online: runtime.online, now: runtime.now, sleep: runtime.sleep, random: runtime.random,
  })
  const live = () => { if (stopped) throw new SyncError('unauthorized') }
  const select = async () => {
    if (existingBackend) {
      if (!runtime.online()) throw new SyncError('offline')
      if (runtime.activeRace() !== null) throw new SyncError('recording_active')
      race.id = await selection.current(await api.owner())
    }
    live()
  }
  const exclusive = async <T>(action: () => Promise<T>): Promise<T> => {
    if (activeTests.has(legacyId)) throw new SyncError('race_conflict')
    activeTests.add(legacyId)
    try { return await action() } finally { activeTests.delete(legacyId) }
  }
  return {
    label: existingBackend ? 'SYNTHETIC UPLOAD — EXISTING TACKWISE BACKEND' as const : 'SYNTHETIC NATIVE WORKER TEST — NONPRODUCTION' as const,
    account, // The same native singleton; no separate Auth credential store/provider.
    sync: (options: SyncOptions = {}) => exclusive(async () => {
      live()
      await select()
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
    }),
    /** User explicitly starts a DISTINCT fixture test after authoritative prepare expiry.
     * No old checkpoint/artifact, cloud UUID, lease or R2 state is changed. */
    newTest: () => exclusive(async () => {
      live()
      if (!existingBackend) throw new SyncError('invalid_request')
      await select()
      if (!runtime.online()) throw new SyncError('offline')
      if (runtime.activeRace() !== null) throw new SyncError('recording_active')
      const owner = await api.owner()
      const saved = await coordinator.read(race.id)
      if (!saved?.cloudRaceId || saved.status === 'accepted' || saved.issuancePending) throw new SyncError('race_conflict')
      const artifact = await store.artifact(race.id)
      if (!artifact || artifact.cloudRaceId !== saved.cloudRaceId) throw new SyncError('artifact_missing')
      await verifyArtifact(artifact, saved.cloudRaceId, saved.artifact)
      // A content-route 410 can also mean a busy lease. Only a fresh prepare
      // response can establish expiry; accepted, unknown and all other results stop.
      try { await api.prepare(owner, artifact); throw new SyncError('race_conflict') }
      catch (error) { if (!(error instanceof SyncError) || error.code !== 'upload_expired') throw error }
      live()
      if (!runtime.online()) throw new SyncError('offline')
      if (runtime.activeRace() !== null) throw new SyncError('recording_active')
      if (await api.owner() !== owner) throw new SyncError('account_changed')
      live()
      race.id = await selection.start(owner)
      live()
      // Selection only. The separate Upload button starts its first network work.
    }),
    read: async () => { live(); await select(); return coordinator.read(race.id) },
    removeLocalArtifact: () => exclusive(async () => { live(); await select(); return coordinator.removeLocalArtifact(race.id) }),
    // Stops later phases/admission, not a submitted native HTTP request or server work.
    stop: () => { stopped = true },
  }
}
