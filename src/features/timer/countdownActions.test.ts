import { describe, expect, it, vi } from 'vitest'
import { runCountdownAction, type TimerStatus } from './countdownActions'
import type { WatchAction } from '../../services/watchCountdown'

describe('countdown control transitions', () => {
  it.each([
    ['stopped', 'start', 'start'], ['running', 'pause', 'pause'],
    ['paused', 'resume', 'resume'], ['stopped', 'reset', 'reset'],
    ['running', 'reset', 'reset'], ['paused', 'reset', 'reset'],
  ] as const)('executes %s / %s once', (status, command, expected) => {
    const actions = { start: vi.fn(), pause: vi.fn(), resume: vi.fn(), reset: vi.fn() }
    expect(runCountdownAction(status, command, actions)).toBe(true)
    expect(actions[expected]).toHaveBeenCalledOnce()
    expect(Object.values(actions).reduce((sum, fn) => sum + fn.mock.calls.length, 0)).toBe(1)
  })
  it.each([['running', 'start'], ['paused', 'start'], ['stopped', 'pause'], ['running', 'resume']] as [TimerStatus, WatchAction][])(
    'rejects stale %s / %s without side effects', (status, command) => {
      const actions = { start: vi.fn(), pause: vi.fn(), resume: vi.fn(), reset: vi.fn() }
      expect(runCountdownAction(status, command, actions)).toBe(false)
      expect(Object.values(actions).every(fn => fn.mock.calls.length === 0)).toBe(true)
    },
  )
})
