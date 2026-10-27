import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { AccountPanel } from './AccountPanel'
import { LanguageProvider } from '../i18n/LanguageContext'
import type { AccountSession, AccountSnapshot } from '../services/auth/types'
const render = (state: AccountSnapshot, language: 'sv' | 'en', enabled = true) => {
  const session: AccountSession = { snapshot: () => state, subscribe: () => () => {}, current: vi.fn(), signIn: vi.fn(), logout: vi.fn(), restore: vi.fn() }
  return renderToStaticMarkup(<LanguageProvider language={language} setLanguage={vi.fn()}><AccountPanel session={enabled ? session : null} /></LanguageProvider>)
}
describe('localized optional account UI', () => {
  it('explains unavailable native configuration and keeps offline/local use explicit', () => {
    const html = render({ status: 'signed_out' }, 'en', false)
    expect(html).toContain('configured iPhone'); expect(html).toContain('disabled=""')
    expect(html).toContain('Uploads of recorded races are disabled'); expect(html).toContain('Signing out keeps local races')
  })
  it('localizes sign-in and presents safe status without account identifiers or tokens', () => {
    expect(render({ status: 'signed_out' }, 'sv')).toContain('Logga in med Apple')
    const html = render({ status: 'signed_in', ownerId: 'PRIVATE_OWNER' }, 'en')
    expect(html).toContain('Signed in'); expect(html).toContain('Sign out'); expect(html).not.toContain('PRIVATE_OWNER')
  })
  it('shows offline, cancellation and protected-storage errors', () => {
    expect(render({ status: 'offline' }, 'sv')).toContain('Offline')
    expect(render({ status: 'signed_out', error: 'cancelled' }, 'en')).toContain('cancelled')
    expect(render({ status: 'error', error: 'storage_unavailable' }, 'sv')).toContain('Lås upp telefonen')
  })
})
