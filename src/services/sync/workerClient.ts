import { Capacitor, CapacitorHttp } from '@capacitor/core'
import type { HttpOptions, HttpResponse } from '@capacitor/core'
import { base64, timestamp, unbase64, validateAccepted, validatePrepared, verifyArtifact } from './artifact'
import { LIMITS, SyncError, record, uuid, type Artifact, type Intent, type Session, type SessionProvider, type SyncErrorCode, type WireResponse, type WorkerTransport } from './types'
const errors: Record<number, SyncErrorCode[]> = {
  400:['invalid_request'],401:['unauthorized'],403:['cloud_access_unavailable'],404:['upload_not_found'],409:['race_conflict'],410:['upload_expired'],
  413:['payload_too_large'],415:['unsupported_media_type'],422:['invalid_race_payload'],429:['rate_limited'],502:['upstream_unavailable'],503:['upstream_unavailable'],
}
function json(response: WireResponse): Record<string,unknown> {
  try { if(new TextEncoder().encode(response.body).length>8192)throw new Error();const v:unknown=JSON.parse(response.body)
    if(!record(v)||typeof v.requestId!=='string'||v.requestId.length<1||v.requestId.length>128)throw new Error();return v
  } catch { throw new SyncError('upstream_unavailable') }
}
export function checkIntent(value: unknown, ownerId: string): Intent {
  try {
    if(!record(value)||Object.keys(value).sort().join()!=='creationIntent,expiresAt,issuedAt,requestId' || typeof value.creationIntent!=='string'
      || value.creationIntent.length>1024||!/^twci1\.[A-Za-z0-9_-]{1,32}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value.creationIntent))throw new Error()
    const issued=timestamp(value.issuedAt),expires=timestamp(value.expiresAt)
    if(expires-issued!==86400000)throw new Error()
    const part=value.creationIntent.split('.')[2],payload:unknown=JSON.parse(new TextDecoder().decode(unbase64(part.replaceAll('-','+').replaceAll('_','/'))))
    // Association/shape check only. Only the Worker verifies the HMAC.
    if(!record(payload)||payload.ownerId!==ownerId||payload.version!==1||!uuid.test(String(payload.intentId))
      || payload.issuedAt!==issued/1000||payload.expiresAt!==expires/1000)throw new Error()
    return {creationIntent:value.creationIntent,issuedAt:value.issuedAt as string,expiresAt:value.expiresAt as string}
  } catch { throw new SyncError('invalid_request') }
}
export class WorkerClient {
  readonly mode: WorkerTransport['mode']
  private transport: WorkerTransport
  private sessions: SessionProvider
  constructor(transport: WorkerTransport, sessions: SessionProvider) { this.mode=transport.mode;this.transport=transport;this.sessions=sessions }
  private async current(refresh=false):Promise<Session|null> {
    try {return await this.sessions.current(refresh)} catch {throw new SyncError('upstream_unavailable')}
  }
  async owner(): Promise<string> {
    const s=await this.current();if(!s||!uuid.test(s.ownerId)||!s.accessToken)throw new SyncError('unauthorized');return s.ownerId
  }
  private async send(ownerId:string,path:string,body:object|Uint8Array,binary=false):Promise<WireResponse> {
    for(let refresh=0;refresh<2;refresh++) {
      const session=await this.current(refresh===1)
      if(!session||!session.accessToken)throw new SyncError('unauthorized')
      if(session.ownerId!==ownerId)throw new SyncError('account_changed')
      const data=binary?body as Uint8Array:JSON.stringify(body)
      if(!binary && new TextEncoder().encode(data as string).length>2048)throw new SyncError('invalid_request')
      let response:WireResponse
      try { response=await this.transport.request({path,method:binary?'PUT':'POST',body:data,
        headers:{Authorization:`Bearer ${session.accessToken}`,'Content-Type':binary?'application/gzip':'application/json',
          ...(binary?{'Content-Length':String((body as Uint8Array).length)}:{})}}) }
      catch(e) { if(e instanceof SyncError && e.code==='transport_unavailable')throw e;throw new SyncError('upstream_unavailable') }
      if(await this.owner()!==ownerId)throw new SyncError('account_changed')
      if(response.status===401&&refresh===0)continue
      if(response.status>=200&&response.status<300)return response
      const v=json(response),code=String(v.code) as SyncErrorCode
      if(Object.keys(v).sort().join()!=='code,requestId'||!errors[response.status]?.includes(code))throw new SyncError('upstream_unavailable')
      const retry=Object.entries(response.headers).find(([k])=>k.toLowerCase()==='retry-after')?.[1]
      const retryAfterMs=retry&&/^\d+$/.test(retry)?Math.min(Number(retry)*1000,86400000):0
      throw new SyncError(code,retryAfterMs)
    }
    throw new SyncError('unauthorized')
  }
  async issue(owner:string):Promise<Intent> {
    const r=await this.send(owner,'/v1/race-creation-intents',{})
    if(r.status!==201)throw new SyncError('upstream_unavailable')
    return checkIntent(json(r),owner)
  }
  async create(owner:string,intent:Intent):Promise<string> {
    const r=await this.send(owner,'/v1/races',{creationIntent:intent.creationIntent}),v=json(r)
    if(![200,201].includes(r.status)||Object.keys(v).sort().join()!=='raceId,requestId'||!uuid.test(String(v.raceId))||String(v.raceId)[14]!=='4')throw new SyncError('upstream_unavailable')
    return v.raceId as string
  }
  async prepare(owner:string,a:Artifact):Promise<'prepared'|'accepted'> {
    const r=await this.send(owner,`/v1/races/${a.cloudRaceId}/upload`,a.prepare),v=json(r)
    if(v.raceId!==a.cloudRaceId)throw new SyncError('race_conflict')
    if(r.status===200&&validateAccepted(v))return 'accepted'
    if(![200,201].includes(r.status)||!validatePrepared(v)||v.contentUrl!==`/v1/races/${a.cloudRaceId}/upload/content`)throw new SyncError('upstream_unavailable')
    timestamp(v.expiresAt);return 'prepared'
  }
  async content(owner:string,a:Artifact):Promise<void> {
    await verifyArtifact(a,a.cloudRaceId)
    if(a.bytes.length!==a.prepare.compressedBytes||a.bytes.length>LIMITS.compressedBytes)throw new SyncError('invalid_race_payload')
    const r=await this.send(owner,`/v1/races/${a.cloudRaceId}/upload/content`,a.bytes,true)
    if(r.status!==204||r.body!=='')throw new SyncError('upstream_unavailable')
  }
  async finalize(owner:string,a:Artifact):Promise<void> {
    const r=await this.send(owner,`/v1/races/${a.cloudRaceId}/upload/finalize`,{rawFormatVersion:1,rawSha256:a.prepare.rawSha256}),v=json(r)
    if(r.status!==200||!validateAccepted(v)||v.raceId!==a.cloudRaceId)throw new SyncError('race_conflict')
  }
}

