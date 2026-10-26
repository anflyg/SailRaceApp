import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { LanguageProvider } from '../i18n/LanguageContext'
import { translations } from '../i18n/translations'
import { RaceSyncControl, syncLabel } from './RaceSyncControl'
import { syntheticRace } from '../services/sync/syntheticRace'
import type { SyncState } from '../services/sync/types'
const state:SyncState={version:1,mode:'mock',localRaceId:syntheticRace.id,ownerId:'10000000-0000-4000-8000-000000000071',status:'queued',step:'issue',attempts:0}
describe('race library sync status and honest rollout boundary',()=>{
  it.each(['sv','en'] as const)('shows real sync disabled in %s',language=>{
    const html=renderToStaticMarkup(<LanguageProvider language={language} setLanguage={()=>{}}><RaceSyncControl race={syntheticRace}/></LanguageProvider>)
    expect(html).toContain(translations[language]['sync.unavailable'])
    expect(html).toContain('disabled=""');expect(html).not.toContain(translations[language]['sync.accepted']+'<')
  })
  it('never labels a synthetic receipt as a real cloud upload',()=>{
    expect(syncLabel({...state,status:'accepted'},undefined,true)).toBe('sync.mockAccepted')
    expect(translations.en['sync.mockAccepted']).toContain('no cloud upload')
    expect(syncLabel({...state,status:'accepted'},undefined,false)).toBe('sync.accepted')
  })
  it('covers waiting, invalid, entitlement, restart and manual states in both languages',()=>{
    const keys=[syncLabel(null),syncLabel(state),syncLabel(state,'offline'),syncLabel(state,'unauthorized'),syncLabel(state,'intent_expired'),
      syncLabel({...state,status:'syncing'}),syncLabel({...state,status:'invalid'}),syncLabel({...state,status:'blocked_entitlement'}),syncLabel(state,'upstream_unavailable')]
    for(const key of keys){expect(translations.sv[key]).toBeTruthy();expect(translations.en[key]).toBeTruthy()}
    expect(syncLabel(state,'invalid_race_payload')).toBe('sync.invalid')
    expect(syncLabel(state,'account_changed')).toBe('sync.manual')
  })
})
