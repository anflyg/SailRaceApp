import type { SessionProvider } from '../sync/types'
export type AuthCode = 'cancelled' | 'offline' | 'unavailable' | 'invalid_credentials' | 'storage_unavailable' | 'busy' | 'stale_session' | 'configuration_missing'
export class AuthError extends Error { readonly code: AuthCode; constructor(code: AuthCode) { super(code); this.name = 'AuthError'; this.code = code } }
export interface AppleCredential { identityToken: string; rawNonce: string; appleUser: string }
export interface AppleAdapter {
  signIn(): Promise<AppleCredential>
  credentialState(user: string): Promise<'authorized' | 'revoked' | 'unknown'>
}
export interface VaultEnvelope { revision: string; value: string | null }
export interface SessionVault {
  read(): Promise<VaultEnvelope>
  write(revision: string, value: string): Promise<void>
  clear(): Promise<VaultEnvelope>
}
export interface AuthTokens { ownerId: string; accessToken: string; refreshToken: string; expiresAt: number }
export interface SupabaseAdapter {
  exchange(credential: AppleCredential): Promise<AuthTokens>
  refresh(refreshToken: string): Promise<AuthTokens>
  verify(accessToken: string): Promise<string>
  revoke(accessToken: string): Promise<void>
}
export interface StoredSession extends AuthTokens { version: 1; project: string; appleUser: string }
export interface AccountSnapshot { status: 'signed_out' | 'restoring' | 'signing_in' | 'signed_in' | 'offline' | 'error'; ownerId?: string; error?: AuthCode }
export interface AccountSession extends SessionProvider {
  subscribe(listener: () => void): () => void
  snapshot(): AccountSnapshot
  restore(): Promise<void>
  signIn(): Promise<void>
  logout(): Promise<void>
}
