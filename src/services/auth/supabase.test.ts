import { afterEach, describe, expect, it, vi } from 'vitest'
import { nativeAuthFetch as buildNativeAuthFetch, publicAuthConfig, supabaseAdapter } from './supabase'
import { accountSession } from './native'
const nativeAuthFetch = (origin: string, request?: Parameters<typeof buildNativeAuthFetch>[1]) => buildNativeAuthFetch(origin, request, () => 'ios')
const owner = '11111111-1111-4111-8111-111111111111'
const config = { url: 'https://synthetic.invalid', publishableKey: 'sb_publishable_synthetic_only_000000000000' }
const credential = { identityToken: 'synthetic-apple-token', rawNonce: 'a'.repeat(64), appleUser: 'synthetic-user' }
const session = { access_token: 'synthetic-access', refresh_token: 'synthetic-refresh', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user: { id: owner, aud: 'authenticated', email: 'unneeded.invalid', user_metadata: { name: 'ignored' } } }
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })
describe('official Supabase Auth adapter with injected native transport', () => {
  it('uses signInWithIdToken with Apple and the raw nonce, and only retains minimized session fields', async () => {
    const forbidden = { getItem: vi.fn(() => { throw new Error('forbidden storage') }), setItem: vi.fn(() => { throw new Error('forbidden storage') }) }
    vi.stubGlobal('localStorage', forbidden)
    const request = vi.fn(async () => ({ status: 200, data: session, headers: { 'content-type': 'application/json' }, url: '' }))
    const auth = supabaseAdapter(config, nativeAuthFetch(config.url, request))
    const result = await auth.exchange(credential)
    expect(result).toEqual({ ownerId: owner, accessToken: session.access_token, refreshToken: session.refresh_token, expiresAt: session.expires_at * 1000 })
    expect(request).toHaveBeenCalledOnce()
    expect(request.mock.calls[0]).toBeDefined()
    const options = vi.mocked(request).mock.calls[0] as unknown as [{ url: string; method: string; data: string; headers: Record<string, string>; disableRedirects: boolean }]
    expect(options[0].url).toBe(config.url + '/auth/v1/token?grant_type=id_token')
    expect(JSON.parse(options[0].data)).toMatchObject({ provider: 'apple', id_token: credential.identityToken, nonce: credential.rawNonce })
    expect(options[0].disableRedirects).toBe(true)
    expect(forbidden.getItem).not.toHaveBeenCalled(); expect(forbidden.setItem).not.toHaveBeenCalled()
    expect(JSON.stringify(result)).not.toMatch(/email|name|identityToken|rawNonce/)
  })
  it('refreshes the supplied token, verifies user through Auth, and revokes only the current server session', async () => {
    const request = vi.fn(async (options: { url: string }) => ({ status: 200, data: options.url.includes('/user') ? session.user : options.url.includes('/logout') ? {} : session, headers: {}, url: options.url }))
    const auth = supabaseAdapter(config, nativeAuthFetch(config.url, request))
    expect((await auth.refresh('original-refresh')).ownerId).toBe(owner)
    expect(await auth.verify('current-access')).toBe(owner)
    await auth.revoke('current-access')
    const calls = request.mock.calls.map(([options]) => options) as { url: string; data?: string; headers: Record<string, string> }[]
    expect(JSON.parse(calls[0].data!)).toEqual({ refresh_token: 'original-refresh' })
    expect(calls[1].headers.authorization).toBe('Bearer current-access')
    expect(calls[2].url).toBe(config.url + '/auth/v1/logout?scope=local')
    expect(calls[2].headers.authorization).toBe('Bearer current-access')
    expect(calls.every(call => call.headers.apikey === config.publishableKey)).toBe(true)
  })
  it('sanitizes rejected credentials and never exposes the provider body', async () => {
    const auth = supabaseAdapter(config, nativeAuthFetch(config.url, async () => ({ status: 400, data: { msg: 'PRIVATE BODY TOKEN', code: 'validation_failed' }, headers: {}, url: '' })))
    await expect(auth.exchange(credential)).rejects.toThrow('invalid_credentials')
  })
  it('refuses redirected and oversized responses and sanitizes transport errors', async () => {
    for (const response of [{ status: 302, data: '', headers: {}, url: '' }, { status: 200, data: '', headers: {}, url: 'https://foreign.invalid' }, { status: 200, data: 'a'.repeat(65537), headers: {}, url: '' }]) {
      const transport = nativeAuthFetch(config.url, async () => response)
      await expect(transport(config.url + '/auth/v1/user')).rejects.toThrow('unavailable')
    }
    await expect(nativeAuthFetch(config.url, async () => { throw new Error('PRIVATE ERROR') })(config.url + '/auth/v1/user')).rejects.toThrow('unavailable')
  })
  it('allows only the exact configured auth routes and methods', async () => {
    const request = vi.fn()
    const transport = nativeAuthFetch(config.url, request)
    for (const url of ['https://foreign.invalid/auth/v1/user', config.url + '/rest/v1/races', config.url + '/v1/races', config.url + '/auth/v1/user?secret=1', config.url + '/auth/v1/token?grant_type=password', config.url + '/auth/v1/user#fragment']) {
      await expect(transport(url)).rejects.toThrow('unavailable')
    }
    expect(request).not.toHaveBeenCalled()
  })
  it('rejects browser HTTP fallback before dispatching any credentials', async () => {
    const request = vi.fn()
    await expect(buildNativeAuthFetch(config.url, request, () => 'web')(config.url + '/auth/v1/user')).rejects.toThrow('unavailable')
    expect(request).not.toHaveBeenCalled()
  })
  it('accepts only public configuration and has no browser auth fallback', () => {
    expect(publicAuthConfig(config.url, config.publishableKey)).toEqual(config)
    const anon = `h.${btoa(JSON.stringify({ role: 'anon' }))}.s`
    expect(publicAuthConfig(config.url, anon)).not.toBeNull()
    for (const key of ['sb_secret_private', `h.${btoa(JSON.stringify({ role: 'service_role' }))}.s`, '', undefined]) expect(publicAuthConfig(config.url, key)).toBeNull()
    for (const url of ['http://localhost', config.url + '/path', 'https://user:password@synthetic.invalid', '', undefined]) expect(publicAuthConfig(url, config.publishableKey)).toBeNull()
    expect(accountSession()).toBeNull()
  })
})
