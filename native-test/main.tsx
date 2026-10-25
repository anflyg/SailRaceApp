import { useEffect, useState, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { NativeTestControl, testConfig } from './control'
import './style.css'

function TestScreen() {
  const [control] = useState(() => new NativeTestControl(testConfig({
    VITE_NATIVE_TEST_APPROVAL: import.meta.env.VITE_NATIVE_TEST_APPROVAL,
    VITE_NATIVE_TEST_WORKER_ORIGIN: import.meta.env.VITE_NATIVE_TEST_WORKER_ORIGIN,
    VITE_NATIVE_TEST_APPROVED_WORKER_ORIGIN: import.meta.env.VITE_NATIVE_TEST_APPROVED_WORKER_ORIGIN,
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  })))
  const state = useSyncExternalStore(control.subscribe, control.snapshot)
  useEffect(() => {
    const hidden = () => { if (document.visibilityState !== 'visible') control.stop() }
    window.addEventListener('pagehide', control.stop)
    document.addEventListener('visibilitychange', hidden)
    return () => { window.removeEventListener('pagehide', control.stop); document.removeEventListener('visibilitychange', hidden); control.stop() }
  }, [control])
  return <main style={{ maxWidth: 600, margin: 'auto', padding: 'max(24px, env(safe-area-inset-top)) 20px', fontFamily: 'system-ui', lineHeight: 1.5 }}>
    <h1>SYNTHETIC NATIVE WORKER TEST</h1>
    <strong>NONPRODUCTION — NOT FOR DISTRIBUTION</strong>
    <p>Fixed fictional telemetry only. No user recordings. Every request requires a manual action. Submitted server work may complete after stop.</p>
    {!control.configured && <p role="alert">NO-GO: approved local test configuration is missing. All provider actions are unavailable.</p>}
    <p role="status">{state.status}</p>
    {state.error && <p role="alert">Error category: {state.error}. Preserve checkpoints; retry does not reset identity or unknown issuance.</p>}
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
      <button disabled={!control.configured || state.busy || state.prepared || state.logoutPending} onClick={() => void control.run('prepare')}>Prepare local test</button>
      <button disabled={!state.prepared || state.busy} onClick={() => void control.run('restore')}>Restore account explicitly</button>
      <button disabled={!state.prepared || state.busy || state.signedIn} onClick={() => void control.run('signIn')}>Sign in with Apple</button>
      <button disabled={!state.prepared || state.busy || !state.signedIn} onClick={() => void control.run('sync')}>Upload fixed synthetic race</button>
      <button disabled={!state.prepared || state.busy || !state.signedIn} onClick={() => void control.run('retry')}>Retry same checkpoint</button>
      <button disabled={(!state.prepared && !state.logoutPending) || (state.logoutPending && state.busy)} onClick={() => void control.logout()}>{state.logoutPending ? 'Retry logout' : 'Logout and stop'}</button>
      <button disabled={!state.prepared && !state.busy} onClick={control.stop}>Stop test</button>
    </div>
    <p>No automatic restore, upload, background work or reconnect retry. After stop/background, prepare again explicitly. Expired/unknown issuance needs the approved operator recovery procedure; this screen never replaces it automatically.</p>
  </main>
}
createRoot(document.getElementById('root')!).render(<TestScreen />)
