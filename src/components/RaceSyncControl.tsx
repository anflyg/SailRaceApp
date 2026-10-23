import { useEffect, useState } from 'react'
import type { Race } from '../types'
import { useTranslation } from '../i18n/LanguageContext'
import type { TranslationKey } from '../i18n/translations'
import type { RaceSyncCoordinator } from '../services/sync/coordinator'
import { SyncError, type SyncErrorCode, type SyncState } from '../services/sync/types'

export function syncLabel(state: SyncState | null, error?: SyncErrorCode, mock=false):TranslationKey {
  const code=error??state?.error
  if(code==='unauthorized')return 'sync.waitingSignIn'
  if(code==='recording_active')return 'sync.waitingRecording'
  if(code==='offline')return 'sync.waitingNetwork'
  if(code&&['intent_expired','issuance_uncertain','account_changed','race_conflict','artifact_missing','storage_unavailable','upload_expired','upload_not_found','invalid_request'].includes(code))return 'sync.manual'
  if(state?.status==='accepted')return mock?'sync.mockAccepted':'sync.accepted'
  if(state?.status==='blocked_entitlement')return 'sync.entitlement'
  if(state?.status==='invalid'||code&&['invalid_race_payload','payload_too_large','unsupported_media_type'].includes(code))return 'sync.invalid'
  if(code)return 'sync.retryAvailable'
  return state?'sync.ready':'sync.notSynchronized'
}
export function RaceSyncControl({race,coordinator}:{race:Race;coordinator?:RaceSyncCoordinator}) {
  const {t}=useTranslation(),[state,setState]=useState<SyncState|null>(null),[error,setError]=useState<SyncErrorCode>(),[busy,setBusy]=useState(false)
  useEffect(()=>{
    let active=true;setState(null);setError(undefined)
    if(coordinator)void coordinator.read(race.id).then(s=>{if(active)setState(s)}).catch(e=>{if(active)setError(e instanceof SyncError?e.code:'storage_unavailable')})
    return ()=>{active=false}
  },[coordinator,race.id])
  const code=error??state?.error,mock=coordinator?.mode==='mock',newIntent=code==='intent_expired'||code==='issuance_uncertain'
  async function sync() {
    if(!coordinator)return
    setBusy(true);setError(undefined)
    try { setState(await coordinator.sync(race.id,{retry:true,newIntent})) }
    catch(e){setError(e instanceof SyncError?e.code:'storage_unavailable')}
    finally {setBusy(false)}
  }
  return <div className="race-sync-control">
    <span role="status" aria-live="polite">{busy?t('sync.synchronizing'):t(syncLabel(state,error,mock))}</span>
    {!coordinator?<small>{t('sync.unavailable')}</small>:mock?<small>{t('sync.mockOnly')}</small>:null}
    {newIntent?<small>{t('sync.intentAction')}</small>:null}
    <button type="button" onClick={()=>void sync()} disabled={!coordinator||busy||!race.endTime||state?.status==='accepted'}>
      {busy?t('sync.synchronizing'):newIntent?t('sync.newIntent'):mock?t('sync.mockAction'):t('sync.action')}
    </button>
  </div>
}
