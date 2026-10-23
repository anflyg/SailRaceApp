/// <reference types="node" />
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'fflate'
import { createArtifact, unbase64 } from './artifact'
import { createMockWorker, syntheticSession } from './mockWorker'
import { WorkerClient, nativeWorkerTransport } from './workerClient'
import { harness, response } from './testSupport'
import { LIMITS } from './types'
const cloud='20000000-0000-4000-8000-000000000071'
describe('typed authenticated Worker HTTP adapter',()=>{
  it('accepts 200 prepared retries and only confirms the exact finalized race',async()=>{
    const h=harness(),intent=await h.api.issue(syntheticSession.ownerId),id=await h.api.create(syntheticSession.ownerId,intent),a=await createArtifact(h.race,id)
    expect(await h.api.prepare(syntheticSession.ownerId,a)).toBe('prepared')
    expect(await h.api.prepare(syntheticSession.ownerId,a)).toBe('prepared')
    await h.api.content(syntheticSession.ownerId,a);await h.api.finalize(syntheticSession.ownerId,a)
    expect(await h.api.prepare(syntheticSession.ownerId,a)).toBe('accepted')
    expect(h.worker.requests.filter(r=>r.path.endsWith('/content'))[0].headers['Content-Encoding']).toBeUndefined()
  })
  it('refreshes once on 401 without changing the owner and never persists bearer tokens',async()=>{
    const h=harness();h.runtime.session={...syntheticSession,accessToken:'expired'}
    h.sessions.current.mockImplementation(async refresh=>{if(refresh)h.runtime.session={...syntheticSession};return h.runtime.session})
    expect((await h.engine.sync(h.race.id)).status).toBe('accepted')
    expect(h.sessions.current.mock.calls.filter(([r])=>r)).toHaveLength(1)
    expect([...h.memory.values.values()].join('')).not.toContain('synthetic-session-only')
  })
  it('stops when refresh is unavailable or changes the authenticated owner',async()=>{
    const h=harness();h.runtime.session={...syntheticSession,accessToken:'expired'}
    h.sessions.current.mockImplementation(async refresh=>refresh?null:h.runtime.session)
    await expect(h.api.issue(syntheticSession.ownerId)).rejects.toThrow('unauthorized')
    expect(h.transport.request).toHaveBeenCalledTimes(1)
    h.sessions.current.mockImplementation(async refresh=>refresh?{...syntheticSession,ownerId:crypto.randomUUID()}:h.runtime.session)
    await expect(h.api.issue(syntheticSession.ownerId)).rejects.toThrow('account_changed')
  })
  it('sanitizes session-provider failures without exposing token diagnostics',async()=>{
    const h=harness();h.sessions.current.mockRejectedValue(new Error('PRIVATE session token diagnostics'))
    await expect(h.api.owner()).rejects.toThrow('upstream_unavailable')
    expect(h.transport.request).not.toHaveBeenCalled()
  })
  it('rejects wrong-owner intent, changed expiry and unapproved response fields',async()=>{
    for(const change of ['owner','expiry','extra']) {
      const h=harness()
      h.intercept(async(_r,next)=>{const r=await next(),v=JSON.parse(r.body)
        if(change==='owner')v.creationIntent=v.creationIntent.replace(v.creationIntent.split('.')[2],btoa(JSON.stringify({version:1,intentId:crypto.randomUUID(),ownerId:crypto.randomUUID(),issuedAt:Date.parse(v.issuedAt)/1000,expiresAt:Date.parse(v.expiresAt)/1000})).replaceAll('=',''))
        if(change==='expiry')v.expiresAt=new Date(Date.parse(v.expiresAt)+1000).toISOString()
        if(change==='extra')v.ownerId=syntheticSession.ownerId
        return {...r,body:JSON.stringify(v)}
      })
      await expect(h.api.issue(syntheticSession.ownerId)).rejects.toThrow('invalid_request')
    }
  })
  it('rejects foreign race IDs and content URLs and does not follow the URL from prepare',async()=>{
    const h=harness(),intent=await h.api.issue(syntheticSession.ownerId),id=await h.api.create(syntheticSession.ownerId,intent),a=await createArtifact(h.race,id)
    h.intercept(async(_r,next)=>{const r=await next(),v=JSON.parse(r.body);v.contentUrl='https://forbidden.invalid/upload';return {...r,body:JSON.stringify(v)}})
    await expect(h.api.prepare(syntheticSession.ownerId,a)).rejects.toThrow('upstream_unavailable')
    h.intercept(async(_r,next)=>{const r=await next(),v=JSON.parse(r.body);v.raceId=cloud;return {...r,body:JSON.stringify(v)}})
    await expect(h.api.prepare(syntheticSession.ownerId,a)).rejects.toThrow('race_conflict')
  })
  it('sanitizes malformed/oversized error bodies, unknown statuses and diagnostics',async()=>{
    for(const r of [response(500,'SECRET'),{status:503,headers:{},body:'SECRET'},
      {status:503,headers:{},body:'x'.repeat(9000)},response(403,'unknown')]) {
      const h=harness();h.intercept(async()=>r)
      await expect(h.api.issue(syntheticSession.ownerId)).rejects.toThrow('upstream_unavailable')
    }
  })
  it('does not mistake a successful content PUT or malformed finalize for accepted',async()=>{
    const h=harness()
    h.intercept(async(req,next)=>req.path.endsWith('/finalize')?{status:200,headers:{},body:JSON.stringify({requestId:'synthetic',raceId:cloud,uploadState:'accepted',syncState:'ready',consumedFreeRace:true})}:next())
    expect((await h.engine.sync(h.race.id)).status).not.toBe('accepted')
    expect([...h.worker.races.values()][0].bytes).toBeDefined()
  })
  it('restores the synthetic external provider separately from the app',async()=>{
    const h=harness(),intent=await h.api.issue(syntheticSession.ownerId),id=await h.api.create(syntheticSession.ownerId,intent)
    const restored=createMockWorker(()=>h.runtime.time,h.worker.snapshot()),api=new WorkerClient(restored.transport,h.sessions)
    expect(await api.create(syntheticSession.ownerId,intent)).toBe(id)
  })
})
describe('existing Capacitor native binary transport',()=>{
  it('passes genuine gzip as base64 file data with exact Content-Length, no encoding or redirects',async()=>{
    const h=harness(),a=await createArtifact(h.race,cloud),request=vi.fn().mockResolvedValue({status:204,headers:{},data:'',url:`https://isolated.invalid/v1/races/${cloud}/upload/content`})
    const transport=nativeWorkerTransport('https://isolated.invalid',request,()=> 'ios')
    await transport.request({path:`/v1/races/${cloud}/upload/content`,method:'PUT',body:a.bytes,
      headers:{Authorization:'Bearer synthetic','Content-Type':'application/gzip','Content-Length':String(a.bytes.length)}})
    const options=request.mock.calls[0][0]
    expect(options).toMatchObject({dataType:'file',disableRedirects:true,connectTimeout:15000,readTimeout:30000})
    expect(unbase64(options.data)).toEqual(a.bytes);expect(gunzipSync(unbase64(options.data)).length).toBeGreaterThan(0)
    expect(options.headers['Content-Encoding']).toBeUndefined();expect(options.headers['Content-Length']).toBe(String(a.bytes.length))
  })
  it('has no web fallback and rejects invalid origins, encoding and mismatched length before dispatch',async()=>{
    const request=vi.fn(),wire={path:`/v1/races/${cloud}/upload/content`,method:'PUT' as const,body:new Uint8Array([1]),headers:{'Content-Type':'application/gzip','Content-Length':'1'}}
    for(const origin of ['http://example.invalid','https://example.invalid/path','https://user:pass@example.invalid','https://example.invalid?x=1'])
      expect(()=>nativeWorkerTransport(origin,request,()=> 'ios')).toThrow('transport_unavailable')
    await expect(nativeWorkerTransport('https://isolated.invalid',request,()=> 'web').request(wire)).rejects.toThrow('transport_unavailable')
    const transport=nativeWorkerTransport('https://isolated.invalid',request,()=> 'ios')
    for(const headers of [{...wire.headers,'Content-Encoding':'gzip'},{...wire.headers,'Content-Length':'999'}])
      await expect(transport.request({...wire,headers})).rejects.toThrow('invalid_request')
    await expect(transport.request({...wire,body:new Uint8Array(LIMITS.compressedBytes+1)})).rejects.toThrow('invalid_request')
    expect(request).not.toHaveBeenCalled()
  })
  it('accepts the native empty 204 representation and refuses changed gzip before sending',async()=>{
    const h=harness(),a=await createArtifact(h.race,cloud),request=vi.fn().mockResolvedValue({status:204,headers:{},data:undefined})
    const transport=nativeWorkerTransport('https://isolated.invalid',request,()=> 'ios')
    const api=new WorkerClient(transport,h.sessions)
    await api.content(syntheticSession.ownerId,a)
    expect(request).toHaveBeenCalledOnce()
    await expect(api.content(syntheticSession.ownerId,{...a,bytes:new Uint8Array(a.bytes.length)})).rejects.toThrow('artifact_missing')
    expect(request).toHaveBeenCalledOnce()
  })
  it('checks the pinned native implementation rather than assuming browser header behavior',()=>{
    const swift=readFileSync(new URL('../../../node_modules/@capacitor/ios/Capacitor/Capacitor/Plugins/CapacitorUrlRequest.swift',import.meta.url),'utf8')
    expect(swift).toContain('dataType == "file"');expect(swift).toContain('Data(base64Encoded: stringData)');expect(swift).toContain('request.httpBody =')
    expect(swift).toContain('disableRedirects')
  })
})
