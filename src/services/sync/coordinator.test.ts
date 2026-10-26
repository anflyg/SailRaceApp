import { describe, expect, it, vi } from 'vitest'
import { createRace, getRace, listRaces } from '../raceStorage'
import { startRaceLogging, stopActiveRace } from '../raceLogger'
import { RaceSyncCoordinator } from './coordinator'
import { WorkerClient } from './workerClient'
import { SyncError } from './types'
import { barrier, harness, response } from './testSupport'

describe('complete injected Worker synchronization',()=>{
  it('runs completed race → intent → issued UUID → persisted artifact → prepare/content/finalize',async()=>{
    const h=harness(),original=structuredClone(h.race)
    h.intercept(async(req,next)=>{
      if(req.path.endsWith('/upload')){
        const artifact=await h.store.artifact(h.race.id),state=await h.store.state(h.race.id)
        expect(artifact).not.toBeNull();expect(state?.artifact?.rawSha256).toBe(artifact?.prepare.rawSha256)
      }
      return next()
    })
    const state=await h.engine.sync(h.race.id)
    expect(state).toMatchObject({status:'accepted',step:'done',mode:'mock',localRaceId:h.race.id,ownerId:h.runtime.session!.ownerId})
    expect(state.cloudRaceId).not.toBe(h.race.id);expect(state.intent).toBeUndefined()
    expect(h.worker.requests.map(r=>r.method+' '+r.path.replace(state.cloudRaceId!,'CLOUD'))).toEqual([
      'POST /v1/race-creation-intents','POST /v1/races','POST /v1/races/CLOUD/upload','PUT /v1/races/CLOUD/upload/content','POST /v1/races/CLOUD/upload/finalize'])
    expect(h.race).toEqual(original)
    const files=[...h.memory.values.values()].join('')
    expect(files).not.toContain(h.runtime.session!.accessToken);expect(files).not.toContain('PRIVATE NAME')
    expect(await h.restart().sync(h.race.id)).toEqual(state);expect(h.worker.requests).toHaveLength(5)
  })
  it.each(['create','artifact','prepare','content','finalize','done'] as const)('resumes after committed %s checkpoint and app restart',async step=>{
    const h=harness(),save=h.store.save.bind(h.store)
    let crashed=false
    vi.spyOn(h.store,'save').mockImplementation(async state=>{
      if(crashed)throw new SyncError('storage_unavailable')
      await save(state)
      if(state.step===step){crashed=true;throw new SyncError('storage_unavailable')}
    })
    await expect(h.engine.sync(h.race.id)).rejects.toThrow('storage_unavailable')
    const before=await h.store.state(h.race.id),artifact=await h.store.artifact(h.race.id)
    vi.mocked(h.store.save).mockRestore()
    const result=await h.restart().sync(h.race.id,{retry:true})
    expect(result.status).toBe('accepted')
    if(before?.cloudRaceId)expect(result.cloudRaceId).toBe(before.cloudRaceId)
    if(artifact)expect((await h.store.artifact(h.race.id))?.bytes).toEqual(artifact.bytes)
    expect(h.worker.intents.size).toBe(1);expect(h.worker.races.size).toBe(1)
  })
  it.each(['/v1/races','/upload','/content','/finalize'])('reconciles lost %s response with the same identity and bytes',async path=>{
    const h=harness();let losses=0
    h.intercept(async(req,next)=>{const r=await next();if((path==='/v1/races'?req.path===path:req.path.endsWith(path))&&losses++<3)throw new Error('PRIVATE provider body');return r})
    const first=await h.engine.sync(h.race.id)
    expect(first.status).toBe('queued');expect(first.error).toBe('upstream_unavailable')
    const saved=await h.store.artifact(h.race.id),intent=[...h.worker.intents.keys()][0]
    h.intercept(undefined);h.runtime.time+=60000
    const result=await h.restart().sync(h.race.id,{retry:true})
    expect(result.status).toBe('accepted');expect(h.worker.races.size).toBe(1);expect(h.worker.intents.size).toBe(1)
    expect(h.worker.intents.has(intent)).toBe(true)
    if(saved)expect((await h.store.artifact(h.race.id))!.bytes).toEqual(saved.bytes)
  })
  it('continues with a known cloud ID after intent expiry and preserves legacy local IDs',async()=>{
    const h=harness();h.race.id='race_legacy_local_id'
    h.intercept(async(req,next)=>req.path.endsWith('/upload')?response(503,'upstream_unavailable'):next())
    const pending=await h.engine.sync(h.race.id),artifact=await h.store.artifact(h.race.id)
    h.runtime.time+=86400001;h.intercept(undefined)
    const accepted=await h.restart().sync(h.race.id,{retry:true})
    expect(accepted).toMatchObject({status:'accepted',localRaceId:'race_legacy_local_id',cloudRaceId:pending.cloudRaceId})
    expect((await h.store.artifact(h.race.id))!.bytes).toEqual(artifact!.bytes)
    expect(h.worker.intents.size).toBe(1);expect(h.worker.races.size).toBe(1)
  })
  it('never renews an expired creation intent automatically',async()=>{
    const h=harness()
    h.intercept(async(req,next)=>req.path==='/v1/races'?response(503,'upstream_unavailable'):next())
    await h.engine.sync(h.race.id)
    const before=await h.store.state(h.race.id),count=h.transport.request.mock.calls.length
    h.runtime.time=Date.parse(before!.intent!.expiresAt)
    expect((await h.restart().sync(h.race.id,{retry:true})).error).toBe('intent_expired')
    expect(h.transport.request).toHaveBeenCalledTimes(count)
    h.intercept(undefined)
    expect((await h.restart().sync(h.race.id,{retry:true,newIntent:true})).status).toBe('accepted')
    expect(h.worker.intents.size).toBe(2)
  })
  it('does not replace a still-valid intent or mapped UUID',async()=>{
    const h=harness();h.intercept(async(req,next)=>req.path==='/v1/races'?response(503,'upstream_unavailable'):next())
    await h.engine.sync(h.race.id)
    await expect(h.restart().sync(h.race.id,{newIntent:true})).rejects.toThrow('race_conflict')
    expect(h.worker.intents.size).toBe(1)
  })
  it('keeps unknown intent issuance pending until explicit new intent action',async()=>{
    const h=harness();h.intercept(async(req,next)=>{const r=await next();if(req.path==='/v1/race-creation-intents')throw new Error('lost');return r})
    expect((await h.engine.sync(h.race.id)).error).toBe('issuance_uncertain')
    h.intercept(undefined)
    expect((await h.restart().sync(h.race.id)).error).toBe('issuance_uncertain')
    expect(h.worker.intents.size).toBe(1);expect(h.worker.races.size).toBe(0)
    expect((await h.restart().sync(h.race.id,{newIntent:true,retry:true})).status).toBe('accepted')
  })
  it('waits offline and resumes only from the explicit action',async()=>{
    const h=harness();h.runtime.online=false
    expect((await h.engine.sync(h.race.id)).error).toBe('offline');expect(h.worker.requests).toHaveLength(0)
    h.runtime.online=true;expect(h.worker.requests).toHaveLength(0)
    expect((await h.restart().sync(h.race.id,{retry:true})).status).toBe('accepted')
  })
  it('blocks a changed account, including joining an in-flight attempt',async()=>{
    const h=harness(),arrived=barrier(),release=barrier()
    h.intercept(async(req,next)=>{if(req.path==='/v1/races'){arrived.release();await release.promise}return next()})
    const pending=h.engine.sync(h.race.id);await arrived.promise
    const other=new WorkerClient(h.transport,{current:async()=>({...h.runtime.session!,ownerId:crypto.randomUUID()})})
    const concurrent=new RaceSyncCoordinator({...h.dependencies,api:other}).sync(h.race.id)
    const rejected=expect(concurrent).rejects.toThrow('account_changed')
    release.release();expect((await pending).status).toBe('accepted');await rejected
    h.runtime.session={...h.runtime.session!,ownerId:crypto.randomUUID()}
    await expect(h.restart().sync(h.race.id)).rejects.toThrow('account_changed')
    await expect(h.restart().read(h.race.id)).rejects.toThrow('account_changed')
    expect(h.worker.races.size).toBe(1)
  })
  it('never confirms acceptance if the session changes while finalize returns',async()=>{
    const h=harness()
    h.intercept(async(req,next)=>{const r=await next();if(req.path.endsWith('/finalize'))h.runtime.session={...h.runtime.session!,ownerId:crypto.randomUUID()};return r})
    expect((await h.engine.sync(h.race.id)).error).toBe('account_changed')
    expect((await h.store.state(h.race.id))?.status).not.toBe('accepted')
    expect([...h.worker.races.values()][0].accepted).toBe(true) // Must reconcile as the original owner.
  })
  it('coalesces simultaneous sync actions and refuses local removal during sync',async()=>{
    const h=harness(),arrived=barrier(),release=barrier()
    h.intercept(async(req,next)=>{if(req.path==='/v1/races'){arrived.release();await release.promise}return next()})
    const first=h.engine.sync(h.race.id);await arrived.promise
    const second=h.restart().sync(h.race.id)
    await expect(h.engine.removeLocalArtifact(h.race.id)).rejects.toThrow('race_conflict')
    release.release();expect((await first).status).toBe('accepted');expect((await second).status).toBe('accepted')
    expect(h.worker.requests).toHaveLength(5)
  })
  it('reuses the original immutable artifact despite subsequent local edits',async()=>{
    const h=harness();h.intercept(async(req,next)=>req.path.endsWith('/upload')?response(503,'upstream_unavailable'):next())
    await h.engine.sync(h.race.id);const a=await h.store.artifact(h.race.id)
    h.race.samples[1].longitude=1;h.race.name='CHANGED';h.intercept(undefined);h.runtime.time+=60000
    expect((await h.restart().sync(h.race.id,{retry:true})).status).toBe('accepted')
    expect((await h.store.artifact(h.race.id))!.bytes).toEqual(a!.bytes)
  })
  it.each([403,409,422])('does not loop on permanent rejection %s',async status=>{
    const h=harness(),code=status===403?'cloud_access_unavailable':status===409?'race_conflict':'invalid_race_payload'
    h.intercept(async(req,next)=>req.path.endsWith('/upload')?response(status,code):next())
    const result=await h.engine.sync(h.race.id)
    expect(result.status).toBe(status===403?'blocked_entitlement':status===422?'invalid':'queued')
    expect(result.error).toBe(code);expect(h.transport.request.mock.calls.filter(([r])=>r.path.endsWith('/upload'))).toHaveLength(1)
    expect(await h.store.artifact(h.race.id)).not.toBeNull();expect(h.race.samples).toHaveLength(3)
  })
  it('bounds retries and respects a long Retry-After without blocking the app',async()=>{
    const h=harness();h.intercept(async(req,next)=>req.path.endsWith('/upload')?response(429,'rate_limited',{'Retry-After':'120'}):next())
    const state=await h.engine.sync(h.race.id)
    expect(state.status).toBe('queued');expect(state.nextAttemptAt).toBe(h.runtime.time+120000);expect(h.sleep).not.toHaveBeenCalled()
    const count=h.transport.request.mock.calls.length
    await h.restart().sync(h.race.id,{retry:true});expect(h.transport.request).toHaveBeenCalledTimes(count)
  })
  it('does not regenerate a referenced artifact after local removal or claim cloud deletion',async()=>{
    const h=harness();const accepted=await h.engine.sync(h.race.id)
    await h.engine.removeLocalArtifact(h.race.id)
    expect(await h.store.artifact(h.race.id)).toBeNull()
    expect((await h.restart().sync(h.race.id)).status).toBe('accepted')
    expect(h.worker.races.get(accepted.cloudRaceId!)?.accepted).toBe(true)
    const h2=harness();h2.intercept(async(req,next)=>req.path.endsWith('/upload')?response(503,'upstream_unavailable'):next())
    await h2.engine.sync(h2.race.id);await h2.engine.removeLocalArtifact(h2.race.id);h2.intercept(undefined);h2.runtime.time+=60000
    expect((await h2.restart().sync(h2.race.id,{retry:true})).error).toBe('artifact_missing')
  })
  it('does not upload active or incomplete races and persists invalid completed-data status',async()=>{
    const h=harness();h.runtime.active=h.race.id
    await expect(h.engine.sync(h.race.id)).rejects.toThrow('invalid_race_payload')
    h.runtime.active=null;h.race.samples=[]
    expect((await h.engine.sync(h.race.id)).status).toBe('invalid');expect(h.worker.requests).toHaveLength(0)
  })
  it('defers sync if another recording is active or starts during identity creation',async()=>{
    const h=harness();h.runtime.active='another-local-race'
    expect((await h.engine.sync(h.race.id)).error).toBe('recording_active');expect(h.worker.requests).toHaveLength(0)
    h.runtime.active=null
    h.intercept(async(req,next)=>{const r=await next();if(req.path==='/v1/races')h.runtime.active='new-local-race';return r})
    const deferred=await h.restart().sync(h.race.id)
    expect(deferred.error).toBe('recording_active');expect(deferred.cloudRaceId).toBeTruthy()
    expect(await h.store.artifact(h.race.id)).toBeNull()
    h.runtime.active=null;h.intercept(undefined)
    expect((await h.restart().sync(h.race.id,{retry:true})).cloudRaceId).toBe(deferred.cloudRaceId)
    expect(h.worker.races.size).toBe(1)
  })
  it('leaves existing local recording/storage behavior untouched',async()=>{
    const before=listRaces().length
    const local=createRace({name:'Local only',createdAt:'2026-01-01T12:00:00Z',samples:[]})
    const h=harness();h.runtime.online=false;await h.engine.sync(h.race.id)
    expect(getRace(local.id)?.name).toBe('Local only');expect(listRaces().length).toBe(before+1)
    const active=startRaceLogging({countdownDurationSeconds:60,now:new Date('2026-01-01T13:00:00Z')})
    expect(getRace(active.id)?.endTime).toBeUndefined()
    expect(stopActiveRace({now:new Date('2026-01-01T13:02:00Z')})?.endTime).toBe('2026-01-01T13:02:00.000Z')
  })
})
