import Ajv2020 from 'ajv/dist/2020.js'
import { gzipSync, strToU8 } from 'fflate'
import type { Race } from '../../types'
import { calculateRaceSummary } from '../raceStorage'
import schema from './contracts/raw-race-v1.schema.json'
import apiSchema from './contracts/race-upload-v1.schema.json'
import { LIMITS, SyncError, record, type Artifact } from './types'

const ajv = new Ajv2020({ strict: true, allErrors: false })
export const validateRaw = ajv.compile(schema)
const validateLocal = ajv.compile({...schema, $id: undefined, required: schema.required.filter(k=>k!=='raceId')})
ajv.addSchema(apiSchema)
export const validatePrepare = ajv.compile({ $ref: `${apiSchema.$id}#/$defs/prepareRequest` })
export const validatePrepared = ajv.compile({ $ref: `${apiSchema.$id}#/$defs/preparedResponse` })
export const validateAccepted = ajv.compile({ $ref: `${apiSchema.$id}#/$defs/acceptedResponse` })
export async function digest(bytes: Uint8Array): Promise<string> {
  if(!globalThis.crypto?.subtle)throw new SyncError('transport_unavailable')
  const hash = await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes).buffer)
  return Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, '0')).join('')
}
export function timestamp(value: unknown): number {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$/.test(value)) throw new SyncError('invalid_race_payload')
  const time = Date.parse(value)
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0,19) !== value.slice(0,19)) throw new SyncError('invalid_race_payload')
  return time
}
function pick(value: unknown, keys: string[]): Record<string, unknown> {
  if (!record(value)) throw new SyncError('invalid_race_payload')
  return Object.fromEntries(keys.filter(k => value[k] !== undefined).map(k => [k, value[k]]))
}
export function rawRace(race: Race, cloudRaceId?: string): Record<string, unknown> {
  if (!race.endTime || !Array.isArray(race.samples) || !Array.isArray(race.events)) throw new SyncError('invalid_race_payload')
  if (race.samples.length > LIMITS.samples || race.events.length > LIMITS.events) throw new SyncError('payload_too_large')
  const raw: Record<string, unknown> = { rawFormatVersion: 1, ...(cloudRaceId?{raceId: cloudRaceId}:{}),
    recordingStartedAt: race.createdAt, endedAt: race.endTime,
    samples: race.samples.map(s => pick(s, Object.keys(schema.$defs.sample.properties))),
    events: race.events.map(e => pick(e, Object.keys(schema.$defs.laylineTackEvent.properties))) }
  if (race.startGunTime !== undefined) raw.startGunAt = race.startGunTime
  if (race.course !== undefined) {
    const course = pick(race.course, Object.keys(schema.$defs.course.properties))
    for (const key of ['windwardMark', 'leewardMark']) if (course[key] !== undefined) course[key] = pick(course[key], ['latitude','longitude'])
    if (course.startLine !== undefined) {
      const line = pick(course.startLine, ['port','starboard'])
      for (const key of ['port','starboard']) if (line[key] !== undefined) line[key] = pick(line[key], ['latitude','longitude'])
      course.startLine = line
    }
    raw.course = course
  }
  if (!(cloudRaceId?validateRaw(raw):validateLocal(raw))) throw new SyncError('invalid_race_payload')
  const start = timestamp(raw.recordingStartedAt), end = timestamp(raw.endedAt)
  if (start > end || (raw.startGunAt !== undefined && (timestamp(raw.startGunAt) < start || timestamp(raw.startGunAt) > end))) throw new SyncError('invalid_race_payload')
  for (const collection of [raw.samples, raw.events]) {
    let previous = start
    for (const item of collection as Record<string, unknown>[]) {
      const time = timestamp(item.timestamp)
      if (time < previous || time > end) throw new SyncError('invalid_race_payload')
      previous = time
    }
  }
  return raw
}
export async function createArtifact(race: Race, cloudRaceId: string): Promise<Artifact> {
  const raw = rawRace(race, cloudRaceId)
  const json = strToU8(JSON.stringify(raw))
  if (json.length > LIMITS.expandedBytes) throw new SyncError('payload_too_large')
  const bytes = gzipSync(json, { level: 9, mtime: 0 })
  if (bytes.length > LIMITS.compressedBytes) throw new SyncError('payload_too_large')
  // Existing local summary logic derives these only from recorded timestamps/GPS.
  const summary = calculateRaceSummary(race)
  const prepare = { rawFormatVersion: 1 as const, rawSha256: await digest(bytes), compressedBytes: bytes.length,
    startedAt: race.createdAt, endedAt: race.endTime!, durationSeconds: summary.durationSeconds!, distanceMeters: summary.distanceMeters! }
  if (!validatePrepare(prepare)) throw new SyncError('invalid_race_payload')
  return { bytes, prepare, cloudRaceId }
}
export async function verifyArtifact(a: Artifact, cloudRaceId: string, expected?: Artifact['prepare']): Promise<void> {
  if (a.cloudRaceId !== cloudRaceId || !validatePrepare(a.prepare) || a.bytes.length !== a.prepare.compressedBytes
    || await digest(a.bytes) !== a.prepare.rawSha256 || (expected && JSON.stringify(expected) !== JSON.stringify(a.prepare))) throw new SyncError('artifact_missing')
}
export function base64(bytes: Uint8Array): string {
  let text = ''; for (let i=0;i<bytes.length;i+=8192) text += String.fromCharCode(...bytes.subarray(i,i+8192))
  return btoa(text)
}
export function unbase64(text: string): Uint8Array { const b = atob(text); return Uint8Array.from(b, c => c.charCodeAt(0)) }

export function validateCompletedRace(race: Race): void {
  rawRace(race)
  const summary=calculateRaceSummary(race)
  if(!Number.isInteger(summary.durationSeconds)||summary.durationSeconds!<0||!Number.isFinite(summary.distanceMeters)||summary.distanceMeters!<0)throw new SyncError('invalid_race_payload')
}
