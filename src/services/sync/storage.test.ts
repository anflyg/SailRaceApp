import { describe, expect, it, vi } from 'vitest'
import { Directory } from '@capacitor/filesystem'
import { RaceSyncCoordinator } from './coordinator'
import { createArtifact } from './artifact'
import { createSyncStore, localKey, nativePrivateFiles } from './storage'
import { harness, memoryFiles } from './testSupport'
const cloud='20000000-0000-4000-8000-000000000071'
function nativeHarness() {
  const files=new Map<string,string>()
  const fault={before:false,after:false,permission:false}
  const missing=()=>Object.assign(new Error('not found'),{code:'OS-PLUG-FILE-0008'})
  const fs={
    readdir:vi.fn(async(o:{path:string;directory:Directory})=>{expect(o.directory).toBe(Directory.Library);if(fault.permission)throw {code:'OS-PLUG-FILE-0013'}
      return {files:[...files.keys()].filter(k=>k.startsWith(o.path+'/')).map(path=>({name:path.slice(o.path.length+1),type:'file',size:files.get(path)!.length,ctime:0,mtime:0}))}}),
    readFile:vi.fn(async(o:{path:string;directory:Directory})=>{expect(o.directory).toBe(Directory.Library);if(!files.has(o.path))throw missing();return {data:files.get(o.path)!}}),
    writeFile:vi.fn(async(o:{path:string;directory:Directory;data:string})=>{expect(o.directory).toBe(Directory.Library);files.set(o.path,o.data);return {uri:o.path}}),
    rename:vi.fn(async(o:{from:string;to:string;directory:Directory;toDirectory?:Directory})=>{
      expect(o.directory).toBe(Directory.Library);expect(o.toDirectory).toBe(Directory.Library)
      if(fault.before)throw new Error('crash before rename')
      if(files.has(o.to))throw new Error('destination already exists')
      files.set(o.to,files.get(o.from)!);files.delete(o.from)
      if(fault.after)throw new Error('lost commit response')
    }),
    deleteFile:vi.fn(async(o:{path:string;directory:Directory})=>{expect(o.directory).toBe(Directory.Library);files.delete(o.path)}),
  }
  return {files,fs,fault,driver:()=>nativePrivateFiles(fs as unknown as Parameters<typeof nativePrivateFiles>[0])}
}
describe('private native persistent artifact/checkpoint boundary (injected filesystem)',()=>{
  it('stores exact gzip and state in Library across recreated adapters',async()=>{
    const h=nativeHarness(),fixture=harness(),a=await createArtifact(fixture.race,cloud)
    const store=createSyncStore(h.driver(),'mock')
    await store.saveArtifact(fixture.race.id,a)
    const state={version:1 as const,mode:'mock' as const,localRaceId:fixture.race.id,ownerId:fixture.runtime.session!.ownerId,
      status:'queued' as const,step:'prepare' as const,cloudRaceId:cloud,artifact:a.prepare,artifactRef:await localKey(fixture.race.id),attempts:0}
    await store.save(state)
    const restarted=createSyncStore(h.driver(),'mock')
    expect(await restarted.state(fixture.race.id)).toEqual(state)
    expect((await restarted.artifact(fixture.race.id))!.bytes).toEqual(a.bytes)
    expect([...h.files.keys()].every(k=>k.startsWith('TackWiseSyncV1/mock-'))).toBe(true)
    expect(JSON.stringify([...h.files])).not.toContain(fixture.race.name)
    expect(h.fs.writeFile.mock.calls.every(([o])=>o.directory!==Directory.Cache&&o.directory!==Directory.Documents)).toBe(true)
  })
  it('runs the complete flow through native serialization and resumes an accepted receipt',async()=>{
    const fixture=harness(),native=nativeHarness(),store=createSyncStore(native.driver(),'mock')
    const engine=new RaceSyncCoordinator({...fixture.dependencies,store})
    expect((await engine.sync(fixture.race.id)).status).toBe('accepted')
    const restored=createSyncStore(native.driver(),'mock')
    expect((await new RaceSyncCoordinator({...fixture.dependencies,store:restored}).sync(fixture.race.id)).status).toBe('accepted')
    expect(fixture.worker.requests).toHaveLength(5)
    expect((await restored.artifact(fixture.race.id))!.prepare.rawSha256).toBe((await restored.state(fixture.race.id))!.artifact!.rawSha256)
  })
  it('never overwrites an immutable artifact with a changed identity',async()=>{
    const h=nativeHarness(),fixture=harness(),a=await createArtifact(fixture.race,cloud),store=createSyncStore(h.driver(),'mock')
    await store.saveArtifact(fixture.race.id,a)
    fixture.race.samples[1].longitude=2
    await expect(store.saveArtifact(fixture.race.id,await createArtifact(fixture.race,cloud))).rejects.toThrow('artifact_missing')
    expect((await store.artifact(fixture.race.id))!.bytes).toEqual(a.bytes)
  })
  it('retains the previous committed state when interrupted before a new rename',async()=>{
    const h=nativeHarness(),key=`mock-${'a'.repeat(64)}-state`,first=h.driver()
    await first.write(key,'old');h.fault.before=true
    await expect(first.write(key,'new')).rejects.toThrow('crash before rename')
    expect(await h.driver().read(key)).toBe('old')
    expect([...h.files.keys()].some(k=>k.endsWith('.tmp'))).toBe(true)
    h.fault.before=false;await h.driver().write(key,'confirmed')
    expect(await h.driver().read(key)).toBe('confirmed')
    expect([...h.files.keys()]).toHaveLength(1)
  })
  it('recovers a committed rename after the bridge response was lost',async()=>{
    const h=nativeHarness(),key=`mock-${'a'.repeat(64)}-state`
    await h.driver().write(key,'old');h.fault.after=true
    await expect(h.driver().write(key,'new')).rejects.toThrow('lost commit response')
    expect(await h.driver().read(key)).toBe('new')
  })
  it('fails closed on permission errors or corrupt committed identity, never resets it',async()=>{
    const h=nativeHarness(),fixture=harness(),store=createSyncStore(h.driver(),'mock')
    h.fault.permission=true;await expect(store.state(fixture.race.id)).rejects.toThrow('storage_unavailable')
    h.fault.permission=false
    const key=`mock-${await localKey(fixture.race.id)}-state`
    await h.driver().write(key,'{broken')
    await expect(createSyncStore(h.driver(),'mock').state(fixture.race.id)).rejects.toThrow('storage_unavailable')
    expect(await h.driver().read(key)).toBe('{broken')
  })
  it('removes all local artifact versions/temps and preserves accepted receipt',async()=>{
    const h=nativeHarness(),fixture=harness(),store=createSyncStore(h.driver(),'mock'),a=await createArtifact(fixture.race,cloud)
    await store.saveArtifact(fixture.race.id,a)
    const key=`mock-${await localKey(fixture.race.id)}-artifact`
    h.files.set(`TackWiseSyncV1/${key}.orphan.tmp`,'private partial artifact')
    const state={version:1 as const,mode:'mock' as const,ownerId:fixture.runtime.session!.ownerId,localRaceId:fixture.race.id,
      status:'accepted' as const,step:'done' as const,cloudRaceId:cloud,artifact:a.prepare,artifactRef:await localKey(fixture.race.id),acceptedAt:'2026-01-02T12:00:00.000Z',attempts:0}
    await store.save(state);await store.removeArtifact(fixture.race.id)
    expect(await store.artifact(fixture.race.id)).toBeNull();expect(await store.state(fixture.race.id)).toEqual(state)
    expect([...h.files.keys()].some(k=>k.includes('-artifact.'))).toBe(false)
  })
  it('keeps mock and worker states isolated and validates durable associations',async()=>{
    const h=harness();await h.engine.sync(h.race.id)
    expect(await createSyncStore(h.memory.files,'worker').state(h.race.id)).toBeNull()
    const key=[...h.memory.values.keys()].find(k=>k.endsWith('-state'))!,state=JSON.parse(h.memory.values.get(key)!)
    for(const change of [{accessToken:'forbidden'},{cloudRaceId:undefined},{ownerId:'wrong'},{artifactRef:'wrong'}]){
      h.memory.values.set(key,JSON.stringify({...state,...change}))
      await expect(h.store.state(h.race.id)).rejects.toThrow('storage_unavailable')
    }
  })
  it('does not call browser localStorage for state, intent or binary artifacts',async()=>{
    const memory=memoryFiles(),local=vi.fn(()=>{throw new Error('must not use localStorage')})
    vi.stubGlobal('localStorage',{getItem:local,setItem:local})
    try {
      const fixture=harness(),store=createSyncStore(memory.files,'mock'),a=await createArtifact(fixture.race,cloud)
      await store.saveArtifact(fixture.race.id,a);expect((await store.artifact(fixture.race.id))!.bytes).toEqual(a.bytes)
      expect(local).not.toHaveBeenCalled()
    } finally {vi.unstubAllGlobals()}
  })
})
