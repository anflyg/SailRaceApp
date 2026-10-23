import { AuthClient, type Session as SupabaseSession } from '@supabase/auth-js'
import { Capacitor, CapacitorHttp, type HttpOptions, type HttpResponse } from '@capacitor/core'
import { AuthError, type SupabaseAdapter } from './types'
import { checkTokens } from './session'

export interface PublicAuthConfig { url: string; publishableKey: string }
export function publicAuthConfig(url: unknown, key: unknown): PublicAuthConfig | null {
  try {
    if (typeof url !== 'string' || typeof key !== 'string') return null
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' || parsed.origin !== url || parsed.username || parsed.password) return null
    // Accept public publishable keys or legacy anon JWTs only. Never service-role/secret keys.
    if (!/^sb_publishable_[A-Za-z0-9_-]{16,256}$/.test(key)) {
      if (key.length > 4096 || key.split('.').length !== 3 || JSON.parse(atob(key.split('.')[1].replaceAll('-', '+').replaceAll('_', '/'))).role !== 'anon') return null
    }
    return { url, publishableKey: key }
  } catch { return null }
}

/** Auth-only native transport. No redirects, arbitrary URLs, cookies or Worker paths. */
export function nativeAuthFetch(origin: string, request: (options: HttpOptions) => Promise<HttpResponse> = CapacitorHttp.request, platform = () => Capacitor.getPlatform()): typeof fetch {
  return async (input, init) => {
    if (platform() !== 'ios') throw new AuthError('unavailable')
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const parsed = new URL(url)
    const method = init?.method ?? 'GET'
    const allowed = (method === 'POST' && parsed.pathname === '/auth/v1/token' && ['?grant_type=id_token', '?grant_type=refresh_token'].includes(parsed.search))
      || (method === 'GET' && parsed.pathname === '/auth/v1/user' && !parsed.search)
      || (method === 'POST' && parsed.pathname === '/auth/v1/logout' && parsed.search === '?scope=local')
    if (parsed.origin !== origin || parsed.username || parsed.password || parsed.hash || !allowed) throw new AuthError('unavailable')
    const headers = Object.fromEntries(new Headers(init?.headers).entries())
    let response: HttpResponse
    try {
      response = await request({ url, method, headers, data: init?.body, responseType: 'text',
        disableRedirects: true, connectTimeout: 15000, readTimeout: 15000 })
    } catch { throw new AuthError('unavailable') }
    if (response.url && response.url !== url) throw new AuthError('unavailable')
    if (response.status >= 300 && response.status < 400) throw new AuthError('unavailable')
    const body = typeof response.data === 'string' ? response.data : response.data == null ? '' : JSON.stringify(response.data)
    if (body.length > 65536) throw new AuthError('unavailable')
    return new Response(response.status === 204 ? null : body, { status: response.status, headers: response.headers })
  }
}

export function supabaseAdapter(config: PublicAuthConfig, transport: typeof fetch): SupabaseAdapter {
  if (!publicAuthConfig(config.url, config.publishableKey)) throw new AuthError('configuration_missing')
  const client = () => new AuthClient({ url: `${config.url}/auth/v1`, headers: { apikey: config.publishableKey },
    persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, debug: false,
    skipAutoInitialize: true, fetch: transport, storageKey: 'tackwise-auth-memory' })
  function failure(error: { status?: number } | null): never {
    throw new AuthError(error?.status && [400, 401, 403, 422].includes(error.status) ? 'invalid_credentials' : 'unavailable')
  }
  function tokens(session: SupabaseSession | null) {
    if (!session) throw new AuthError('invalid_credentials')
    return checkTokens({ ownerId: session.user.id, accessToken: session.access_token, refreshToken: session.refresh_token, expiresAt: (session.expires_at ?? 0) * 1000 })
  }
  return {
    async exchange(credential) {
      const auth = client()
      try {
        const { data, error } = await auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken, nonce: credential.rawNonce })
        if (error) failure(error)
        return tokens(data.session)
      } finally { await auth.dispose() }
    },
    async refresh(refreshToken) {
      const auth = client()
      try {
        const { data, error } = await auth.refreshSession({ refresh_token: refreshToken })
        if (error) failure(error)
        return tokens(data.session)
      } finally { await auth.dispose() }
    },
    async verify(accessToken) {
      const auth = client()
      try {
        const { data, error } = await auth.getUser(accessToken)
        if (error) failure(error)
        if (!data.user) throw new AuthError('invalid_credentials')
        return data.user.id
      } finally { await auth.dispose() }
    },
    async revoke(accessToken) {
      const auth = client()
      try {
        // SDK's user-token logout endpoint, local session scope; no admin credential.
        const { error } = await auth.admin.signOut(accessToken, 'local')
        if (error) failure(error)
      } finally { await auth.dispose() }
    },
  }
}
