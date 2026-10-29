import { spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { chromium } from 'playwright'
const host='127.0.0.1',port=4177,base=`http://${host}:${port}`
const server=spawn('npm',['run','dev','--','--host',host,'--port',String(port),'--strictPort'],{stdio:'pipe'})
const logs=[];server.stdout.on('data',b=>logs.push(String(b)));server.stderr.on('data',b=>logs.push(String(b)))
let browser
try {
  const deadline=Date.now()+15000
  while(true){try{if((await fetch(base)).ok)break}catch{}if(Date.now()>deadline)throw new Error('local sync validation server unavailable');await new Promise(r=>setTimeout(r,100))}
  browser=await chromium.launch({headless:true})
  const context=await browser.newContext({viewport:{width:393,height:852}})
  const page=await context.newPage(),external=[],errors=[]
  page.on('request',r=>{if(!r.url().startsWith(base))external.push(new URL(r.url()).origin)})
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(base)
  const initialLocal=await page.evaluate(async()=>{
    const {syntheticRace}=await import('/src/services/sync/syntheticRace.ts')
    const race={...syntheticRace,name:'Synthetic local recording'}
    const data=JSON.stringify({version:1,sailingDaysById:{[race.dayId]:{id:race.dayId,date:race.dayId,raceIds:[race.id]}},racesById:{[race.id]:race}})
    localStorage.setItem('aster-race:race-storage:v1',data);return data
  })
  await page.getByRole('button',{name:'Analys',exact:true}).click()
  assert.equal(await page.getByRole('button',{name:'Synkronisera',exact:true}).isDisabled(),true,'real sync must stay disabled')
  await page.getByText('Molnsynk för inspelade race kräver iPhone-appen',{exact:false}).waitFor()
  await page.getByRole('button',{name:'Öppna syntetiskt test',exact:true}).click()
  await page.getByRole('button',{name:'Synkronisera syntetiska data',exact:true}).click()
  await page.getByText('Syntetiskt test klart – ingen molnuppladdning',{exact:true}).waitFor()
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'phone horizontal overflow')
  assert.equal(await page.evaluate(()=>localStorage.getItem('aster-race:race-storage:v1')),initialLocal,'local recording changed')
  const localAfter=await page.evaluate(()=>Object.entries(localStorage))
  assert.equal(localAfter.some(([k,v])=>k.includes('sync')||v.includes('synthetic-session-only')||v.includes('twci1.')),false,'sync private material leaked to localStorage')
  await page.reload()
  await page.getByRole('button',{name:'Analys',exact:true}).click()
  await page.getByRole('button',{name:'Öppna syntetiskt test',exact:true}).click()
  await page.getByText('Syntetiskt test klart – ingen molnuppladdning',{exact:true}).waitFor()
  await page.setViewportSize({width:820,height:1180})
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'tablet horizontal overflow')
  await fs.mkdir('/private/tmp/tackwise-m2-evidence',{recursive:true})
  await page.screenshot({path:'/private/tmp/tackwise-m2-evidence/sync-tablet.png',fullPage:true})
  // Exercise the actual native composition and library button with an injected
  // native transport. All coordinates/accounts are fictional; no provider calls.
  await page.evaluate(async()=>{ window.__recordedSyncFixture=(await import('/test/recorded-sync-ui.tsx')).mountRecordedSyncFixture() })
  const recorded=page.locator('#recorded-sync-fixture'),action=recorded.getByRole('button',{name:'Synkronisera',exact:true}).first()
  await recorded.getByText('Logga in med Apple under Inställningar och återvänd hit.').first().waitFor()
  assert.equal(await action.isDisabled(),true,'signed-out upload must be disabled')
  assert.equal(await page.evaluate(()=>window.__recordedSyncFixture.requests()),0,'mount must not dispatch')
  await page.evaluate(()=>window.__recordedSyncFixture.signIn())
  await action.waitFor({state:'visible'})
  await page.evaluate(()=>window.__recordedSyncFixture.recording(true))
  await recorded.getByText('Väntar tills inspelningen är avslutad',{exact:true}).first().waitFor()
  assert.equal(await action.isDisabled(),true,'active recording must disable the library action')
  await page.evaluate(()=>window.__recordedSyncFixture.recording(false))
  await action.click()
  await recorded.getByText('Uppladdning är avstängd på servern',{exact:false}).first().waitFor()
  assert.equal((await page.evaluate(()=>window.__recordedSyncFixture.state())).issuancePending,false,'disabled gate must not poison retry')
  await page.evaluate(()=>{window.__recordedSyncFixture.enable();window.__recordedSyncFixture.loseContent(true)})
  await action.click()
  await recorded.getByText('Misslyckades – försök igen',{exact:true}).first().waitFor()
  const queued=await page.evaluate(()=>window.__recordedSyncFixture.state())
  assert.equal(queued.status,'queued')
  assert.equal(await page.evaluate(()=>window.__recordedSyncFixture.unchanged()),true,'failed upload changed local recordings')
  await page.evaluate(()=>window.__recordedSyncFixture.loseContent(false))
  await action.click()
  await recorded.getByText('Uppladdningen accepterad – lokal data finns kvar',{exact:true}).waitFor()
  assert.equal(await action.isDisabled(),true,'accepted upload must not be submitted again')
  assert.equal((await page.evaluate(()=>window.__recordedSyncFixture.state())).cloudRaceId,queued.cloudRaceId,'retry must retain cloud identity')
  assert.equal(await page.evaluate(()=>window.__recordedSyncFixture.unchanged()),true,'accepted upload changed local recordings')
  await page.evaluate(()=>window.__recordedSyncFixture.signOut())
  await recorded.getByText('Logga in med Apple under Inställningar och återvänd hit.').first().waitFor()
  assert.equal(await recorded.getByText('Uppladdningen accepterad – lokal data finns kvar',{exact:true}).count(),0,'logout must hide the account receipt')
  await page.evaluate(()=>window.__recordedSyncFixture.stop())
  assert.deepEqual(external,[],'synthetic demo must make no external requests')
  assert.deepEqual(errors,[],'browser errors')
  console.log(JSON.stringify({pass:true,syntheticEndToEnd:true,acceptedReceiptAfterReload:true,privateIndexedDB:true,noExternalRequests:true,phoneAndTablet:true,recordedLibraryAction:true,nativeInjectedRetry:true,recordingAndSignOutGuards:true}))
} catch(e){console.error(e instanceof Error?e.message:'sync validation failed');console.error(logs.join(''));process.exitCode=1}
finally {await browser?.close();server.kill('SIGTERM')}
