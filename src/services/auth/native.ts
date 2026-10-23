import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { NativeAccountSession } from './session'
import { nativeAuthFetch, publicAuthConfig, supabaseAdapter } from './supabase'
import { AuthError, type AccountSession, type AppleCredential, type VaultEnvelope } from './types'

interface NativeAuthBridge {
  signIn(): Promise<AppleCredential>
  credentialState(options: { appleUser: string }): Promise<{ state: 'authorized' | 'revoked' | 'unknown' }>
  readSession(): Promise<VaultEnvelope>
  writeSession(options: { revision: string; value: string }): Promise<void>
  clearSession(): Promise<VaultEnvelope>
  addListener(event: 'revoked', listener: () => void): Promise<PluginListenerHandle>
}
const bridge = registerPlugin<NativeAuthBridge>('TackWiseAuth')
async function safe<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation() } catch (error) {
    const code = (error as { code?: string })?.code
    throw new AuthError(code === 'cancelled' || code === 'busy' || code === 'invalid_credentials' || code === 'storage_unavailable' || code === 'stale_session' ? code : 'unavailable')
  }
}
let singleton: AccountSession | null | undefined
export function accountSession(): AccountSession | null {
  if (singleton !== undefined) return singleton
  const config = publicAuthConfig(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)
  if (Capacitor.getPlatform() !== 'ios' || !Capacitor.isPluginAvailable('TackWiseAuth') || !config) return singleton = null
  const session = new NativeAccountSession({
    signIn: () => safe(() => bridge.signIn()),
    credentialState: user => safe(async () => (await bridge.credentialState({ appleUser: user })).state),
  }, supabaseAdapter(config, nativeAuthFetch(config.url)), {
    read: () => safe(() => bridge.readSession()), write: (revision, value) => safe(() => bridge.writeSession({ revision, value })),
    clear: () => safe(() => bridge.clearSession()),
  }, config.url, () => navigator.onLine && document.visibilityState === 'visible')
  void bridge.addListener('revoked', () => { void session.logout().catch(() => {}) }).catch(() => {})
  return singleton = session
}
