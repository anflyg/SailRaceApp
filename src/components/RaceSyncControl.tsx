import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { Race } from '../types'
import { useTranslation } from '../i18n/LanguageContext'
import type { TranslationKey } from '../i18n/translations'
import type { RaceSyncCoordinator } from '../services/sync/coordinator'
import { SyncError, type SyncErrorCode, type SyncState } from '../services/sync/types'
import type { AccountSession, AccountSnapshot } from '../services/auth/types'

const signedOut: AccountSnapshot = { status: 'signed_out' }
const noSubscribe = () => () => {}
const noSnapshot = () => signedOut

export function syncLabel(state: SyncState | null, error?: SyncErrorCode, mock=false):TranslationKey {
  const code=error??state?.error
  if(code==='unauthorized')return 'sync.waitingSignIn'
  if(code==='recording_active')return 'sync.waitingRecording'
  if(code==='offline')return 'sync.waitingNetwork'
  if(code==='uploads_disabled')return 'sync.uploadsDisabled'
  if(code&&['intent_expired','issuance_uncertain','account_changed','race_conflict','artifact_missing','storage_unavailable','upload_expired','upload_not_found','invalid_request'].includes(code))return 'sync.manual'
  if(state?.status==='accepted')return mock?'sync.mockAccepted':'sync.accepted'
  if(state?.status==='blocked_entitlement')return 'sync.entitlement'
  if(state?.status==='invalid'||code&&['invalid_race_payload','payload_too_large','unsupported_media_type'].includes(code))return 'sync.invalid'
  if(code)return 'sync.retryAvailable'
  return state?'sync.ready':'sync.notSynchronized'
}
export function RaceSyncControl({race,coordinator,account,recordingActive=false}:{
  race:Race;coordinator?:RaceSyncCoordinator;account?:AccountSession;recordingActive?:boolean
}) {
  const {t}=useTranslation(),[state,setState]=useState<SyncState|null>(null),[error,setError]=useState<SyncErrorCode>(),[busy,setBusy]=useState(false)
  const snapshot=useSyncExternalStore(account?.subscribe??noSubscribe,account?.snapshot??noSnapshot,account?.snapshot??noSnapshot)
  const generation=useRef(0)
  const owner=account?snapshot.ownerId:undefined
  const latest=useRef({coordinator,id:race.id,owner})
  latest.current={coordinator,id:race.id,owner}
  useEffect(()=>{
    const current=++generation.current;setState(null);setError(undefined);setBusy(false)
    if(coordinator&&(!account||owner))void coordinator.read(race.id).then(s=>{if(generation.current===current)setState(s)}).catch(e=>{if(generation.current===current)setError(e instanceof SyncError?e.code:'storage_unavailable')})
    return ()=>{++generation.current}
  },[coordinator,race.id,account,owner])
  const code=error??state?.error,mock=coordinator?.mode==='mock',newIntent=code==='intent_expired'||code==='issuance_uncertain'
  async function sync() {
    if(!coordinator||recordingActive||busy)return
    const current=++generation.current,identity={coordinator,id:race.id,owner}
    const live=()=>generation.current===current&&latest.current.coordinator===identity.coordinator&&latest.current.id===identity.id&&latest.current.owner===identity.owner
    setBusy(true);setError(undefined)
    try {const result=await coordinator.sync(race.id,{retry:true,newIntent});if(live())setState(result)}
    catch(e){if(live())setError(e instanceof SyncError?e.code:'storage_unavailable')}
    finally {if(live())setBusy(false)}
  }
  const visibleState=state&&state.localRaceId===race.id&&(!account||state.ownerId===owner)?state:null
  const waitingSignIn=!!account&&!owner
  const label=recordingActive?'sync.waitingRecording':waitingSignIn?'sync.waitingSignIn':busy?'sync.synchronizing':syncLabel(visibleState,error,mock)
  return <div className="race-sync-control">
    <span role="status" aria-live="polite">{t(label)}</span>
    {!coordinator?<small>{t('sync.unavailable')}</small>:mock?<small>{t('sync.mockOnly')}</small>:null}
    {coordinator&&!mock?<small>{t(waitingSignIn?'sync.signInHelp':'sync.privacy')}</small>:null}
    {newIntent?<small>{t('sync.intentAction')}</small>:null}
    <button type="button" onClick={()=>void sync()} disabled={!coordinator||busy||recordingActive||waitingSignIn||!race.endTime||visibleState?.status==='accepted'}>
      {busy?t('sync.synchronizing'):newIntent?t('sync.newIntent'):mock?t('sync.mockAction'):t('sync.action')}
    </button>
  </div>
}
