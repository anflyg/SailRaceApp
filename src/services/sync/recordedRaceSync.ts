import { getRace } from '../raceStorage'
import { publicAuthConfig } from '../auth/supabase'
import { RaceSyncCoordinator } from './coordinator'
import { existingAuthOrigin, existingWorkerOrigin, nativeSyncRuntime, type NativeSyncRuntime } from './nativeRuntime'
import { createSyncStore } from './storage'
import { SyncError } from './types'
import { nativeWorkerTransport, WorkerClient } from './workerClient'

/** Composition only: no restore, race lookup, filesystem read or request on creation.
 * The library's explicit action supplies a local ID to the existing coordinator. */
export function createRecordedRaceSync(runtime: NativeSyncRuntime = nativeSyncRuntime, race = getRace) {
  if (runtime.platform() !== 'ios') return null
  const configured = runtime.configuredAuth()
  const auth = publicAuthConfig(configured?.url, configured?.publishableKey)
  if (!auth || auth.url !== existingAuthOrigin) return null
  const account = runtime.account()
  if (!account) return null
  const admitted = () => {
    if (runtime.activeRace() !== null) throw new SyncError('recording_active')
    if (!runtime.online()) throw new SyncError('offline')
  }
  const transport = nativeWorkerTransport(existingWorkerOrigin, options => {
    // Recheck after asynchronous native credential work, immediately before dispatch.
    admitted()
    return runtime.request(options)
  }, runtime.platform)
  const sessions = { async current(refresh = false) {
    admitted()
    const session = await account.current(refresh)
    admitted()
    return session
  } }
  const coordinator = new RaceSyncCoordinator({
    store: createSyncStore(runtime.files(), 'worker'), api: new WorkerClient(transport, sessions),
    race, activeRace: runtime.activeRace, online: runtime.online, now: runtime.now,
    sleep: runtime.sleep, random: runtime.random,
  })
  return { coordinator, account }
}
