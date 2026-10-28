import { useEffect, useState, useSyncExternalStore } from 'react'
import { Capacitor } from '@capacitor/core'
import { useTranslation } from '../i18n/LanguageContext'
import { publicAuthConfig } from '../services/auth/supabase'
import { existingWorkerOrigin } from '../services/sync/isolatedNative'
import { NativeTestControl } from '../services/sync/nativeTestControl'
import { syncLabel } from './RaceSyncControl'
import type { SyncErrorCode } from '../services/sync/types'

export function SyntheticCloudUpload({ control: injected }: { control?: NativeTestControl }) {
  const { t } = useTranslation()
  const [control] = useState(() => {
    if (injected) return injected
    const auth = publicAuthConfig(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)
    return new NativeTestControl(Capacitor.getPlatform() === 'ios' && auth ? {
      purpose: 'synthetic-existing-backend', workerOrigin: existingWorkerOrigin,
      approvedWorkerOrigin: existingWorkerOrigin, auth,
    } : null)
  })
  const state = useSyncExternalStore(control.subscribe, control.snapshot, control.snapshot)
  useEffect(() => {
    const hidden = () => { if (document.visibilityState !== 'visible') control.stop() }
    window.addEventListener('pagehide', control.stop)
    document.addEventListener('visibilitychange', hidden)
    return () => {
      window.removeEventListener('pagehide', control.stop)
      document.removeEventListener('visibilitychange', hidden)
      control.stop()
    }
  }, [control])
  const accepted = state.status === 'Synthetic upload accepted — not analysis completion'
  const status = !control.configured ? 'account.unavailable' : state.busy ? 'sync.synchronizing'
    : state.error === 'uploads_disabled' ? 'cloud.disabled'
    : state.error === 'upload_expired' ? 'cloud.expired'
    : state.error ? syncLabel(null, state.error as SyncErrorCode)
    : accepted ? 'cloud.accepted' : state.status === 'Signed out' ? 'sync.waitingSignIn'
    : state.status.startsWith('Stopped') ? 'cloud.stopped' : 'cloud.ready'
  return <aside className="synthetic-sync-demo" aria-label={t('cloud.title')}>
    <strong>{t('cloud.title')}</strong>
    <p>{t('cloud.description')}</p>
    <p role="status" aria-live="polite">{t(status)}</p>
    {state.error === 'upload_expired' && <p>{t('cloud.newTestDescription')}</p>}
    <div className="synthetic-upload-actions">
      <button type="button" disabled={!control.configured || state.busy || accepted}
        onClick={() => void control.upload()}>{t('cloud.upload')}</button>
      <button type="button" disabled={!state.prepared && !state.busy}
        onClick={control.stop}>{t('cloud.stop')}</button>
      {state.error === 'upload_expired' && <button type="button" disabled={state.busy}
        onClick={() => void control.run('newTest')}>{t('cloud.newTest')}</button>}
    </div>
    <p><small>{t('cloud.boundary')}</small></p>
  </aside>
}