/** Never instantiated by the shipped app. Requires future reviewed session +
 * exact nonproduction origin injection. No browser fallback or default URL. */
export function nativeWorkerTransport(origin:string, request:(options:HttpOptions)=>Promise<HttpResponse>=CapacitorHttp.request,
  platform:()=>string=()=>Capacitor.getPlatform()):WorkerTransport {
  let url:URL
  try {url=new URL(origin)} catch {throw new SyncError('transport_unavailable')}
  if(url.protocol!=='https:'||url.origin!==origin||url.username||url.password)throw new SyncError('transport_unavailable')
  return {mode:'worker',async request(wire) {
    if(platform()!=='ios')throw new SyncError('transport_unavailable')
    if(!/^\/v1\/(race-creation-intents|races(?:\/[0-9a-f-]{36}\/upload(?:\/content|\/finalize)?)?)$/.test(wire.path))throw new SyncError('invalid_request')
    const binary=wire.body instanceof Uint8Array
    if(Object.keys(wire.headers).some(k=>k.toLowerCase()==='content-encoding') || (binary && (wire.headers['Content-Type']!=='application/gzip'
      || wire.headers['Content-Length']!==String(wire.body.length) || wire.body.length>LIMITS.compressedBytes)))throw new SyncError('invalid_request')
    const response=await request({url:origin+wire.path,method:wire.method,headers:wire.headers,
      data:binary?base64(wire.body as Uint8Array):wire.body,...(binary?{dataType:'file' as const}:{}),
      responseType:'text',disableRedirects:true,connectTimeout:15000,readTimeout:30000})
    if(response.url&&response.url!==origin+wire.path)throw new SyncError('upstream_unavailable')
    return {status:response.status,headers:response.headers,body:typeof response.data==='string'?response.data:response.data==null?'':JSON.stringify(response.data)}
  }}
}
