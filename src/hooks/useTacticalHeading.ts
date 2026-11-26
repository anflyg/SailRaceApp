import { useEffect, useState } from 'react'
import { Capacitor, registerPlugin } from '@capacitor/core'
import { averageAnglesDegrees } from '../domain/angles'

import { isFreshTacticalHeading, NO_TACTICAL_HEADING, TACTICAL_HEADING_MAX_AGE_MS, type TacticalHeading } from '../domain/tacticalHeading'
export { isFreshTacticalHeading, NO_TACTICAL_HEADING, TACTICAL_HEADING_MAX_AGE_MS, type TacticalHeading } from '../domain/tacticalHeading'
interface Sample { valid?: boolean; headingDegrees?: number; motionTimestamp?: number; ageMs?: number }
const native = registerPlugin<{ getTacticalHeading(): Promise<Sample> }>('WindHeading')

// A short circular window suppresses wave-induced oscillation without using GPS speed.
export class TacticalHeadingFilter {
  private samples: Array<{ degrees: number; motionTimestamp: number; timestamp: number }> = []
  add(sample: Sample, now: number): TacticalHeading {
    const { headingDegrees: degrees, motionTimestamp, ageMs } = sample
    if (sample.valid !== true || typeof degrees !== 'number' || !Number.isFinite(degrees) || degrees < 0 || degrees >= 360 ||
        typeof motionTimestamp !== 'number' || !Number.isFinite(motionTimestamp) || motionTimestamp < 0 ||
        typeof ageMs !== 'number' || !Number.isFinite(ageMs) || ageMs < 0 || ageMs > 1000) {
      this.samples = []
      return NO_TACTICAL_HEADING
    }
    const timestamp = now - ageMs
    const last = this.samples.at(-1)
    if (last && motionTimestamp < last.motionTimestamp) return NO_TACTICAL_HEADING
    if (!last || motionTimestamp > last.motionTimestamp) this.samples.push({ degrees, motionTimestamp, timestamp })
    this.samples = this.samples.filter((s) => now - s.timestamp <= 3000 && s.timestamp <= now)
    const latest = this.samples.at(-1)
    if (!latest || now - latest.timestamp > TACTICAL_HEADING_MAX_AGE_MS) return NO_TACTICAL_HEADING
    return { degrees: averageAnglesDegrees(this.samples.map((s) => s.degrees)), timestamp: latest.timestamp }
  }
}

export function useTacticalHeading(enabled: boolean, developmentHeading: TacticalHeading = NO_TACTICAL_HEADING): TacticalHeading {
  const [heading, setHeading] = useState<TacticalHeading>(NO_TACTICAL_HEADING)
  useEffect(() => {
    if (!enabled || !Capacitor.isNativePlatform()) return
    let cancelled = false
    let pending = false
    let generation = 0
    let filter = new TacticalHeadingFilter()
    const update = async () => {
      if (document.visibilityState !== 'visible') { filter = new TacticalHeadingFilter(); setHeading(NO_TACTICAL_HEADING); return }
      if (pending) return
      pending = true
      const requestGeneration = generation
      try {
        const requestStarted = performance.now()
        const sample = await native.getTacticalHeading()
        const bridgeDelay = performance.now() - requestStarted
        if (typeof sample.ageMs === 'number') sample.ageMs += bridgeDelay
        if (!cancelled && requestGeneration === generation && document.visibilityState === 'visible') setHeading(filter.add(sample, Date.now()))
      } catch {
        if (!cancelled && requestGeneration === generation) { filter = new TacticalHeadingFilter(); setHeading(NO_TACTICAL_HEADING) }
      } finally { pending = false }
    }
    void update()
    const interval = window.setInterval(() => { setHeading((h) => isFreshTacticalHeading(h) ? h : NO_TACTICAL_HEADING); void update() }, 250)
    const visibility = () => { if (document.visibilityState !== 'visible') { generation++; filter = new TacticalHeadingFilter(); setHeading(NO_TACTICAL_HEADING) } else void update() }
    document.addEventListener('visibilitychange', visibility)
    return () => { cancelled = true; window.clearInterval(interval); document.removeEventListener('visibilitychange', visibility); setHeading(NO_TACTICAL_HEADING) }
  }, [enabled])
  return enabled ? heading : developmentHeading
}
