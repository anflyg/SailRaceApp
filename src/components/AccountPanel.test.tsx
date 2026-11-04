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
  it('keeps Apple sign-in visible but disabled when native auth is unavailable', () => {
    const html = render({ status: 'signed_out' }, 'en', false)
    expect(html).toContain('<h2 class="setup-section-heading" id="account-heading">Sign in</h2><button class="account-sign-in" type="button" disabled=""> Sign in with Apple</button>')
    expect(html).toContain('Signed out')
    expect(html).not.toContain('configured iPhone')
    expect(html).not.toContain('optional')
    expect(html).not.toContain('Uploads of recorded races are disabled')
    expect(html).not.toContain('Check session')
  })
  it('localizes sign-in and presents safe status without account identifiers or tokens', () => {
    const signedOut = render({ status: 'signed_out' }, 'sv')
    expect(signedOut).toContain('>Inloggning</h2>')
    expect(signedOut).toContain('Logga in med Apple'); expect(signedOut).toContain('Inte inloggad')
    expect(signedOut).not.toContain('Kontrollera session')
    const html = render({ status: 'signed_in', ownerId: 'PRIVATE_OWNER' }, 'en')
    expect(html).toContain('Sign in</h2>'); expect(html).toContain('Signed in'); expect(html).toContain('Sign out'); expect(html).not.toContain('PRIVATE_OWNER')
  })
  it('shows actionable offline and protected-storage states without surfacing cancellation', () => {
    expect(render({ status: 'offline' }, 'sv')).toContain('Offline')
    expect(render({ status: 'signed_out', error: 'cancelled' }, 'en')).toContain('Signed out')
    expect(render({ status: 'signed_out', error: 'cancelled' }, 'en')).not.toContain('cancelled')
    const blocked = render({ status: 'error', error: 'storage_unavailable' }, 'sv')
    expect(blocked).toContain('Lås upp telefonen')
    expect(blocked).toContain('account-sign-out')
    expect(blocked).toContain('Logga ut')
  })
})
