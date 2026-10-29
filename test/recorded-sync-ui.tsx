// Local browser-test fixture only; never imported by a shipped entry point.
import { createRoot } from 'react-dom/client'
import { LanguageProvider } from '../src/i18n/LanguageContext'
import { RaceLibrary } from '../src/components/RaceLibrary'
import { createRace, getRace } from '../src/services/raceStorage'
import type { AccountSession, AccountSnapshot } from '../src/services/auth/types'
import { createRecordedRaceSync } from '../src/services/sync/recordedRaceSync'
import { existingAuthOrigin, type NativeSyncRuntime } from '../src/services/sync/nativeRuntime'
import { createMockWorker, syntheticOwner } from '../src/services/sync/mockWorker'
import { syntheticRace } from '../src/services/sync/syntheticRace'
import { createSyncStore } from '../src/services/sync/storage'
import { unbase64 } from '../src/services/sync/artifact'
import type { WireRequest } from '../src/services/sync/types'

export function mountRecordedSyncFixture() {
  const race = createRace({ ...syntheticRace, name: 'Local fixture to upload' })
  const untouched = createRace({ ...syntheticRace, name: 'Local fixture to retain' })
  const original = JSON.stringify([getRace(race.id), getRace(untouched.id)])
  const values = new Map<string, string>(), listeners = new Set<() => void>()
  let snapshot: AccountSnapshot = { status: 'signed_out' }, active = false, disabled = true, loss = false
  let time = Date.parse('2026-10-29T12:00:00Z')
  const account: AccountSession = {
    snapshot: () => snapshot, subscribe: fn => { listeners.add(fn); return () => { listeners.delete(fn) } },
    current: async () => snapshot.ownerId ? { ownerId: snapshot.ownerId, accessToken: 'fictional-ui-access' } : null,
    restore: async () => {}, signIn: async () => {}, logout: async () => setOwner(undefined),
  }
  const setOwner = (ownerId: string | undefined) => {
    snapshot = ownerId ? { status: 'signed_in', ownerId } : { status: 'signed_out' }
    listeners.forEach(fn => fn())
  }
  const files = { read: async (key: string) => values.get(key) ?? null, write: async (key: string, value: string) => { values.set(key, value) },
    remove: async (key: string) => { values.delete(key) } }
  const worker = createMockWorker(() => time, undefined, async () => snapshot.ownerId ?? null)
  let requests = 0
  const runtime: NativeSyncRuntime = {
    platform: () => 'ios', configuredAuth: () => ({ url: existingAuthOrigin, publishableKey: 'sb_publishable_fictional_browser_fixture' }),
    account: () => account, files: () => files, activeRace: () => active ? 'recording-another-race' : null,
    online: () => true, now: () => time, random: () => 0, sleep: async ms => { time += ms },
    request: async options => {
      requests++
      if (disabled) return { status: 404, headers: {}, data: '{"error":"not_found"}', url: options.url }
      const wire: WireRequest = { path: new URL(options.url).pathname, method: options.method as WireRequest['method'], headers: options.headers!,
        body: options.dataType === 'file' ? unbase64(options.data) : options.data }
      const result = await worker.transport.request(wire)
      if (loss && wire.method === 'PUT') throw new Error('fictional lost content response')
      return { status: result.status, headers: result.headers, data: result.body, url: options.url }
    },
  }
  const { coordinator } = createRecordedRaceSync(runtime)!
  const container = document.createElement('div'); container.id = 'recorded-sync-fixture'; document.body.append(container)
  const root = createRoot(container)
  const render = () => root.render(<LanguageProvider language="sv" setLanguage={() => {}}>
    <RaceLibrary groups={[{ day: { id: race.dayId, date: race.dayId, raceIds: [race.id, untouched.id] }, races: [race, untouched] }]}
      selectedRaceId={null} onSelectRace={() => {}} onDeleteRace={() => {}} onRenameRace={() => {}}
      onToggleFavorite={() => {}} onExportRace={() => {}} syncCoordinator={coordinator} syncAccount={account} recordingActive={active}/>
  </LanguageProvider>)
  render()
  return {
    signIn: () => setOwner(syntheticOwner), signOut: () => setOwner(undefined),
    recording: (value: boolean) => { active = value; render() }, enable: () => { disabled = false },
    loseContent: (value: boolean) => { loss = value; time += 10000 }, requests: () => requests,
    state: () => createSyncStore(files, 'worker').state(race.id),
    unchanged: () => JSON.stringify([getRace(race.id), getRace(untouched.id)]) === original,
    stop: () => { root.unmount(); container.remove() },
  }
}
