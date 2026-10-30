import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { LanguageProvider } from '../../i18n/LanguageContext'
import { translations } from '../../i18n/translations'
import type { CourseState, FilteredGpsReading } from '../../types'
import { RaceDashboardView } from './RaceDashboardView'

const course: CourseState = {
  points: { startA: null, startB: null, kryss1: null, lans1: null },
  windHeadingDegrees: null,
}

const gps: FilteredGpsReading = {
  status: 'watching', error: null, latitude: 59.3, longitude: 18,
  accuracyMeters: 2, speedKnots: 5.5, courseDegrees: 42, courseReliable: true,
  timestamp: 1_700_000_000_000, nativeCourseDegrees: 42, positionCourseDegrees: 42,
  fusedCourseDegrees: 42, nativeSpeedKnots: 5.5, positionSpeedKnots: 5.5,
  fusedSpeedKnots: 5.5, sampleCount: 1, displayCourseDegrees: 42,
  presentationTimestamp: 1_700_000_000_000,
}

describe('RaceDashboardView active recording layout', () => {
  it('keeps R/S, speed, heading and VMG visible with the recording stop control', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider language="sv" setLanguage={() => {}}>
        <RaceDashboardView
          course={course}
          gps={gps}
          rollPitch={{ rollDegrees: 8, pitchDegrees: -3 }}
          laylineEnabled={false}
          laylineAlphaDegrees={90}
          recordingActive
          onStopRecording={() => {}}
        />
      </LanguageProvider>,
    )

    expect(html).toContain('R +8°')
    expect(html).toContain('S -3°')
    expect(html).toContain('5,5')
    expect(html).toContain('042°')
    expect(html).toContain(translations.sv['sailing.notSet'])
    expect(html).toContain(translations.sv['recording.active'])
    expect(html).toContain(translations.sv['recording.stop'])
    expect(html).toContain('race-recording-footer')
    expect(html.match(/class="metric-box/g)).toHaveLength(3)
  })
})
