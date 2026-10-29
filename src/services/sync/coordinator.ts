import type { Race } from '../../types'
import { createArtifact, timestamp, validateCompletedRace, verifyArtifact } from './artifact'
import { localKey } from './storage'
import { SyncError, type SyncState, type SyncStore } from './types'
import { WorkerClient } from './workerClient'
const flights=new Map<string,Promise<SyncState>>()
const removals=new Set<string>()
export interface SyncOptions { newIntent?: boolean; retry?: boolean }
export interface SyncDependencies {
  store: SyncStore; api: WorkerClient; race(id:string): Race | null; activeRace(): string | null
  online(): boolean; now(): number; sleep(ms:number): Promise<void>; random(): number
}
export class RaceSyncCoordinator {
  readonly mode: SyncStore['mode']
  private d: SyncDependencies
  constructor(dependencies: SyncDependencies) {
    if(dependencies.store.mode!==dependencies.api.mode)throw new SyncError('transport_unavailable')
    this.d=dependencies;this.mode=dependencies.store.mode
  }
  async read(id:string):Promise<SyncState|null> {
    const state=await this.d.store.state(id)
    if(state&&await this.d.api.owner()!==state.ownerId)throw new SyncError('account_changed')
    return state
  }
  async removeLocalArtifact(id:string):Promise<void> {
    const key=`${this.mode}:${id}`
    if(flights.has(key)||removals.has(key))throw new SyncError('race_conflict')
    removals.add(key)
    try {
      const state=await this.d.store.state(id)
      if(state&&await this.d.api.owner()!==state.ownerId)throw new SyncError('account_changed')
      await this.d.store.removeArtifact(id)
    } finally {removals.delete(key)}
  }
  /** Explicit user action only. Nothing calls this from recording, startup or a timer. */
  sync(id:string,options:SyncOptions={}):Promise<SyncState> {
    const key=`${this.mode}:${id}`
    if(removals.has(key))return Promise.reject(new SyncError('race_conflict'))
    const existing=flights.get(key)
    if(existing)return existing.then(async state=>{if(await this.d.api.owner()!==state.ownerId)throw new SyncError('account_changed');return state})
    const promise=this.run(id,options).finally(()=>{if(flights.get(key)===promise)flights.delete(key)})
    flights.set(key,promise);return promise
  }
  private async run(id:string,options:SyncOptions):Promise<SyncState> {
    const d=this.d,race=d.race(id)
    if(!race||!race.endTime||d.activeRace()===id)throw new SyncError('invalid_race_payload')
    let state=await d.store.state(id)
    const owner=await d.api.owner()
    if(state&&state.ownerId!==owner)throw new SyncError('account_changed')
    if(!state)state={version:1,mode:this.mode,localRaceId:id,ownerId:owner,status:'recorded_local',step:'issue',attempts:0}
    if(state.status==='accepted')return state // Local artifact removal is not cloud deletion.
    if(options.newIntent) {
      if(state.cloudRaceId || (state.intent&&timestamp(state.intent.expiresAt)>d.now()))throw new SyncError('race_conflict')
      state.intent=undefined;state.issuancePending=false;state.step='issue';state.error=undefined;state.attempts=0;state.nextAttemptAt=undefined
    }
    if(options.retry&&(!state.nextAttemptAt||d.now()>=state.nextAttemptAt)){state.attempts=0;state.nextAttemptAt=undefined}
    const save=()=>d.store.save(state!)
    const fail=async(code:SyncError['code'])=>{
      state!.error=code
      state!.status=code==='cloud_access_unavailable'?'blocked_entitlement':
        ['invalid_race_payload','payload_too_large','unsupported_media_type'].includes(code)?'invalid':'queued'
      await save();return state!
    }
    if(!state.cloudRaceId) {
      try {validateCompletedRace(race)} catch(e){return fail(e instanceof SyncError?e.code:'invalid_race_payload')}
    }
    if(d.activeRace()!==null)return fail('recording_active')
    if(!d.online())return fail('offline')
    if(state.nextAttemptAt&&d.now()<state.nextAttemptAt)return state
    if(state.issuancePending&&!state.intent&&!state.cloudRaceId)return fail('issuance_uncertain')
    if(!state.cloudRaceId&&state.intent&&timestamp(state.intent.expiresAt)<=d.now())return fail('intent_expired')
    if(state.attempts>=3)return state
    state.status='syncing';state.error=undefined;await save()
    while(state.attempts<3) {
      try {
        if(await d.api.owner()!==owner)throw new SyncError('account_changed')
        if(d.activeRace()!==null)throw new SyncError('recording_active')
        if(!d.online())throw new SyncError('offline')
        if(!state.cloudRaceId) {
          if(!state.intent) {
            if(state.issuancePending)return fail('issuance_uncertain')
            state.issuancePending=true;await save() // Durable before external issuance.
            state.intent=await d.api.issue(owner)
            state.issuancePending=false;state.step='create';await save()
          }
          if(timestamp(state.intent.expiresAt)<=d.now())return fail('intent_expired')
          state.cloudRaceId=await d.api.create(owner,state.intent)
          state.step='artifact';state.intent=undefined;await save()
        }
        if(d.activeRace()!==null)throw new SyncError('recording_active')
        let artifact=await d.store.artifact(id)
        if(!artifact) {
          if(state.artifact)throw new SyncError('artifact_missing')
          artifact=await createArtifact(race,state.cloudRaceId)
          await d.store.saveArtifact(id,artifact) // Never dispatch prepare before persistence.
        }
        await verifyArtifact(artifact,state.cloudRaceId,state.artifact)
        state.artifact=artifact.prepare;state.artifactRef=await localKey(id)
        if(['artifact','issue','create'].includes(state.step))state.step='prepare'
        await save()
        // Resume ambiguous content with prepare, preserving exact immutable identity.
        // Finalize is itself idempotent and can reconcile a lost accepted response.
        if(state.step!=='finalize') {
          if(d.activeRace()!==null)throw new SyncError('recording_active')
          const prepared=await d.api.prepare(owner,artifact)
          state.step=prepared==='accepted'?'finalize':'content';await save()
          if(prepared==='prepared') {
            if(d.activeRace()!==null)throw new SyncError('recording_active')
            await d.api.content(owner,artifact)
            state.step='finalize';await save()
          }
        }
        if(d.activeRace()!==null)throw new SyncError('recording_active')
        await d.api.finalize(owner,artifact)
        state.status='accepted';state.step='done';state.error=undefined;state.nextAttemptAt=undefined;state.acceptedAt=new Date(d.now()).toISOString()
        await save();return state
      } catch(error) {
        const safe=error instanceof SyncError?error:new SyncError('upstream_unavailable')
        if(state.issuancePending&&!state.intent&&!state.cloudRaceId&&safe.code==='uploads_disabled') {
          state.issuancePending=false // Exact pre-issuance rejection, not an uncertain/lost response.
          return fail(safe.code)
        }
        if(state.issuancePending&&!state.intent&&!state.cloudRaceId)return fail('issuance_uncertain')
        state.attempts++
        if(!['upstream_unavailable','rate_limited','offline'].includes(safe.code))return fail(safe.code)
        const delay=Math.max(safe.retryAfterMs,Math.round(250*2**(state.attempts-1)*(1+d.random())))
        state.nextAttemptAt=d.now()+delay;await fail(safe.code)
        if(state.attempts>=3||delay>2000||!d.online())return state
        await d.sleep(delay);state.status='syncing';await save()
      }
    }
    return state
  }
}
