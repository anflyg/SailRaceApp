import { lazy, Suspense, useState } from 'react'
import { useTranslation } from '../i18n/LanguageContext'
import { RaceSyncControl } from './RaceSyncControl'
import type { RaceSyncCoordinator } from '../services/sync/coordinator'
import { syntheticRace } from '../services/sync/syntheticRace'
import { Capacitor } from '@capacitor/core'
const SyntheticCloudUpload = lazy(() => import('./SyntheticCloudUpload').then(module => ({ default: module.SyntheticCloudUpload })))
export function SyntheticSyncDemo() {
  return Capacitor.getPlatform() === 'ios' ? <Suspense fallback={null}><SyntheticCloudUpload /></Suspense> : <LocalSyntheticSyncDemo />
}
/** Separate fixed synthetic race; never passes local recordings into the mock. */
function LocalSyntheticSyncDemo() {
  const {t}=useTranslation(),[coordinator,setCoordinator]=useState<RaceSyncCoordinator>(),[failed,setFailed]=useState(false)
  async function open() {
    try {
      const {createSyntheticDemo}=await import('../services/sync/demo')
      setCoordinator(await createSyntheticDemo())
    } catch {setFailed(true)}
  }
  return <aside className="synthetic-sync-demo" aria-label={t('sync.demoTitle')}>
    <strong>{t('sync.demoTitle')}</strong><p>{t('sync.demoText')}</p>
    {failed?<p role="status">{t('sync.manual')}</p>:null}
    {coordinator?<RaceSyncControl race={syntheticRace} coordinator={coordinator}/>:<button type="button" onClick={()=>void open()}>{t('sync.openDemo')}</button>}
  </aside>
}
