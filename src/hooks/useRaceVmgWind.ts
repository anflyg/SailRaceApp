import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { accountSession } from '../services/auth/native'
import { RaceVmgWind, raceVmgOwnerContext } from '../domain/raceVmgWind'
import type { TacticalHeading } from '../domain/tacticalHeading'
import type { CourseState, FilteredGpsReading } from '../types'

export function useRaceVmgWind(raceId: string | null, course: CourseState, heading: TacticalHeading, alpha: number, gps: FilteredGpsReading, enabled: boolean) {
  const runtime = useRef(new RaceVmgWind()).current
  const account = useMemo(() => enabled ? accountSession() : null, [enabled])
  const ownerContext = useRef(raceVmgOwnerContext(account?.snapshot()))
  const owner = useCallback(() => raceVmgOwnerContext(account?.snapshot(), ownerContext.current), [account])
  const [, refresh] = useState(0)
  const changed = () => refresh(value => value + 1)
  useEffect(() => {
    let context = owner()
    return account?.subscribe(() => {
      const next = owner()
      if (context !== next) { runtime.invalidate(); changed() }
      context = next
      ownerContext.current = next
    })
  }, [account, owner, runtime])
  useEffect(() => {
    if (!enabled) return
    const transition = () => { runtime.interrupt(Date.now()); changed() }
    document.addEventListener('visibilitychange', transition)
    window.addEventListener('pagehide', transition)
    return () => { document.removeEventListener('visibilitychange', transition); window.removeEventListener('pagehide', transition) }
  }, [runtime, enabled])
  useEffect(() => {
    if (!enabled) return
    const update = () => {
      if (document.visibilityState === 'visible') runtime.step(raceId, owner(), course, heading, alpha, Date.now())
      changed()
    }
    update()
    const timer = window.setInterval(update, 1000)
    return () => window.clearInterval(timer)
  }, [runtime, raceId, course, heading.degrees, heading.timestamp, alpha, owner, enabled])
  const begin = useCallback((id: string, gun: number, origin: CourseState) => {
    if (enabled && owner() !== 'unavailable' && account?.snapshot().status !== 'restoring') runtime.begin(id, owner(), gun, origin, Date.now())
    changed()
  }, [runtime, owner, enabled, account])
  const approve = useCallback((approved: CourseState) => {
    if (enabled) runtime.approveCourse(raceId, owner(), approved, Date.now())
    changed()
  }, [runtime, raceId, owner, enabled])
  const invalidate = useCallback(() => { runtime.invalidate(); changed() }, [runtime])
  return {
    value: runtime.liveVmg(raceId, owner(), course, gps, Date.now()),
    begin, approve, invalidate,
  }
}
