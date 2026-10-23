import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { strToU8 } from 'fflate'
import { base64, digest, unbase64, validatePrepare, verifyArtifact } from './artifact'
import { LIMITS, SyncError, record, uuid, type Artifact, type SyncState, type SyncStore } from './types'

export interface PrivateFiles { read(key: string): Promise<string | null>; write(key: string, value: string): Promise<void>; remove(key: string): Promise<void> }
export const localKey = (localRaceId: string) => digest(strToU8(localRaceId))
const statuses = ['recorded_local','queued','syncing','blocked_entitlement','invalid','accepted']
const steps = ['issue','create','artifact','prepare','content','finalize','done']
/** Namespace separates synthetic receipts from real cloud state permanently. */
export function createSyncStore(files: PrivateFiles, mode: 'mock' | 'worker'): SyncStore {
  const path = async(id: string, kind: string) => `${mode}-${await localKey(id)}-${kind}`
  async function read(key: string, max: number): Promise<unknown | null> {
    try { const text = await files.read(key); if (text === null) return null
      if (text.length > max) throw new Error(); return JSON.parse(text)
    } catch { throw new SyncError('storage_unavailable') }
  }
  return {
    mode,
    async state(id) {
      const v = await read(await path(id,'state'),8192)
      if (v === null) return null
      const allowed=['version','mode','localRaceId','ownerId','status','step','intent','issuancePending','cloudRaceId','artifactRef','artifact','attempts','nextAttemptAt','error','acceptedAt']
      if (!record(v) || Object.keys(v).some(k=>!allowed.includes(k)) || v.version !== 1 || v.mode !== mode || v.localRaceId !== id || !uuid.test(String(v.ownerId))
        || !statuses.includes(String(v.status)) || !steps.includes(String(v.step)) || !Number.isInteger(v.attempts) || Number(v.attempts)<0
        || (v.issuancePending!==undefined&&typeof v.issuancePending!=='boolean')
        || (v.nextAttemptAt!==undefined&&(!Number.isSafeInteger(v.nextAttemptAt)||Number(v.nextAttemptAt)<0))
        || (v.error!==undefined&&typeof v.error!=='string')
        || (v.step==='create'&&!v.intent&&!v.cloudRaceId)
        || (['artifact','prepare','content','finalize','done'].includes(String(v.step))&&!v.cloudRaceId)
        || (v.artifact!==undefined&&v.artifactRef!==await localKey(id))
        || (v.cloudRaceId !== undefined && (!uuid.test(String(v.cloudRaceId))||String(v.cloudRaceId)[14]!=='4')) || (v.artifact !== undefined && !validatePrepare(v.artifact))
        || (v.status === 'accepted' && (v.step !== 'done' || !v.cloudRaceId || !v.artifact || typeof v.acceptedAt !== 'string'))
        || (v.intent !== undefined && (!record(v.intent) || typeof v.intent.creationIntent !== 'string' || v.intent.creationIntent.length>1024
          || typeof v.intent.expiresAt !== 'string' || typeof v.intent.issuedAt !== 'string'))) throw new SyncError('storage_unavailable')
      return v as unknown as SyncState
    },
    async save(state) {
      try { const text=JSON.stringify(state);if(text.length>8192)throw new Error();await files.write(await path(state.localRaceId,'state'),text) }
      catch { throw new SyncError('storage_unavailable') }
    },
    async artifact(id) {
      const v = await read(await path(id,'artifact'),Math.ceil(LIMITS.compressedBytes*4/3)+4096)
      if (v === null) return null
      try {
        if (!record(v) || typeof v.bytes !== 'string' || typeof v.cloudRaceId !== 'string' || !uuid.test(v.cloudRaceId) || !validatePrepare(v.prepare)) throw new Error()
        const artifact:Artifact={bytes:unbase64(v.bytes),prepare:v.prepare as Artifact['prepare'],cloudRaceId:v.cloudRaceId}
        await verifyArtifact(artifact,artifact.cloudRaceId);return artifact
      } catch { throw new SyncError('artifact_missing') }
    },
    async saveArtifact(id, artifact) {
      await verifyArtifact(artifact,artifact.cloudRaceId)
      const existing = await this.artifact(id)
      if (existing) {
        await verifyArtifact(existing,artifact.cloudRaceId,artifact.prepare)
        if (base64(existing.bytes)!==base64(artifact.bytes))throw new SyncError('race_conflict')
        return
      }
      try { await files.write(await path(id,'artifact'),JSON.stringify({...artifact,bytes:base64(artifact.bytes)})) }
      catch { throw new SyncError('storage_unavailable') }
    },
    async removeArtifact(id) {
      // Local-only removal. Keep association/accepted receipt. Never call cloud deletion.
      try { await files.remove(await path(id,'artifact')) } catch { throw new SyncError('storage_unavailable') }
    },
  }
}

