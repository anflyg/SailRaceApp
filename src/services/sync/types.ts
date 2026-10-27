export const LIMITS = { compressedBytes: 5242880, expandedBytes: 20971520, samples: 50000, events: 10000 } as const
export const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
export type SyncErrorCode = 'uploads_disabled' | 'invalid_request' | 'unauthorized' | 'cloud_access_unavailable' | 'upload_not_found' | 'race_conflict' | 'upload_expired' | 'payload_too_large' | 'unsupported_media_type' | 'invalid_race_payload' | 'rate_limited' | 'upstream_unavailable' | 'recording_active' | 'offline' | 'account_changed' | 'intent_expired' | 'issuance_uncertain' | 'artifact_missing' | 'storage_unavailable' | 'transport_unavailable'
export class SyncError extends Error {
  readonly code: SyncErrorCode
  readonly retryAfterMs: number
  constructor(code: SyncErrorCode, retryAfterMs = 0) { super(code); this.name = 'SyncError'; this.code = code; this.retryAfterMs = retryAfterMs }
}
export interface Session { ownerId: string; accessToken: string }
export interface SessionProvider { current(refresh?: boolean): Promise<Session | null> }
export interface PrepareRequest {
  rawFormatVersion: 1; rawSha256: string; compressedBytes: number; startedAt: string; endedAt: string; durationSeconds: number; distanceMeters: number
}
export interface Artifact { bytes: Uint8Array; prepare: PrepareRequest; cloudRaceId: string }
export interface Intent { creationIntent: string; issuedAt: string; expiresAt: string }
export type SyncStatus = 'recorded_local' | 'queued' | 'syncing' | 'blocked_entitlement' | 'invalid' | 'accepted'
export type SyncStep = 'issue' | 'create' | 'artifact' | 'prepare' | 'content' | 'finalize' | 'done'
export interface SyncState {
  version: 1; mode: 'mock' | 'worker'; localRaceId: string; ownerId: string
  status: SyncStatus; step: SyncStep; intent?: Intent; issuancePending?: boolean; cloudRaceId?: string
  artifactRef?: string; artifact?: PrepareRequest; attempts: number; nextAttemptAt?: number; error?: SyncErrorCode
  acceptedAt?: string
}
export interface SyncStore {
  readonly mode: 'mock' | 'worker'
  state(localRaceId: string): Promise<SyncState | null>
  save(state: SyncState): Promise<void>
  artifact(localRaceId: string): Promise<Artifact | null>
  saveArtifact(localRaceId: string, artifact: Artifact): Promise<void>
  removeArtifact(localRaceId: string): Promise<void>
}
export interface WireRequest { path: string; method: 'POST' | 'PUT'; headers: Record<string, string>; body: string | Uint8Array }
export interface WireResponse { status: number; headers: Record<string, string>; body: string }
export interface WorkerTransport { readonly mode: 'mock' | 'worker'; request(request: WireRequest): Promise<WireResponse> }
export function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value) }
