import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { useTranslation } from '../i18n/LanguageContext'
import { accountSession } from '../services/auth/native'
import type { AccountSession, AccountSnapshot } from '../services/auth/types'
import './AccountPanel.css'
const unavailable: AccountSnapshot = { status: 'signed_out' }
const noSubscribe = () => () => {}
const unavailableSnapshot = () => unavailable

export function AccountPanel({ session: injected }: { session?: AccountSession | null }) {
  const { t } = useTranslation()
  const session = useMemo(() => injected === undefined ? accountSession() : injected, [injected])
  const state = useSyncExternalStore(session?.subscribe ?? noSubscribe, session?.snapshot ?? unavailableSnapshot, session?.snapshot ?? unavailableSnapshot)
  const [logoutFailed, setLogoutFailed] = useState(false)
  useEffect(() => {
    if (!session) return
    const restore = () => { if (document.visibilityState === 'visible') void session.restore().catch(() => {}) }
    restore()
    window.addEventListener('online', restore)
    document.addEventListener('visibilitychange', restore)
    return () => { window.removeEventListener('online', restore); document.removeEventListener('visibilitychange', restore) }
  }, [session])
  const busy = state.status === 'restoring' || state.status === 'signing_in'
  const label = state.status === 'signed_in' ? t('account.signedIn') : busy ? t('account.busy')
    : state.status === 'offline' ? t('account.offline')
    : state.error === 'storage_unavailable' ? t('account.storage') : state.error && state.error !== 'cancelled' ? t('account.error') : t('account.signedOut')
  return <section className="account-panel" aria-labelledby="account-heading">
    <h2 className="setup-section-heading" id="account-heading">{t('account.title')}</h2>
    {!state.ownerId && <button className="account-sign-in" type="button" disabled={!session || busy || logoutFailed}
      onClick={() => { void session?.signIn().catch(() => {}) }}> {t('account.signIn')}</button>}
    <p className="account-status" role="status">{label}</p>
    {session && state.ownerId && <button className="account-sign-out" type="button" disabled={busy} onClick={() => {
      void session.logout().then(() => setLogoutFailed(false)).catch(() => setLogoutFailed(true))
    }}>{t('account.signOut')}</button>}
    {logoutFailed && <p role="alert">{t('account.logoutError')}</p>}
  </section>
}
