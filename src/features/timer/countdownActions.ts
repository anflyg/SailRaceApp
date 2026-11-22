import type { WatchAction } from '../../services/watchCountdown'

export type TimerStatus = 'stopped' | 'running' | 'paused'
export interface CountdownActions {
  start(): void
  pause(): void
  resume(): void
  reset(): void
}

// Both input surfaces use this transition gate. Reset is a countdown action only.
export function runCountdownAction(status: TimerStatus, action: WatchAction, actions: CountdownActions): boolean {
  if (action === 'reset') { actions.reset(); return true }
  if (status === 'stopped' && action === 'start') { actions.start(); return true }
  if (status === 'running' && action === 'pause') { actions.pause(); return true }
  if (status === 'paused' && action === 'resume') { actions.resume(); return true }
  return false
}