type NativeFilesystem = Pick<typeof Filesystem,'readFile'|'writeFile'|'readdir'|'rename'|'deleteFile'>
const root='TackWiseSyncV1'
const absent = (e: unknown) => record(e) && e.code === 'OS-PLUG-FILE-0008'
/** Library is persistent app-private iOS storage; never Documents or Cache. */
export function nativePrivateFiles(fs: NativeFilesystem = Filesystem): PrivateFiles {
  function assertKey(key: string) { if(!/^(mock|worker)-[0-9a-f]{64}-(state|artifact)$/.test(key))throw new SyncError('storage_unavailable') }
  async function versions(key:string) {
    assertKey(key)
    try { const {files}=await fs.readdir({path:root,directory:Directory.Library})
      return files.filter(f=>new RegExp(`^${key}\\.[0-9]+\\.json$`).test(f.name)).sort((a,b)=>Number(b.name.split('.').at(-2))-Number(a.name.split('.').at(-2)))
    } catch(e) { if(absent(e))return [];throw new SyncError('storage_unavailable') }
  }
  return {
    async read(key) {
      const [latest]=await versions(key);if(!latest)return null
      // A missing/corrupt committed file is not permission to forget cloud identity.
      const {data}=await fs.readFile({path:`${root}/${latest.name}`,directory:Directory.Library,encoding:Encoding.UTF8})
      if(typeof data!=='string')throw new SyncError('storage_unavailable');return data
    },
    async write(key,value) {
      const previous=await versions(key),revision=Number(previous[0]?.name.split('.').at(-2)??0)+1
      const temp=`${root}/${key}.${crypto.randomUUID()}.tmp`,to=`${root}/${key}.${revision}.json`
      await fs.writeFile({path:temp,directory:Directory.Library,encoding:Encoding.UTF8,data:value,recursive:true})
      // Rename to a NEW filename on the same filesystem; never replace the last
      // committed checkpoint before the new one is visible. Ignore temp files.
      await fs.rename({from:temp,to,directory:Directory.Library,toDirectory:Directory.Library})
      try {
        const {files}=await fs.readdir({path:root,directory:Directory.Library})
        for(const file of files.filter(f=>f.name.startsWith(key+'.')&&`${root}/${f.name}`!==to)) {
          try { await fs.deleteFile({path:`${root}/${file.name}`,directory:Directory.Library}) } catch { /* New checkpoint remains authoritative. */ }
        }
      } catch { /* Checkpoint committed; cleanup can retry on next save. */ }
    },
    async remove(key) {
      assertKey(key)
      let files
      try {files=(await fs.readdir({path:root,directory:Directory.Library})).files} catch(e){if(absent(e))return;throw e}
      for(const file of files.filter(f=>f.name.startsWith(key+'.')))await fs.deleteFile({path:`${root}/${file.name}`,directory:Directory.Library})
    },
  }
}
/** Web synthetic demo uses transactional IndexedDB, never localStorage. */
export function indexedPrivateFiles(): PrivateFiles {
  let connection: Promise<IDBDatabase> | undefined
  function db() { return connection ??= new Promise((resolve,reject)=>{
    const request=indexedDB.open('tackwise-sync-v1',1)
    request.onupgradeneeded=()=>request.result.createObjectStore('files')
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(new SyncError('storage_unavailable'))
  }) }
  async function operation(key:string,value?:string,remove=false):Promise<string|null> {
    const database=await db()
    return new Promise((resolve,reject)=>{
      const tx=database.transaction('files',value!==undefined||remove?'readwrite':'readonly'),store=tx.objectStore('files')
      const request=remove?store.delete(key):value!==undefined?store.put(value,key):store.get(key)
      let result:string|null=null
      request.onsuccess=()=>{result=typeof request.result==='string'?request.result:null}
      tx.oncomplete=()=>resolve(result);tx.onerror=tx.onabort=()=>reject(new SyncError('storage_unavailable'))
    })
  }
  return {read:key=>operation(key),async write(key,value){await operation(key,value)},async remove(key){await operation(key,undefined,true)}}
}
export function privateSyncStore(mode:'mock'|'worker'): SyncStore {
  return createSyncStore(Capacitor.isNativePlatform()?nativePrivateFiles():indexedPrivateFiles(),mode)
}
