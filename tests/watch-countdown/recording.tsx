import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { LanguageProvider } from '../../src/i18n/LanguageContext'

const listeners: Record<string, (event: unknown) => void> = {}
const confirmations: { id?: string; phase: string }[] = []
Object.assign(window, { confirmations, sendWatch: (action: string, id: string) => listeners.command?.({ action, id, expiresAt: Date.now() + 2000 }) })
Object.assign(window, { CapacitorCustomPlatform: { name: 'ios' }, Capacitor: {
  PluginHeaders: [{ name: 'WatchCountdown', methods: ['available', 'unavailable', 'confirm'].map(name => ({ name, rtype: 'promise' })).concat([{ name: 'addListener', rtype: 'callback' }, { name: 'removeListener', rtype: 'callback' }]) }],
  nativePromise: (_plugin: string, method: string, options: { id?: string; phase: string }) => { if (method === 'confirm') confirmations.push(options); return Promise.resolve() },
  nativeCallback: (_plugin: string, method: string, options: { eventName: string }, callback: (event: unknown) => void) => { if (method === 'addListener') { listeners[options.eventName] = callback; if (listeners.command && listeners.resync) Object.assign(window, { ready: true }) } else delete listeners[options.eventName]; return Promise.resolve('listener') },
} })
const { StartTimerView } = await import('../../src/features/timer/StartTimerView')
const logger = await import('../../src/services/raceLogger')
const storage = await import('../../src/services/raceStorage')
Object.assign(window, { getActiveRaceId: logger.getActiveRaceId, getToken: logger.getActiveCountdownToken, getRace: storage.getRace, tryGun: (token: Parameters<typeof logger.markStartGun>[1]) => logger.markStartGun(new Date(Date.now() + 1000), token) })
const gps = { status: 'idle', error: null, latitude: null, longitude: null, accuracyMeters: null, speedKnots: null, courseDegrees: null, courseReliable: false, timestamp: null } as const
const filtered = { ...gps, nativeCourseDegrees: null, positionCourseDegrees: null, fusedCourseDegrees: null, nativeSpeedKnots: null, positionSpeedKnots: null, fusedSpeedKnots: null, sampleCount: 0, displayCourseDegrees: null, presentationTimestamp: null }
function Harness() {
  const [active, setActive] = useState(false)
  return <LanguageProvider language="sv" setLanguage={() => {}}><StartTimerView selectedMinutes={1} course={{ points: { startA: null, startB: null, kryss1: null, lans1: null }, windHeadingDegrees: null }} gps={gps} filteredGps={filtered} onSelectedMinutesChange={() => {}} watchEnabled recordingActive={active}
    onCountdownStart={seconds => { logger.startRaceLogging({ countdownDurationSeconds: seconds }); setActive(true); return logger.getActiveCountdownToken() }}
    onCountdownResume={logger.updatePlannedStart} onCountdownPause={logger.pausePlannedStart}
    onStartGun={token => Boolean(logger.markStartGun(new Date(), token)?.startGunTime)}
    onStopRecording={() => { logger.stopActiveRace(); setActive(false) }} /></LanguageProvider>
}
createRoot(document.getElementById('root')!).render(<Harness />)
