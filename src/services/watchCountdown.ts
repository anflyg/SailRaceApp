import { Capacitor, registerPlugin } from '@capacitor/core'

export type WatchPhase = 'ready' | 'running' | 'paused'
export type WatchAction = 'start' | 'pause' | 'resume' | 'reset'
interface Command { id: string; action: WatchAction; expiresAt: number }
interface WatchBridge {
  addListener(event: 'command', listener: (command: Command) => void): Promise<{ remove(): Promise<void> }>
  available(options: { phase: WatchPhase }): Promise<void>
  unavailable(): Promise<void>
  confirm(options: { phase: WatchPhase; id?: string }): Promise<void>
}
export const WatchCountdown = registerPlugin<WatchBridge>('WatchCountdown')
export const watchAvailable = () => Capacitor.getPlatform() === 'ios'
