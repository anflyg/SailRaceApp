import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { LanguageProvider } from '../../i18n/LanguageContext'
import { translations } from '../../i18n/translations'
import type { CourseState, FilteredGpsReading } from '../../types'
import { RaceDashboardView } from './RaceDashboardView'

const course: CourseState = {
  points: { startA: null, startB: null, kryss1: null, lans1: null },
  windHeadingDegrees: null,
  windMeasurement: {
    referenceFrame: 'true-north',
  } as CourseState['windMeasurement'],
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
  it('keeps speed, heading and VMG visible with the wind instruments and recording stop control', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider language="sv" setLanguage={() => {}}>
        <RaceDashboardView
          course={course}
          gps={gps}
          compassDisplayMode="normal"
          laylineEnabled={false}
          laylineAlphaDegrees={90}
          recordingActive
          onStopRecording={() => {}}
        />
      </LanguageProvider>,
    )

    expect(html).toContain('5,5')
    expect(html).toContain('042°')
    expect(html).toContain(translations.sv['sailing.notSet'])
    expect(html).toContain(translations.sv['recording.active'])
    expect(html).toContain(translations.sv['recording.stop'])
    expect(html).toContain('race-instrument-footer')
    expect(html.match(/class="metric-box/g)).toHaveLength(3)
    expect(html).not.toContain('R +')
    expect(html).not.toContain('S -')
  })

  it('uses wind-relative course only with a true-north origin and otherwise keeps the ordinary compass', () => {
    const renderHeading = (compassDisplayMode: 'normal' | 'wind-relative', windReferenceFrame: string) => renderToStaticMarkup(
      <LanguageProvider language="sv" setLanguage={() => {}}>
        <RaceDashboardView
          course={{ ...course, windHeadingDegrees: 90, windMeasurement: { referenceFrame: windReferenceFrame } as CourseState['windMeasurement'] }}
          gps={{
            ...gps,
            courseDegrees: 135,
            displayCourseDegrees: 135,
            timestamp: Date.now(),
            presentationTimestamp: Date.now(),
          }}
          compassDisplayMode={compassDisplayMode}
          laylineEnabled={false}
          laylineAlphaDegrees={90}
        />
      </LanguageProvider>,
    )

    expect(renderHeading('normal', 'true-north')).toContain('135°')
    expect(renderHeading('wind-relative', 'true-north')).toContain('225°')
    expect(renderHeading('wind-relative', 'magnetic-north')).toContain('135°')
  })

  it('places the six unlabeled tack cues between speed and heading, with the scale below the metrics', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider language="sv" setLanguage={() => {}}>
        <RaceDashboardView
          course={{ ...course, windHeadingDegrees: 90, windMeasurement: { referenceFrame: 'true-north' } as CourseState['windMeasurement'] }}
          gps={gps}
          compassDisplayMode="normal"
          laylineEnabled={false}
          laylineAlphaDegrees={90}
        />
      </LanguageProvider>,
    )
    const speed = html.indexOf('aria-label="Fart"')
    const dots = html.indexOf('wind-tack-cues')
    const heading = html.indexOf('aria-label="Riktning"')
    const vmg = html.indexOf('aria-label="VMG"')
    const scale = html.indexOf('wind-shift-scale')
    expect(speed).toBeLessThan(dots)
    expect(dots).toBeLessThan(heading)
    expect(heading).toBeLessThan(vmg)
    expect(vmg).toBeLessThan(scale)
    expect(html.match(/class="wind-cue-dot /g)).toHaveLength(6)
    expect(html).not.toContain('>Lyft<')
    expect(html).not.toContain('>Motvrid<')
  })
})
