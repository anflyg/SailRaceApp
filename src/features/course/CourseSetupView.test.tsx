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
    qualityModel: 'core-motion-v1', headingDegrees: 350.1, selectedHeadingDegrees: 350.1, selectedHeadingSource: 'back-vector-row',
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
    expect(html).toContain(language === 'sv' ? 'geografisk nord' : 'true north')
    expect(html).toContain(language === 'sv' ? 'För få giltiga' : 'Too few valid')
  })
  it('keeps an approved measurement without rendering the removed VMG panel', () => {
    const html = renderCourse({ ...emptyCourse, windHeadingDegrees: 350.1, windMeasurement: measurement() })
    expect(html).not.toContain('GODKÄND FÖR VMG')
    expect(html).not.toContain('APPROVED FOR VMG')
    expect(html).not.toContain('GPS-kurs och GPS-fart kontrolleras separat')
    expect(html).not.toContain('Stabilitet/spridning 0,62°')
    expect(html).not.toContain('Mät igen')
    expect(html).not.toContain('Measure again')
    expect(html).not.toContain('course-wind-feedback')
    expect(html).toContain('wind-arrow-button set')
    expect(html).toContain('course-display-debug')
  })

  it('omits rejected wind feedback in English', () => {
    const html = renderCourse({
      ...emptyCourse,
      windHeadingDegrees: 350.1,
      windMeasurement: measurement({ quality: 'poor', accuracyDegrees: 54.4 }),
    }, 'en')
    expect(html).not.toContain('NOT APPROVED FOR VMG')
    expect(html).not.toContain('course-wind-feedback')
    expect(html).toContain('wind-arrow-button')
  })

  it.each(['ok', 'poor', 'unstable'] as const)('omits the VMG warning for %s quality', (quality) => {
    const html = renderCourse({
      ...emptyCourse,
      windHeadingDegrees: 350.1,
      windMeasurement: measurement({ quality, accuracyDegrees: 54.4, spreadDegrees: 0.62 }),
    })
    expect(html).not.toContain('EJ GODKÄND FÖR VMG')
    expect(html).not.toContain('course-wind-feedback')
    expect(html).toContain('wind-arrow-button')
  })

  it('omits rejected feedback when wind metadata is missing', () => {
    const html = renderCourse(emptyCourse)
    expect(html).not.toContain('EJ GODKÄND FÖR VMG')
    expect(html).not.toContain('Vindmätning eller matchande metadata saknas')
    expect(html).not.toContain('Mät vind')
    expect(html).not.toContain('course-wind-feedback')
    expect(html).toContain('wind-arrow-button')
  })

  it('keeps a short saved result with the new model without adding a panel', () => {
    const html = renderCourse({ ...emptyCourse, windHeadingDegrees: 350.1, windMeasurement: measurement({ sampleCount: 12 }) })
    expect(html).not.toContain('course-wind-feedback')
    expect(html).toContain('wind-arrow-button set')
  })

  it('preserves restored wind metadata without rendering the removed panel', () => {
    // Recovery restores the persisted course and windMeasurement into CourseState.
    const restoredCourse = { ...emptyCourse, windHeadingDegrees: 350.1, windMeasurement: measurement() }
    const html = renderCourse(restoredCourse)
    expect(html).not.toContain('GODKÄND FÖR VMG')
    expect(html).not.toContain('Mät igen')
    expect(html).not.toContain('course-wind-feedback')
    expect(html).toContain('Vind satt: 350°')
  })

  it('rejects inconsistent saved direction and measurement metadata', () => {
    const html = renderCourse({ ...emptyCourse, windHeadingDegrees: 12, windMeasurement: measurement() })
    expect(html).not.toContain('EJ GODKÄND FÖR VMG')
    expect(html).not.toContain('Mätningens riktning eller metadata är ofullständig eller stämmer inte överens.')
    expect(html).not.toContain('course-wind-feedback')
  })
})

describe('Course start advantage', () => {
  const course: CourseState = { points: { ...emptyCourse.points,
    startA: { latitude: 0, longitude: 0, quality: 'good' },
    startB: { latitude: Math.sin(Math.PI / 30) / 1113.2, longitude: Math.cos(Math.PI / 30) / 1113.2, quality: 'good' } },
    windHeadingDegrees: 0, windMeasurement: measurement({ headingDegrees: 0, selectedHeadingDegrees: 0 }) }
  it('shows original approved Course wind bias and bow-at-mark guidance', () => {
    expect(renderCourse(course)).toContain('B-änden gynnad, 6°')
    expect(renderCourse(course, 'en')).toContain('B end favored, 6°')
    expect(renderCourse(course, 'en')).toContain('when the bow is at the mark')
    expect(renderCourse(course, 'en')).toContain('Changing distance leaves saved points unchanged')
    expect(renderCourse({ ...course, windHeadingDegrees: 180, windMeasurement: measurement({ headingDegrees: 180, selectedHeadingDegrees: 180 }) })).toContain('A-änden gynnad, 6°')
  })
  it('withholds rejected wind and warns for poor endpoints', () => {
    expect(renderCourse({ ...course, windMeasurement: measurement({ quality: 'poor' }) })).not.toContain('class="start-advantage"')
    const poor = { ...course, points: { ...course.points, startB: { ...course.points.startB!, quality: 'poor' as const } } }
    expect(renderCourse(poor, 'en')).toContain('poor GPS endpoints')
    expect(renderCourse(poor)).not.toContain('class="start-advantage"')
  })
})
