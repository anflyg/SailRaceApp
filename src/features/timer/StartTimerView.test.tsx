import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { LanguageProvider } from '../../i18n/LanguageContext'
import { translations } from '../../i18n/translations'
import type { CourseState, FilteredGpsReading, LiveGpsReading } from '../../types'
import { startCountdownIfAllowed, StartTimerView } from './StartTimerView'

const course: CourseState = {
  points: { startA: null, startB: null, kryss1: null, lans1: null },
  windHeadingDegrees: null,
}
const gps: LiveGpsReading = {
  status: 'idle', error: null, latitude: null, longitude: null, accuracyMeters: null,
  speedKnots: null, courseDegrees: null, courseReliable: false, timestamp: null,
}
const filteredGps: FilteredGpsReading = {
  ...gps, nativeCourseDegrees: null, positionCourseDegrees: null, fusedCourseDegrees: null,
  nativeSpeedKnots: null, positionSpeedKnots: null, fusedSpeedKnots: null,
  sampleCount: 0, displayCourseDegrees: null, presentationTimestamp: null,
}

describe('StartTimerView when an active race blocks a new countdown', () => {
  it('shows the translated explanation in the Start view', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider language="sv" setLanguage={() => {}}>
        <StartTimerView
          selectedMinutes={5}
          course={course}
          gps={gps}
          filteredGps={filteredGps}
          onSelectedMinutesChange={() => {}}
          countdownBlockedMessageKey="recording.alreadyActive"
        />
      </LanguageProvider>,
    )

    expect(html).toContain(translations.sv['recording.alreadyActive'])
    expect(html).toContain('countdown-blocked-status')
    expect(html).toContain('role="status"')
  })

  it('does not start or toggle the countdown when the recording guard rejects it', () => {
    const requestStart = vi.fn(() => false)
    const startCountdown = vi.fn()

    expect(startCountdownIfAllowed(300, requestStart, startCountdown)).toBe(false)
    expect(requestStart).toHaveBeenCalledWith(300)
    expect(startCountdown).not.toHaveBeenCalled()
  })

  it('starts the countdown when there is no active recording guard', () => {
    const startCountdown = vi.fn()

    expect(startCountdownIfAllowed(300, undefined, startCountdown)).toBe(true)
    expect(startCountdown).toHaveBeenCalledOnce()
  })
})
