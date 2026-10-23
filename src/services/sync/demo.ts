import { Capacitor } from '@capacitor/core'
import { RaceSyncCoordinator } from './coordinator'
import { createSyncStore, indexedPrivateFiles, localKey, nativePrivateFiles } from './storage'
import { createMockWorker, syntheticSession } from './mockWorker'
import type { MockSnapshot } from './mockWorker'
import { syntheticRace } from './syntheticRace'
import { WorkerClient } from './workerClient'
/** Separate persistent fake server, modeling an external Worker surviving app restart. */
export async function createSyntheticDemo() {
  const files=Capacitor.isNativePlatform()?nativePrivateFiles():indexedPrivateFiles()
  const key=`mock-${await localKey('synthetic-provider-v1')}-state`,saved=await files.read(key)
  const worker=createMockWorker(Date.now,saved?JSON.parse(saved) as MockSnapshot:undefined)
  const transport={mode:'mock' as const,async request(...args:Parameters<typeof worker.transport.request>){
    const response=await worker.transport.request(...args)
    await files.write(key,JSON.stringify(worker.snapshot()))
    return response
  }}
  return new RaceSyncCoordinator({store:createSyncStore(files,'mock'),api:new WorkerClient(transport,{current:async()=>syntheticSession}),
    race:id=>id===syntheticRace.id?syntheticRace:null,activeRace:()=>null,online:()=>true,now:Date.now,
    sleep:ms=>new Promise(r=>setTimeout(r,ms)),random:Math.random})
}
