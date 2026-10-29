import { Capacitor, CapacitorHttp, type HttpOptions, type HttpResponse } from '@capacitor/core'
import { accountSession } from '../auth/native'
import { publicAuthConfig, type PublicAuthConfig } from '../auth/supabase'
import type { AccountSession } from '../auth/types'
import { getActiveRaceId } from '../raceLogger'
import { nativePrivateFiles, type PrivateFiles } from './storage'

export const existingWorkerOrigin = 'https://api.tackwise.se'
export const existingAuthOrigin = 'https://ikwnwdfvqybselccohxf.supabase.co'

export interface NativeSyncRuntime {
  platform(): string
  configuredAuth(): PublicAuthConfig | null
  account(): AccountSession | null
  files(): PrivateFiles
  request(options: HttpOptions): Promise<HttpResponse>
  activeRace(): string | null
  online(): boolean
  now(): number
  sleep(ms: number): Promise<void>
  random(): number
}

export const nativeSyncRuntime: NativeSyncRuntime = {
  platform: () => Capacitor.getPlatform(),
  configuredAuth: () => publicAuthConfig(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY),
  account: accountSession, files: nativePrivateFiles, request: options => CapacitorHttp.request(options),
  activeRace: getActiveRaceId, online: () => navigator.onLine && document.visibilityState === 'visible',
  now: Date.now, sleep: ms => new Promise(resolve => setTimeout(resolve, ms)), random: Math.random,
}
