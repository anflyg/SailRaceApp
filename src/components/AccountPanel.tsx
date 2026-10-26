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
  const label = !session ? t('account.unavailable') : state.status === 'signed_in' ? t('account.signedIn') : busy ? t('account.busy')
    : state.status === 'offline' ? t('account.offline') : state.error === 'cancelled' ? t('account.cancelled')
    : state.error === 'storage_unavailable' ? t('account.storage') : state.error ? t('account.error') : t('account.signedOut')
  return <section className="account-panel" aria-labelledby="account-heading">
    <h2 id="account-heading">{t('account.title')}</h2>
    <p role="status">{label}</p>
    <div className="account-actions">
      {!state.ownerId && <button className="apple-sign-in" type="button" disabled={!session || busy || logoutFailed}
        onClick={() => { void session?.signIn().catch(() => {}) }}> {t('account.signIn')}</button>}
      {session && <button type="button" disabled={busy} onClick={() => { void session.restore().catch(() => {}) }}>{t('account.restore')}</button>}
      {session && (state.ownerId || state.status === 'error' || logoutFailed || busy) && <button type="button" onClick={() => {
        void session.logout().then(() => setLogoutFailed(false)).catch(() => setLogoutFailed(true))
      }}>{t('account.signOut')}</button>}
    </div>
    {logoutFailed && <p role="alert">{t('account.logoutError')}</p>}
    <small>{t('account.boundary')}</small>
  </section>
}
