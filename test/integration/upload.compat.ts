// Opt-in cross-repository test: real API handlers; synthetic injected boundaries.
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Ajv2020 from 'ajv/dist/2020.js'
import { gunzipSync, strFromU8 } from 'fflate'
import { createApp, type AppDependencies } from '@upload-api/src/index'
import { createCloudRaceIdentity, type CloudRaceIdentityRepository } from '@upload-api/src/cloud-race-identity'
import { canonicalObjectKey, RaceUploadError, raceUploadStatus, RACE_UPLOAD_LIMITS, type RaceUploadRepository, type RaceUploadReservation, type AcceptedRace } from '@upload-api/src/race-upload'
import { FencedRawContentAdapter } from '@upload-api/src/raw-object-fencing'
import { ModelFenceRepository, ModelRawStore } from '@upload-api/test/helpers/raw-fence-model'
import { WorkerClient } from '../../src/services/sync/workerClient'
import { createSyntheticAccountSync } from '../../src/services/sync/accountIntegration'
import { createArtifact, digest } from '../../src/services/sync/artifact'
import { createSyncStore } from '../../src/services/sync/storage'
import { memoryFiles } from '../../src/services/sync/testSupport'
import { syntheticRace } from '../../src/services/sync/syntheticRace'
import { LIMITS, type WireRequest, type WorkerTransport } from '../../src/services/sync/types'

const owner = '10000000-0000-4000-8000-000000000091'
const cloud = '20000000-0000-4000-8000-000000000091'
const contractCommit = '52d4a155f2bf324acf4f6f42baa766d672c5391e'
function contract(path: string) {
  return execFileSync('git', ['-C', process.env.TACKWISE_CONTRACTS_PATH!, 'show', `${contractCommit}:${path}`], { encoding: 'utf8' })
}
const schema = JSON.parse(contract('schemas/race-upload-v1.schema.json'))
const errorSchema = JSON.parse(contract('schemas/error-v1.schema.json'))
const ajv = new Ajv2020({ strict: true })
ajv.addSchema(schema)
const validate = (definition: string, value: unknown) => expect(ajv.validate({ $ref: `${schema.$id}#/$defs/${definition}` }, value), JSON.stringify(ajv.errors)).toBe(true)

