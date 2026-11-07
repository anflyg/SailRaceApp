import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { LanguageProvider } from '../../i18n/LanguageContext'
import { translations } from '../../i18n/translations'
import type { CourseState, FilteredGpsReading, LiveGpsReading } from '../../types'
import { StartTimerView } from './StartTimerView'

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

describe('StartTimerView recording controls', () => {
  it('shows the existing recording status and stop control in Start', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider language="sv" setLanguage={() => {}}>
        <StartTimerView selectedMinutes={5} course={course} gps={gps} filteredGps={filteredGps}
          onSelectedMinutesChange={() => {}} recordingActive onStopRecording={() => {}} />
      </LanguageProvider>,
    )
    expect(html).toContain('5:00')
    expect(html).toContain(translations.sv['recording.active'])
    expect(html).toContain(translations.sv['recording.stop'])
  })

  it('keeps the saved recording status available after stopping', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider language="sv" setLanguage={() => {}}>
        <StartTimerView selectedMinutes={5} course={course} gps={gps} filteredGps={filteredGps}
          onSelectedMinutesChange={() => {}} recordingMessageKey="recording.saved" />
      </LanguageProvider>,
    )
    expect(html).toContain(translations.sv['recording.saved'])
    expect(html).not.toContain('recording-stop-button')
  })
})
