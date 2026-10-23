import { vi } from 'vitest'
import type { Race } from '../../types'
import { RaceSyncCoordinator } from './coordinator'
import { createMockWorker, syntheticSession } from './mockWorker'
import { createSyncStore, type PrivateFiles } from './storage'
import { syntheticRace } from './syntheticRace'
import type { Session, WireRequest, WireResponse } from './types'
import { WorkerClient } from './workerClient'
export function memoryFiles() {
  const values=new Map<string,string>()
  const files:PrivateFiles={read:async k=>values.get(k)??null,async write(k,v){values.set(k,v)},async remove(k){values.delete(k)}}
  return {files,values}
}
export function harness() {
  const race:Race=structuredClone(syntheticRace);race.id=crypto.randomUUID();race.name='PRIVATE NAME';race.dayId='LOCAL DAY'
  const memory=memoryFiles(),store=createSyncStore(memory.files,'mock')
  const runtime={time:Date.parse('2026-01-02T12:00:00.000Z'),online:true,active:null as string|null,session:{...syntheticSession} as Session|null}
  const worker=createMockWorker(()=>runtime.time)
  let intercept:((request:WireRequest,next:()=>Promise<WireResponse>)=>Promise<WireResponse>)|undefined
  const transport={mode:'mock' as const,request:vi.fn((request:WireRequest)=>intercept?intercept(request,()=>worker.transport.request(request)):worker.transport.request(request))}
  const sessions={current:vi.fn(async (_refresh?:boolean)=>runtime.session)}
  const api=new WorkerClient(transport,sessions)
  const sleep=vi.fn(async(ms:number)=>{runtime.time+=ms})
  const dependencies={store,api,race:(id:string)=>id===race.id?race:null,activeRace:()=>runtime.active,
    online:()=>runtime.online,now:()=>runtime.time,sleep,random:()=>0}
  const restart=()=>new RaceSyncCoordinator(dependencies)
  return {race,memory,store,runtime,worker,transport,sessions,api,sleep,dependencies,restart,engine:restart(),
    intercept:(f:typeof intercept)=>{intercept=f}}
}
export function barrier(){let release!:()=>void;const promise=new Promise<void>(r=>{release=r});return {promise,release}}
export const response=(status:number,code:string,headers:Record<string,string>={}):WireResponse=>({status,headers,body:JSON.stringify({requestId:'synthetic-error',code})})
