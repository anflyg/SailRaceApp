import { Capacitor } from '@capacitor/core'
import { useEffect, useState } from 'react'
import { RaceAnalysisView } from './RaceAnalysisView'
import type { Race } from '../../types'
import type { createRecordedRaceSync } from '../../services/sync/recordedRaceSync'

type Integration = ReturnType<typeof createRecordedRaceSync>

/** Load validation/compression only when the library is opened on iPhone.
 * Neither mounting, returning online nor account changes initiate an upload. */
export function RecordedRaceAnalysis({ enabled, recordingActive, initialRaceId, initialRace }: {
  enabled: boolean; recordingActive: boolean; initialRaceId?: string; initialRace?: Race
}) {
  const [integration, setIntegration] = useState<Integration>(null)
  useEffect(() => {
    if (!enabled || Capacitor.getPlatform() !== 'ios') return
    let active = true
    void import('../../services/sync/recordedRaceSync').then(({ createRecordedRaceSync }) => {
      if (active) setIntegration(createRecordedRaceSync())
    }).catch(() => { /* Local library remains available on configuration failure. */ })
    return () => { active = false }
  }, [enabled])
  return <RaceAnalysisView initialRaceId={initialRaceId} initialRace={initialRace}
    syncCoordinator={enabled ? integration?.coordinator : undefined}
    syncAccount={enabled ? integration?.account : undefined} recordingActive={recordingActive} />
}
