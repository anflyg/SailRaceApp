import type { PrivateFiles } from './storage'
import { SyncError, record, uuid } from './types'

/** A separate synthetic test, never a reset of a local-to-cloud association. */
export function syntheticTestSelection(files: PrivateFiles, key: string, legacyId: string) {
  return {
    async current(ownerId: string) {
      let text: string | null
      try { text = await files.read(key) } catch { throw new SyncError('storage_unavailable') }
      if (text === null) return legacyId
      let value: unknown
      try { if (text.length > 512) throw new Error(); value = JSON.parse(text) }
      catch { throw new SyncError('storage_unavailable') }
      if (!record(value) || Object.keys(value).sort().join() !== 'localRaceId,ownerId,version' || value.version !== 1
        || typeof value.ownerId !== 'string' || !uuid.test(value.ownerId)
        || typeof value.localRaceId !== 'string' || !/^synthetic-test-[0-9a-f-]{36}$/.test(value.localRaceId)
        || !uuid.test(value.localRaceId.slice('synthetic-test-'.length))) throw new SyncError('storage_unavailable')
      if (value.ownerId !== ownerId) throw new SyncError('account_changed')
      return value.localRaceId
    },
    async start(ownerId: string) {
      const localRaceId = `synthetic-test-${crypto.randomUUID()}`
      try { await files.write(key, JSON.stringify({ version: 1, ownerId, localRaceId })) }
      catch { throw new SyncError('storage_unavailable') }
      return localRaceId
    },
  }
}