function harness() {
  const now = () => new Date('2026-10-25T12:00:00Z')
  let reservation: RaceUploadReservation | null = null, accepted: AcceptedRace | null = null
  let fence: ModelFenceRepository | undefined, storage: ModelRawStore | undefined, adapter: FencedRawContentAdapter | undefined
  let created = false
  // Same narrow repository seams as API test/race-upload-endpoints.test.ts and
  // test/cloud-race-identity.test.ts, with only state needed for sequential retries.
  const identity: CloudRaceIdentityRepository = {
    admitIssuance: vi.fn(async () => {}),
    create: vi.fn(async claims => { expect(claims.ownerId).toBe(owner); const result = { raceId: cloud, created: !created }; created = true; return result }),
  }
  const repository: RaceUploadRepository = {
    findAcceptedRace: vi.fn(async () => accepted), findReservation: vi.fn(async () => reservation),
    createReservation: vi.fn(async input => {
      reservation = { ...input, createdAt: now().toISOString(), expiresAt: new Date(+now() + 86400000).toISOString() }
      fence = new ModelFenceRepository(reservation); storage = new ModelRawStore(); adapter = new FencedRawContentAdapter(fence, () => storage!)
      return reservation
    }),
    beginContentWrite: vi.fn(async userId => { expect(userId).toBe(owner); return { leaseToken: crypto.randomUUID() } }),
    finishContentWrite: vi.fn(async () => {}),
    acceptRace: vi.fn(async input => { accepted = { ...input }; return { raceId: cloud, uploadState: 'accepted', syncState: 'uploaded', consumedFreeRace: true } }),
  }
  const logs: unknown[] = []
  const dependencies: AppDependencies = {
    raceUploadsEnabled: true,
    authenticate: vi.fn(async token => token === 'synthetic-access' ? { userId: owner } : null),
    getEntitlement: vi.fn(async () => ({ plan: 'free', accessSource: 'free', status: 'active', validUntil: null, freeRacesUsed: 0 })),
    cloudRaceIdentity: createCloudRaceIdentity(identity, () => JSON.stringify({ activeKeyId: 'key1', keys: { key1: btoa('a'.repeat(32)).replace(/=/g, '') } }), now),
    raceUploadRepository: repository,
    contentStorage: { storeValidated: (...args) => adapter!.storeValidated(...args) },
    contentVerifier: { verify: input => adapter!.verify(input) },
    now, requestId: () => 'synthetic-request', log: event => logs.push(event),
  }
  const app = createApp(dependencies)
  const trace: Array<{ path: string; status: number; body: string }> = []
  const requests: WireRequest[] = []
  const dispatch = async (wire: WireRequest) => {
    expect(wire.headers.Authorization).toBe('Bearer synthetic-access')
    if (wire.method === 'PUT') {
      expect(wire.headers['Content-Type']).toBe('application/gzip')
      expect(wire.headers['Content-Length']).toBe(String(wire.body.length))
      expect(wire.headers['Content-Encoding']).toBeUndefined()
    } else expect(wire.headers['Content-Type']).toBe('application/json')
    requests.push(wire)
    // Request is passed in-process. The reserved .invalid URL is never fetched.
    const result = await app.fetch(new Request(`https://synthetic.invalid${wire.path}`, {
      method: wire.method, headers: wire.headers,
      body: wire.body instanceof Uint8Array ? Uint8Array.from(wire.body).buffer : wire.body,
    }))
    const body = await result.text()
    trace.push({ path: wire.path, status: result.status, body })
    if (wire.path.endsWith('/upload')) {
      validate('prepareRequest', JSON.parse(wire.body as string))
      if (result.ok) validate('prepareResponse', JSON.parse(body))
    } else if (wire.path.endsWith('/finalize')) {
      validate('finalizeRequest', JSON.parse(wire.body as string))
      if (result.ok) validate('finalizeResponse', JSON.parse(body))
    }
    if (!result.ok && dependencies.raceUploadsEnabled) expect(ajv.validate(errorSchema, JSON.parse(body))).toBe(true)
    return { status: result.status, headers: Object.fromEntries(result.headers), body }
  }
  const transport: WorkerTransport = { mode: 'mock', request: dispatch }
  const sessions = { current: vi.fn(async (_refresh?: boolean) => ({ ownerId: owner, accessToken: 'synthetic-access' })) }
  const api = new WorkerClient(transport, sessions)
  return { app, dependencies, repository, identity, logs, requests, trace, api, transport, sessions, dispatch,
    stored: () => storage!, fence: () => fence!, reservation: () => reservation!, now }
}
beforeEach(() => vi.stubGlobal('fetch', vi.fn(() => { throw new Error('network forbidden') })))
afterEach(() => vi.unstubAllGlobals())
describe('recorded-sync client → merged API → accepted upload contracts', () => {
  it('keeps the client snapshots and API limits identical to the authoritative contract', () => {
    for (const file of ['raw-race-v1.schema.json', 'race-upload-v1.schema.json', 'content-put-v1.json']) {
      expect(readFileSync(new URL(`../../src/services/sync/contracts/${file}`, import.meta.url), 'utf8')).toBe(contract(`schemas/${file}`))
    }
    expect(LIMITS).toEqual(RACE_UPLOAD_LIMITS)
    // Reuse the backend's existing synthetic fixture, rather than inventing raw data.
    const backendFixture = readFileSync(`${process.env.TACKWISE_API_PATH}/test/fixtures/analysis-v1/minimal-raw-race-v1.json`, 'utf8')
    expect(backendFixture).toBe(contract('test/fixtures/valid/minimal-raw-race-v1.json'))
    expect(ajv.validate(JSON.parse(contract('schemas/raw-race-v1.schema.json')), JSON.parse(backendFixture))).toBe(true)
    for (const name of ['prepare-request', 'finalize-request', 'prepared-response', 'accepted-response']) {
      validate(({ 'prepare-request': 'prepareRequest', 'finalize-request': 'finalizeRequest', 'prepared-response': 'preparedResponse', 'accepted-response': 'acceptedResponse' })[name]!, JSON.parse(contract(`test/fixtures/api/${name}.json`)))
    }
  })
  it('completes the five-endpoint coordinator flow with real HMAC/validation/fenced content and no fetch', async () => {
    const fetch = vi.fn(() => { throw new Error('network forbidden') }); vi.stubGlobal('fetch', fetch)
    const h = harness(), memory = memoryFiles(), store = createSyncStore(memory.files, 'mock')
    const coordinator = createSyntheticAccountSync({ session: h.sessions, transport: h.transport, store,
      activeRace: () => null, online: () => true, now: () => +h.now(), sleep: async () => {}, random: () => 0 })
    expect((await coordinator.sync(syntheticRace.id))).toMatchObject({ status: 'accepted', ownerId: owner, cloudRaceId: cloud })
    expect(h.trace.map(r => r.status)).toEqual([201, 201, 201, 204, 200])
    const artifact = (await store.artifact(syntheticRace.id))!
    expect(h.stored().object!.bytes).toEqual(artifact.bytes)
    expect(await digest(h.stored().object!.bytes)).toBe(artifact.prepare.rawSha256)
    const raw = JSON.parse(strFromU8(gunzipSync(artifact.bytes)))
    expect(raw.raceId).toBe(cloud); expect(raw).not.toHaveProperty('userId')
    expect(h.reservation()).toMatchObject({ userId: owner, rawObjectKey: canonicalObjectKey(owner, cloud, 1, artifact.prepare.rawSha256) })
    expect(h.repository.acceptRace).toHaveBeenCalledOnce()
    expect(JSON.stringify(h.logs) + [...memory.values.values()].join('')).not.toContain('synthetic-access')
    expect(fetch).not.toHaveBeenCalled()
  })
  it('retries identical create/prepare/content/finalize without a new identity or payload write', async () => {
    const h = harness(), intent = await h.api.issue(owner)
    expect(await h.api.create(owner, intent)).toBe(cloud)
    expect(await h.api.create(owner, intent)).toBe(cloud)
    const artifact = await createArtifact(syntheticRace, cloud)
    await h.api.prepare(owner, artifact); await h.api.prepare(owner, artifact)
    await h.api.content(owner, artifact); await h.api.content(owner, artifact)
    await h.api.finalize(owner, artifact); await h.api.finalize(owner, artifact)
    expect(await h.api.prepare(owner, artifact)).toBe('accepted')
    expect(h.trace.map(r => r.status)).toEqual([201,201,200,201,200,204,204,200,200,200])
    expect(h.repository.createReservation).toHaveBeenCalledOnce(); expect(h.repository.acceptRace).toHaveBeenCalledOnce()
    expect(h.stored().calls.filter(x => x.startsWith('payload:'))).toHaveLength(1)
    expect(h.stored().object!.bytes).toEqual(artifact.bytes)
    await expect(h.api.content(owner, artifact)).rejects.toThrow('race_conflict') // accepted content is closed
  })
  it('preserves each backend safe-error status/category through the client (one refresh for 401)', async () => {
    const h = harness()
    for (const code of errorSchema.properties.code.enum) {
      const before = h.trace.length
      h.sessions.current.mockClear()
      h.dependencies.cloudRaceIdentity!.issue = async () => { throw new RaceUploadError(code) }
      await expect(h.api.issue(owner)).rejects.toThrow(code)
      const last = h.trace.at(-1)!
      expect(last.status).toBe(raceUploadStatus(code))
      expect(h.trace.length - before).toBe(code === 'unauthorized' ? 2 : 1)
      expect(h.sessions.current.mock.calls.filter(([refresh]) => refresh)).toHaveLength(code === 'unauthorized' ? 1 : 0)
      expect(JSON.parse(last.body)).toEqual({ code, requestId: 'synthetic-request' })
    }
  })
  it('recognizes only the exact disabled backend gate envelope', async () => {
    const h = harness(); h.dependencies.raceUploadsEnabled = false
    await expect(h.api.issue(owner)).rejects.toThrow('uploads_disabled')
    expect(h.trace).toHaveLength(1)
    expect(h.trace[0].status).toBe(404)
    expect(JSON.parse(h.trace[0].body)).toEqual({ error: 'not_found' })
    expect(h.identity.admitIssuance).not.toHaveBeenCalled()
  })

})
