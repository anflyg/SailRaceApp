import { describe, expect, it } from 'vitest'
import { createArtifact } from './artifact'
import { createMockWorker, syntheticOwner, syntheticSession } from './mockWorker'
import { syntheticRace } from './syntheticRace'
import { WorkerClient } from './workerClient'

describe('synthetic Worker owner binding', () => {
  it('directly denies another bearer on the first owner intent/race, including after snapshot restore', async () => {
    const other = '10000000-0000-4000-8000-000000000072'
    const authenticate = async (header: string) => header === `Bearer ${syntheticSession.accessToken}` ? syntheticOwner : header === 'Bearer synthetic-other' ? other : null
    const worker = createMockWorker(Date.now, undefined, authenticate)
    const api = new WorkerClient(worker.transport, { current: async () => syntheticSession })
    const intent = await api.issue(syntheticOwner), raceId = await api.create(syntheticOwner, intent)
    const artifact = await createArtifact(syntheticRace, raceId)
    await api.prepare(syntheticOwner, artifact)
    for (const target of [worker, createMockWorker(Date.now, worker.snapshot(), authenticate)]) {
      const before = target.snapshot()
      const send = (path: string, body: object | Uint8Array, method: 'POST' | 'PUT' = 'POST') => target.transport.request({
        path, method, body: body instanceof Uint8Array ? body : JSON.stringify(body),
        headers: { Authorization: 'Bearer synthetic-other', 'Content-Type': method === 'PUT' ? 'application/gzip' : 'application/json', 'Content-Length': String(artifact.bytes.length) },
      })
      // Direct transport bypasses the client's owner/checkpoint checks.
      const creation = await send('/v1/races', { creationIntent: intent.creationIntent })
      expect(creation.status).toBe(400); expect(JSON.parse(creation.body).code).toBe('invalid_request')
      for (const [suffix, body, method] of [
        ['', artifact.prepare, 'POST'], ['/content', artifact.bytes, 'PUT'],
        ['/finalize', { rawFormatVersion: 1, rawSha256: artifact.prepare.rawSha256 }, 'POST'],
      ] as const) {
        const response = await send(`/v1/races/${raceId}/upload${suffix}`, body, method)
        expect(response.status).toBe(404); expect(JSON.parse(response.body).code).toBe('upload_not_found')
      }
      expect(target.snapshot()).toEqual(before)
      expect(JSON.stringify(target.requests)).not.toContain('synthetic-other')
    }
    await api.content(syntheticOwner, artifact); await api.finalize(syntheticOwner, artifact)
    expect(worker.races.get(raceId)?.accepted).toBe(true)
  })
})
