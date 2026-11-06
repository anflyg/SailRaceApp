import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { LanguageProvider } from '../../i18n/LanguageContext'
import type { CourseState, LiveGpsReading } from '../../types'
import { CourseSetupView } from './CourseSetupView'

const gps: LiveGpsReading = {
  status: 'idle', error: null, latitude: null, longitude: null, accuracyMeters: null,
  speedKnots: null, courseDegrees: null, courseReliable: false, timestamp: null,
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
    const html = renderToStaticMarkup(
      <LanguageProvider language={language} setLanguage={() => {}}>
        <CourseSetupView course={course} gps={gps} onToggleCoursePoint={() => {}}
          onToggleWindHeading={() => {}} onWindMeasurement={() => {}}
          onClearCourse={() => {}} gpsStatusMessage={null} />
      </LanguageProvider>,
    )
    expect(html).toContain('>A</button>')
    expect(html).toContain('>B</button>')
    expect(html).toContain('wind-arrow-button')
    expect(html).not.toContain('>K1</button>')
    expect(html).not.toContain('>L1</button>')
    expect(html).not.toMatch(/fördel|advantage|favored|neutral/i)
    expect(course).toEqual(before)
  })
})
