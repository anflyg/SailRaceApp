// Offline protocol simulator only. It is never selected for local user recordings.
// Its in-memory provider state is not R2/SQL/HMAC or transport evidence.
import { gunzipSync, strFromU8, strToU8 } from 'fflate'
import { base64, unbase64, digest, timestamp, validatePrepare, validateRaw } from './artifact'
import { LIMITS, record, type PrepareRequest, type WireRequest, type WireResponse, type WorkerTransport } from './types'
export const syntheticOwner='10000000-0000-4000-8000-000000000071'
export const syntheticSession={ownerId:syntheticOwner,accessToken:'synthetic-session-only'}
export interface MockSnapshot {
  intents: Array<[string,{expires:number;raceId?:string}]>
  races: Array<[string,{prepare?:PrepareRequest;bytes?:string;accepted:boolean}]>
}
export function createMockWorker(now:()=>number=Date.now, snapshot?:MockSnapshot) {
  const intents=new Map<string,{expires:number;raceId?:string}>(),races=new Map<string,{prepare?:PrepareRequest;bytes?:Uint8Array;accepted:boolean}>()
  if(snapshot) {
    for(const [key,value] of snapshot.intents)intents.set(key,value)
    for(const [key,value] of snapshot.races)races.set(key,{...value,bytes:value.bytes?unbase64(value.bytes):undefined})
  }
  const requests:WireRequest[]=[]
  const answer=(status:number,body:object):WireResponse=>({status,headers:{},body:JSON.stringify({requestId:'synthetic-request',...body})})
  const error=(status:number,code:string)=>answer(status,{code})
  const accepted=(raceId:string)=>answer(200,{raceId,uploadState:'accepted',syncState:'uploaded',consumedFreeRace:true})
  const transport:WorkerTransport={mode:'mock',async request(request) {
    requests.push({...request,body:request.body instanceof Uint8Array?Uint8Array.from(request.body):request.body})
    if(request.headers.Authorization!==`Bearer ${syntheticSession.accessToken}`)return error(401,'unauthorized')
    const value=typeof request.body==='string'?JSON.parse(request.body):null
    if(request.path==='/v1/race-creation-intents'&&request.method==='POST') {
      if(!record(value)||Object.keys(value).length)return error(400,'invalid_request')
      const issuedAt=Math.floor(now()/1000),expiresAt=issuedAt+86400
      const payload=base64(strToU8(JSON.stringify({version:1,intentId:crypto.randomUUID(),ownerId:syntheticOwner,issuedAt,expiresAt}))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','')
      const creationIntent=`twci1.mock.${payload}.synthetic_signature`
      intents.set(creationIntent,{expires:expiresAt*1000})
      return answer(201,{creationIntent,issuedAt:new Date(issuedAt*1000).toISOString(),expiresAt:new Date(expiresAt*1000).toISOString()})
    }
    if(request.path==='/v1/races'&&request.method==='POST') {
      if(!record(value)||Object.keys(value).join()!=='creationIntent')return error(400,'invalid_request')
      const intent=intents.get(String(value.creationIntent))
      if(!intent||now()>=intent.expires)return error(400,'invalid_request')
      if(intent.raceId)return answer(200,{raceId:intent.raceId})
      intent.raceId=crypto.randomUUID();races.set(intent.raceId,{accepted:false})
      return answer(201,{raceId:intent.raceId})
    }
    const match=/^\/v1\/races\/([0-9a-f-]{36})\/upload(\/content|\/finalize)?$/.exec(request.path)
    if(!match)return error(400,'invalid_request')
    const [,raceId,suffix]=match,race=races.get(raceId)
    if(!race)return error(404,'upload_not_found')
    if(!suffix&&request.method==='POST') {
      if(!validatePrepare(value))return error(400,'invalid_request')
      if(race.prepare&&JSON.stringify(race.prepare)!==JSON.stringify(value))return error(409,'race_conflict')
      if(race.accepted)return accepted(raceId)
      const created=!race.prepare;race.prepare=value as PrepareRequest
      return answer(created?201:200,{raceId,uploadState:'prepared',contentUrl:`/v1/races/${raceId}/upload/content`,expiresAt:new Date(now()+86400000).toISOString(),limits:LIMITS})
    }
    if(suffix==='/content'&&request.method==='PUT') {
      const bytes=request.body
      if(!race.prepare)return error(404,'upload_not_found')
      if(request.headers['Content-Type']!=='application/gzip'||request.headers['Content-Encoding']!==undefined)return error(415,'unsupported_media_type')
      if(!(bytes instanceof Uint8Array)||request.headers['Content-Length']!==String(bytes.length)||bytes.length!==race.prepare.compressedBytes)return error(400,'invalid_request')
      if(await digest(bytes)!==race.prepare.rawSha256)return error(422,'invalid_race_payload')
      try {
        const json=gunzipSync(bytes)
        if(json.length>LIMITS.expandedBytes)return error(413,'payload_too_large')
        const raw:unknown=JSON.parse(strFromU8(json))
        if(!validateRaw(raw)||!record(raw)||raw.raceId!==raceId||timestamp(raw.recordingStartedAt)!==timestamp(race.prepare.startedAt)||timestamp(raw.endedAt)!==timestamp(race.prepare.endedAt))return error(422,'invalid_race_payload')
      } catch { return error(422,'invalid_race_payload') }
      if(race.bytes&&await digest(race.bytes)!==await digest(bytes))return error(409,'race_conflict')
      race.bytes=Uint8Array.from(bytes)
      return {status:204,body:'',headers:{'x-request-id':'synthetic-request'}}
    }
    if(suffix==='/finalize'&&request.method==='POST') {
      if(!record(value)||Object.keys(value).sort().join()!=='rawFormatVersion,rawSha256'||value.rawFormatVersion!==1||value.rawSha256!==race.prepare?.rawSha256)return error(409,'race_conflict')
      if(!race.bytes)return error(404,'upload_not_found')
      race.accepted=true;return accepted(raceId)
    }
    return error(400,'invalid_request')
  }}
  return {transport,requests,races,intents,snapshot:():MockSnapshot=>({intents:[...intents],races:[...races].map(([k,v])=>[k,{...v,bytes:v.bytes?base64(v.bytes):undefined}])})}
}
