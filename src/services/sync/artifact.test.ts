/// <reference types="node" />
import { describe, expect, it } from 'vitest'
import { gunzipSync, strFromU8 } from 'fflate'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createArtifact, rawRace, validateCompletedRace, verifyArtifact } from './artifact'
import { LIMITS } from './types'
import { harness } from './testSupport'
const cloud='20000000-0000-4000-8000-000000000071'
describe('immutable raw-v1 artifact',()=>{
  it('creates genuine deterministic gzip and hashes the exact compressed bytes',async()=>{
    const h=harness(),a=await createArtifact(h.race,cloud),b=await createArtifact(h.race,cloud)
    expect(a.bytes.slice(0,3)).toEqual(new Uint8Array([31,139,8]))
    expect(a.bytes).toEqual(b.bytes);expect(a.prepare).toEqual(b.prepare)
    expect(createHash('sha256').update(a.bytes).digest('hex')).toBe(a.prepare.rawSha256)
    expect(a.prepare.compressedBytes).toBe(a.bytes.length)
    expect(JSON.parse(strFromU8(gunzipSync(a.bytes)))).toMatchObject({raceId:cloud,recordingStartedAt:h.race.createdAt,endedAt:h.race.endTime})
    expect(h.race.id).not.toBe(cloud)
  })
  it('maps only schema-approved fields and preserves recorded course/events',()=>{
    const h=harness();h.race.samples[0]={...h.race.samples[0],elapsedSeconds:0,vmgWindKnots:1,vmgCourseKnots:2,accuracy:3,headingDegrees:90}
    h.race.course={windwardMark:{latitude:0,longitude:0.01},marksEstimated:false,windDirectionDegrees:30}
    h.race.events=[{type:'layline-tack',timestamp:h.race.samples[1].timestamp,latitude:0,longitude:0,alphaDegrees:40,postTackHeadingDegrees:80,laylineVariant:'plus-alpha',target:'K1'}]
    const raw=rawRace(h.race,cloud),text=JSON.stringify(raw)
    for(const value of [h.race.id,h.race.name,h.race.dayId,'elapsedSeconds','vmgWindKnots','vmgCourseKnots','summary','windMeasurement'])expect(text).not.toContain(value)
    expect(raw.course).toEqual(h.race.course);expect(raw.events).toEqual(h.race.events)
  })
  it.each(['createdAt','endTime'] as const)('rejects missing required %s without inventing metadata',async field=>{
    const h=harness();Reflect.deleteProperty(h.race,field)
    await expect(createArtifact(h.race,cloud)).rejects.toThrow('invalid_race_payload')
  })
  it.each(['calendar','sample-order','sample-range','event-range','gun','empty','coordinate','nan','speed','heading'])('rejects invalid %s',async kind=>{
    const h=harness()
    if(kind==='calendar')h.race.createdAt='2026-02-30T12:00:00Z'
    if(kind==='sample-order')h.race.samples.reverse()
    if(kind==='sample-range')h.race.samples[0].timestamp='2025-12-31T12:00:00Z'
    if(kind==='event-range')h.race.events=[{type:'layline-tack',timestamp:'2027-01-01T00:00:00Z',latitude:0,longitude:0,alphaDegrees:40,postTackHeadingDegrees:80,laylineVariant:'plus-alpha',target:'K1'}]
    if(kind==='gun')h.race.startGunTime='2027-01-01T00:00:00Z'
    if(kind==='empty')h.race.samples=[]
    if(kind==='coordinate')h.race.samples[0].latitude=91
    if(kind==='nan')h.race.samples[0].speedKnots=NaN
    if(kind==='speed')h.race.samples[0].speedKnots=-1
    if(kind==='heading')h.race.samples[0].headingDegrees=360
    await expect(createArtifact(h.race,cloud)).rejects.toThrow('invalid_race_payload')
  })
  it('does not invent distance for a one-sample recording',()=>{
    const h=harness();h.race.samples=h.race.samples.slice(0,1)
    expect(()=>validateCompletedRace(h.race)).toThrow('invalid_race_payload')
  })
  it('checks sample/event limits before gzip and expanded bytes separately',async()=>{
    const h=harness();h.race.samples=Array.from({length:LIMITS.samples+1},()=>h.race.samples[0])
    await expect(createArtifact(h.race,cloud)).rejects.toThrow('payload_too_large')
    const h2=harness();h2.race.events=Array.from({length:LIMITS.events+1},()=>({type:'layline-tack' as const,timestamp:h2.race.createdAt,latitude:0,longitude:0,alphaDegrees:40,postTackHeadingDegrees:80,laylineVariant:'plus-alpha' as const,target:'K1' as const}))
    await expect(createArtifact(h2.race,cloud)).rejects.toThrow('payload_too_large')
    const full={...h2.race.samples[0],accuracy:1.2345678901234567e100,speedKnots:1.2345678901234567e100,nativeSpeedKnots:1.2345678901234567e100,
      positionSpeedKnots:1.2345678901234567e100,fusedSpeedKnots:1.2345678901234567e100,cogDegrees:123.12345678912345,headingDegrees:123.12345678912345,
      nativeCourseDegrees:123.12345678912345,positionCourseDegrees:123.12345678912345,fusedCourseDegrees:123.12345678912345,windDirectionDegrees:123.12345678912345}
    h2.race.events=[];h2.race.samples=Array.from({length:LIMITS.samples},()=>full)
    await expect(createArtifact(h2.race,cloud)).rejects.toThrow('payload_too_large')
  })
  it('rejects altered or missing immutable identity',async()=>{
    const a=await createArtifact(harness().race,cloud)
    await expect(verifyArtifact({...a,bytes:new Uint8Array(a.bytes.length)},cloud)).rejects.toThrow('artifact_missing')
    await expect(verifyArtifact(a,crypto.randomUUID())).rejects.toThrow('artifact_missing')
    await expect(verifyArtifact(a,cloud,{...a.prepare,rawSha256:'a'.repeat(64)})).rejects.toThrow('artifact_missing')
  })
  it('pins the authoritative raw schema byte-for-byte',()=>{
    const bytes=readFileSync(new URL('./contracts/raw-race-v1.schema.json',import.meta.url))
    expect(createHash('sha256').update(bytes).digest('hex')).toBe('d5d13c11a1c39544e27b4c106a6399a481349990bd55de0fb498573587bd1e03')
  })
})
