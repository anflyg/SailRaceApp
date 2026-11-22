import React from 'react'
import { createRoot } from 'react-dom/client'
import type { StartTimerView } from '../../src/features/timer/StartTimerView'
import { LanguageProvider } from '../../src/i18n/LanguageContext'

const calls: string[] = []
const confirmations: { phase: string; id?: string }[] = []
const listeners: Record<string, (event: unknown) => void> = {}
const registrations: { phase: string }[] = []
Object.assign(window, { testCalls: calls, testConfirmations: confirmations, testRegistrations: registrations, sendResync: () => listeners.resync?.({}), sendWatch: (action: string, id: string, expiresAt = Date.now() + 1000) => listeners.command?.({ action, id, expiresAt }) })
Object.assign(window, { CapacitorCustomPlatform: { name: 'ios' }, Capacitor: {
  PluginHeaders: [{ name: 'WatchCountdown', methods: ['available', 'unavailable', 'confirm'].map(name => ({ name, rtype: 'promise' })).concat([{ name: 'addListener', rtype: 'callback' }, { name: 'removeListener', rtype: 'callback' }]) }],
  nativePromise: (_plugin: string, method: string, options: { phase: string; id?: string }) => { if (method === 'confirm') confirmations.push(options); if (method === 'available') registrations.push(options); return Promise.resolve() },
  nativeCallback: (_plugin: string, method: string, options: { eventName: string }, callback: (event: unknown) => void) => { if (method === 'addListener') { listeners[options.eventName] = callback; if (listeners.command && listeners.resync) Object.assign(window, { testListenerReady: true }) } else delete listeners[options.eventName]; return Promise.resolve('listener') },
} })
// Dynamic imports ensure Capacitor sees the fake native bridge before registration.
const { StartTimerView: View } = await import('../../src/features/timer/StartTimerView')
const gps = { status: 'idle', error: null, latitude: null, longitude: null, accuracyMeters: null, speedKnots: null, courseDegrees: null, courseReliable: false, timestamp: null } as const
const filtered = { ...gps, nativeCourseDegrees: null, positionCourseDegrees: null, fusedCourseDegrees: null, nativeSpeedKnots: null, positionSpeedKnots: null, fusedSpeedKnots: null, sampleCount: 0, displayCourseDegrees: null, presentationTimestamp: null }
const props: React.ComponentProps<typeof StartTimerView> = {
  selectedMinutes: 5, course: { points: { startA: null, startB: null, kryss1: null, lans1: null }, windHeadingDegrees: null }, gps, filteredGps: filtered,
  onSelectedMinutesChange: () => {}, recordingActive: true, watchEnabled: true,
  onCountdownStart: () => { calls.push('start'); return null }, onCountdownPause: () => { calls.push('pause') }, onCountdownResume: () => { calls.push('resume'); return null }, onStopRecording: () => { calls.push('endRace') },
}
createRoot(document.getElementById('root')!).render(<LanguageProvider language="sv" setLanguage={() => {}}><View {...props} /></LanguageProvider>)
