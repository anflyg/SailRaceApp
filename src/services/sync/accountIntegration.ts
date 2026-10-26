import { RaceSyncCoordinator, type SyncDependencies } from './coordinator'
import { syntheticRace } from './syntheticRace'
import { SyncError, type SessionProvider, type WorkerTransport } from './types'
import { WorkerClient } from './workerClient'

type SyntheticAccountSync = Pick<SyncDependencies, 'store' | 'activeRace' | 'online' | 'now' | 'sleep' | 'random'> & {
  session: SessionProvider
  transport: WorkerTransport
}

/** Explicit synthetic integration only. No native Auth setup, network transport,
 * user-race lookup or startup/background sync is installed by this composition. */
export function createSyntheticAccountSync(options: SyntheticAccountSync) {
  if (options.store.mode !== 'mock' || options.transport.mode !== 'mock') throw new SyncError('transport_unavailable')
  const race = structuredClone(syntheticRace)
  return new RaceSyncCoordinator({
    ...options,
    api: new WorkerClient(options.transport, options.session),
    race: id => id === race.id ? race : null,
  })
}
