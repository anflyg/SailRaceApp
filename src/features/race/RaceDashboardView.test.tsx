import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { LanguageProvider } from '../../i18n/LanguageContext'
import { translations } from '../../i18n/translations'
import type { CourseState, FilteredGpsReading } from '../../types'
import type { WindHeadingMeasurementResult } from '../../services/sensors/windHeadingService'
import { RaceDashboardView } from './RaceDashboardView'

// Mounting the retired warning engine would reintroduce its countdown/background work.
vi.mock('./useLaylineWarning', () => ({
  useLaylineWarning: () => { throw new Error('Layline warnings must not run in Sailing') },
}))

const measurement = (headingDegrees: number): WindHeadingMeasurementResult => ({
  headingDegrees, selectedHeadingDegrees: headingDegrees, selectedHeadingSource: 'back-vector-row',
  sampleCount: 40, referenceFrame: 'true-north', quality: 'good', accuracyDegrees: 2, spreadDegrees: 1, nativeDebug: null,
})
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

describe('RaceDashboardView instrument layout', () => {
  it('explains unavailable VMG without changing the metric label', () => {
    const fresh = { ...gps, timestamp: Date.now(), presentationTimestamp: Date.now() }
    const render = (current: CourseState, currentGps = fresh) => renderToStaticMarkup(
      <LanguageProvider language="sv" setLanguage={() => {}}><RaceDashboardView course={current} gps={currentGps}
        compassDisplayMode="normal" laylineAlphaDegrees={90} /></LanguageProvider>)
    expect(render(course)).toContain('Vind ej satt')
    expect(render({ ...course, windHeadingDegrees: 90 })).toContain('Vindmätning underkänd')
    expect(render({ ...course, windHeadingDegrees: 90, windMeasurement: { ...measurement(90), referenceFrame: 'magnetic-north' } })).toContain('Inkompatibel nordreferens')
    const valid = { ...course, windHeadingDegrees: 90, windMeasurement: measurement(90) }
    expect(render(valid, { ...fresh, courseReliable: false })).toContain('GPS-kurs otillförlitlig')
    expect(render(valid)).not.toContain('vmg-unavailable-reason')
    const mismatch = renderToStaticMarkup(<LanguageProvider language="sv" setLanguage={() => {}}>
      <RaceDashboardView course={valid} gps={fresh} compassDisplayMode="normal" laylineAlphaDegrees={90}
        raceReference={{ course: { windDirectionDegrees: 180 }, windMeasurement: measurement(180) }} />
    </LanguageProvider>)
    expect(mismatch).toContain('Vinden skiljer sig från racets referens')
  })
  it('shows End race during an active recording', () => {
    const html = renderToStaticMarkup(<LanguageProvider language="sv" setLanguage={() => {}}>
      <RaceDashboardView course={course} gps={gps} compassDisplayMode="normal" laylineAlphaDegrees={90} recordingActive />
    </LanguageProvider>)
    expect(html).toContain(translations.sv['recording.stop'])
    expect(html).toContain('recording-stop-button')
  })
  it('keeps the instruments visible without a wind reference and does not show a recording control', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider language="sv" setLanguage={() => {}}>
        <RaceDashboardView
          course={course}
          gps={{ ...gps, speedKnots: null, courseDegrees: null, displayCourseDegrees: null, courseReliable: false, timestamp: null, presentationTimestamp: null }}
          compassDisplayMode="normal"
          laylineAlphaDegrees={90}
        />
      </LanguageProvider>,
    )

    expect(html.match(/class="metric-value">--/g)).toHaveLength(3)
    expect(html).toContain('<span class="metric-label">VMG</span>')
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

  it.each(['sv', 'en'] as const)('labels the unavailable velocity instrument VMG in %s', (language) => {
    const html = renderToStaticMarkup(
      <LanguageProvider language={language} setLanguage={() => {}}>
        <RaceDashboardView course={course} gps={{ ...gps, speedKnots: null, courseDegrees: null }}
          compassDisplayMode="normal" laylineAlphaDegrees={90} />
      </LanguageProvider>,
    )
    expect(html).toContain('aria-label="VMG"')
    expect(html).toContain('<span class="metric-value">--</span><span class="metric-label">VMG</span>')
    expect(html).not.toContain(translations[language]['sailing.notSet'])
  })

  it('shows empty cues and the origin with an unreliable course', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider language="sv" setLanguage={() => {}}>
        <RaceDashboardView
          course={{ ...course, windHeadingDegrees: 180, windMeasurement: measurement(180) }}
          gps={{ ...gps, courseReliable: false, displayCourseDegrees: null, speedKnots: null }}
          compassDisplayMode="normal" laylineAlphaDegrees={90}
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
          course={{ ...course, windHeadingDegrees: 90, windMeasurement: { ...measurement(90), referenceFrame: windReferenceFrame } as WindHeadingMeasurementResult }}
          gps={{
            ...gps,
            courseDegrees: 135,
            displayCourseDegrees: 135,
            timestamp: Date.now(),
            presentationTimestamp: Date.now(),
          }}
          compassDisplayMode={compassDisplayMode}
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
          course={{ ...course, windHeadingDegrees: 90, windMeasurement: measurement(90) }}
          gps={gps}
          compassDisplayMode="normal"
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

describe('wind-only VMG', () => {
  it.each(['magnetic-north', 'mock', 'missing', 'poor', 'unknown', 'ok', 'unstable', 'mismatch', 'stale', 'unreliable'])('hides wind VMG and invalid scale for %s', (condition) => {
    const good = measurement(90)
    const windMeasurement = condition === 'missing' ? undefined : {
      ...good,
      referenceFrame: condition === 'magnetic-north' || condition === 'mock' ? condition : good.referenceFrame,
      quality: ['poor', 'unknown', 'ok', 'unstable'].includes(condition) ? condition : good.quality,
      headingDegrees: condition === 'mismatch' ? 91 : 90,
    } as WindHeadingMeasurementResult
    const currentTime = Date.now()
    const currentGps = { ...gps, courseDegrees: 90, displayCourseDegrees: 90,
      courseReliable: condition !== 'unreliable', timestamp: currentTime - (condition === 'stale' ? 5_001 : 0),
      presentationTimestamp: currentTime - (condition === 'stale' ? 5_001 : 0) }
    const html = renderToStaticMarkup(
      <LanguageProvider language="sv" setLanguage={() => {}}>
        <RaceDashboardView course={{ ...course, windHeadingDegrees: 90, windMeasurement }} gps={currentGps}
          compassDisplayMode="wind-relative" laylineAlphaDegrees={90} />
      </LanguageProvider>,
    )
    expect(html).toContain('<span class="metric-value">--</span><span class="metric-label">VMG</span>')
    if (condition !== 'stale' && condition !== 'unreliable') {
      expect(html).toContain('wind-shift-origin">—°')
      expect(html).toContain('<span class="metric-value">090°</span>')
    }
    expect(html).not.toContain('wind-cue-dot active')
    expect(html).not.toContain('wind-shift-marker')
  })
  it.each([null, 42])('ignores legacy marks with wind %s and never offers VMC or layline', (windHeadingDegrees) => {
    const legacyCourse: CourseState = { ...course, windHeadingDegrees, windMeasurement: windHeadingDegrees === null ? undefined : measurement(windHeadingDegrees), points: {
      ...course.points,
      kryss1: { latitude: 59.31, longitude: 18, quality: 'good' },
      lans1: { latitude: 59.29, longitude: 18, quality: 'good' },
    } }
    const html = renderToStaticMarkup(
      <LanguageProvider language="sv" setLanguage={() => {}}>
        <RaceDashboardView course={legacyCourse} gps={{ ...gps, timestamp: Date.now(), presentationTimestamp: Date.now() }} compassDisplayMode="normal" laylineAlphaDegrees={90} />
      </LanguageProvider>,
    )
    expect(html).toContain(`<span class="metric-value">${windHeadingDegrees === null ? '--' : '5,5'}</span><span class="metric-label">VMG</span>`)
    expect(html).toContain('<span class="metric-value">5,5</span>')
    expect(html).toContain('<span class="metric-value">042°</span>')
    expect(html).not.toContain('VMC')
    expect(html).not.toContain('LAYLINE')
    expect(html).not.toContain('role="button"')
    expect(html).not.toContain('can-toggle')
  })
})
