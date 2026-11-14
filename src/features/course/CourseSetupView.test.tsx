import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { LanguageProvider } from '../../i18n/LanguageContext'
import type { WindHeadingMeasurementResult } from '../../services/sensors/windHeadingService'
import type { CourseState, LiveGpsReading } from '../../types'
import { CourseSetupView, WindFailureDiagnostics } from './CourseSetupView'

const gps: LiveGpsReading = {
  status: 'idle', error: null, latitude: null, longitude: null, accuracyMeters: null,
  speedKnots: null, courseDegrees: null, courseReliable: false, timestamp: null,
}

function measurement(overrides: Partial<WindHeadingMeasurementResult> = {}): WindHeadingMeasurementResult {
  return {
    headingDegrees: 350.1, selectedHeadingDegrees: 350.1, selectedHeadingSource: 'back-vector-row',
    sampleCount: 40, referenceFrame: 'true-north', quality: 'good', accuracyDegrees: 3.2, spreadDegrees: 0.62,
    nativeDebug: null, ...overrides,
  }
}

function renderCourse(course: CourseState, language: 'sv' | 'en' = 'sv') {
  return renderToStaticMarkup(
    <LanguageProvider language={language} setLanguage={() => {}}>
      <CourseSetupView course={course} gps={gps} onToggleCoursePoint={() => {}}
        onWindHeadingChange={() => {}} onWindMeasurement={() => {}}
        onClearCourse={() => {}} gpsStatusMessage={null} />
    </LanguageProvider>,
  )
}

const emptyCourse: CourseState = {
  points: { startA: null, startB: null, kryss1: null, lans1: null },
  windHeadingDegrees: null,
}

describe('Course setup without mark preparation', () => {
  it.each(['sv', 'en'] as const)('keeps A/B and wind but no mark buttons or old line bias in %s', (language) => {
    const course: CourseState = {
      points: {
        startA: { latitude: 0, longitude: 0, quality: 'good' },
        startB: { latitude: 0, longitude: 0.001, quality: 'good' },
        kryss1: { latitude: 0.01, longitude: 0.005, quality: 'good' },
        lans1: { latitude: -0.01, longitude: 0, quality: 'good' },
      },
      windHeadingDegrees: 180,
    }
    const before = structuredClone(course)
    const html = renderCourse(course, language)
    expect(html).toContain('>A</button>')
    expect(html).toContain('>B</button>')
    expect(html).toContain('wind-arrow-button')
    expect(html).not.toContain('>K1</button>')
    expect(html).not.toContain('>L1</button>')
    expect(html).not.toMatch(/fördel|advantage|favored|neutral/i)
    expect(course).toEqual(before)
  })
})

describe('wind VMG acceptance feedback in Course', () => {
  it.each(['sv', 'en'] as const)('shows transient failure diagnostics in %s', language => {
    const html = renderToStaticMarkup(<LanguageProvider language={language} setLanguage={() => {}}>
      <WindFailureDiagnostics diagnostics={{ reason: 'insufficient-samples', collectedSamples: 32, acceptedSamples: 12, missingAccuracySamples: 20,
        referenceFrame: 'true-north', accuracyDegrees: 4.5, spreadDegrees: null, coverageSeconds: null, maxGapSeconds: null }} />
    </LanguageProvider>)
    expect(html).toContain('12')
    expect(html).toContain('20')
    expect(html).toContain(language === 'sv' ? 'geografisk nord' : 'true north')
    expect(html).toContain(language === 'sv' ? 'För få giltiga' : 'Too few valid')
    expect(html).toContain(language === 'sv' ? '4,5°' : '4.5°')
  })
  it('clearly approves a good, consistent true-north measurement and separates the GPS check', () => {
    const html = renderCourse({ ...emptyCourse, windHeadingDegrees: 350.1, windMeasurement: measurement() })
    expect(html).toContain('GODKÄND FÖR VMG')
    expect(html).toContain('GPS-kurs och GPS-fart kontrolleras separat')
    expect(html).toContain('Rapporterad noggrannhet 3,2°')
    expect(html).not.toContain('Mät igen')
  })

  it('provides the same explicit decision and diagnostics in English', () => {
    const html = renderCourse({
      ...emptyCourse,
      windHeadingDegrees: 350.1,
      windMeasurement: measurement({ quality: 'poor', accuracyDegrees: 54.4 }),
    }, 'en')
    expect(html).toContain('NOT APPROVED FOR VMG')
    expect(html).toContain('Direction 350.1° · Spread 0.62° · Reported accuracy 54.4° · Quality poor')
    expect(html).toContain('Measure again')
  })

  it.each(['ok', 'poor', 'unstable'] as const)('rejects %s quality and offers remeasurement', (quality) => {
    const html = renderCourse({
      ...emptyCourse,
      windHeadingDegrees: 350.1,
      windMeasurement: measurement({ quality, accuracyDegrees: 54.4, spreadDegrees: 0.62 }),
    })
    expect(html).toContain('EJ GODKÄND FÖR VMG')
    expect(html).toContain('Mät igen')
    expect(html).toContain('350,1°')
    expect(html).toContain('0,62°')
    expect(html).toContain('54,4°')
    expect(html).toContain('Spridning beskriver hur jämna proverna var')
    expect(html).not.toContain('class="course-wind-feedback approved"')
  })

  it('reports missing measurement and offers an initial measurement', () => {
    const html = renderCourse(emptyCourse)
    expect(html).toContain('EJ GODKÄND FÖR VMG')
    expect(html).toContain('Vindmätning eller matchande metadata saknas')
    expect(html).toContain('Mät vind')
  })

  it('asks for a new measurement when a short saved result has no in-memory coverage proof', () => {
    const html = renderCourse({ ...emptyCourse, windHeadingDegrees: 350.1, windMeasurement: measurement({ sampleCount: 12 }) })
    expect(html).toContain('EJ GODKÄND FÖR VMG')
    expect(html).toContain('Mät vind igen för att kontrollera tidsfördelningen efter omstart')
  })

  it('shows the saved acceptance status after a recovered race restores its wind metadata', () => {
    // Recovery restores the persisted course and windMeasurement into CourseState.
    const restoredCourse = { ...emptyCourse, windHeadingDegrees: 350.1, windMeasurement: measurement() }
    const html = renderCourse(restoredCourse)
    expect(html).toContain('GODKÄND FÖR VMG')
    expect(html).toContain('350,1°')
    expect(html).toContain('Spridning')
  })

  it('rejects inconsistent saved direction and measurement metadata', () => {
    const html = renderCourse({ ...emptyCourse, windHeadingDegrees: 12, windMeasurement: measurement() })
    expect(html).toContain('EJ GODKÄND FÖR VMG')
    expect(html).toContain('Mätningens riktning eller metadata är ofullständig eller stämmer inte överens.')
  })
})
