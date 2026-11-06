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

describe('RaceDashboardView instrument layout', () => {
  it('keeps the instruments visible without a wind reference and does not show a recording control', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider language="sv" setLanguage={() => {}}>
        <RaceDashboardView
          course={course}
          gps={{ ...gps, speedKnots: null, courseDegrees: null, displayCourseDegrees: null, courseReliable: false, timestamp: null, presentationTimestamp: null }}
          compassDisplayMode="normal"
          laylineEnabled={false}
          laylineAlphaDegrees={90}
        />
      </LanguageProvider>,
    )

    expect(html.match(/class="metric-value">--/g)).toHaveLength(3)
    expect(html).toContain(translations.sv['sailing.notSet'])
    expect(html).not.toContain(translations.sv['recording.stop'])
    expect(html).toContain('—°')
    expect(html.match(/class="wind-cue-dot /g)).toHaveLength(6)
    expect(html).not.toContain('wind-cue-dot active')
    expect(html).not.toContain('wind-shift-marker')
    expect(html.match(/class="wind-shift-tick"/g)).toHaveLength(4)
    expect(html).toContain('wind-shift-center-tick')
    expect(html).toContain('race-instrument-footer')
    expect(html.match(/class="metric-box/g)).toHaveLength(3)
    expect(html).not.toContain('R +')
    expect(html).not.toContain('S -')
  })

  it('shows empty cues and the origin with an unreliable course', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider language="sv" setLanguage={() => {}}>
        <RaceDashboardView
          course={{ ...course, windHeadingDegrees: 180 }}
          gps={{ ...gps, courseReliable: false, displayCourseDegrees: null, speedKnots: null }}
          compassDisplayMode="normal" laylineEnabled={false} laylineAlphaDegrees={90}
        />
      </LanguageProvider>,
    )
    expect(html).toContain('180°')
    expect(html.match(/class="wind-cue-dot /g)).toHaveLength(6)
    expect(html).not.toContain('wind-cue-dot active')
    expect(html).not.toContain('wind-shift-marker')
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
    const headerCues = html.indexOf('wind-cue-dots header')
    const liftCues = html.indexOf('wind-cue-dots lift')
    const heading = html.indexOf('aria-label="Riktning"')
    const vmg = html.indexOf('aria-label="VMG"')
    const scale = html.indexOf('wind-shift-scale')
    expect(speed).toBeLessThan(dots)
    expect(dots).toBeLessThan(heading)
    expect(headerCues).toBeLessThan(liftCues)
    expect(heading).toBeLessThan(vmg)
    expect(vmg).toBeLessThan(scale)
    expect(html.match(/class="wind-cue-dot /g)).toHaveLength(6)
    expect(html).not.toContain('>Lyft<')
    expect(html).not.toContain('>Motvrid<')
  })
})
