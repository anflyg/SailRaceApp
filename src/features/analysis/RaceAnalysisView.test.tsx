import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { LanguageProvider } from '../../i18n/LanguageContext'
import { translations } from '../../i18n/translations'
import type { Race } from '../../types'
import { RaceAnalysisView } from './RaceAnalysisView'

const race: Race = {
  id: 'synthetic-no-marks', dayId: '2026-01-01', name: 'Synthetic',
  createdAt: '2026-01-01T12:00:00Z', startGunTime: '2026-01-01T12:00:00Z',
  course: { windDirectionDegrees: 180 }, events: [],
  samples: [0, 1].map((seconds) => ({
    timestamp: `2026-01-01T12:00:0${seconds}Z`, latitude: 0, longitude: seconds * 0.00001,
    speedKnots: 5, cogDegrees: 90,
  })),
}

describe('analysis of a race prepared without marks', () => {
  it.each(['sv', 'en'] as const)('explains the available analysis without demanding K1/L1 in %s', (language) => {
    const html = renderToStaticMarkup(
      <LanguageProvider language={language} setLanguage={() => {}}>
        <RaceAnalysisView initialRaceId={race.id} initialRace={race} />
      </LanguageProvider>,
    )
    expect(html).toContain(translations[language]['analysis.legsRequireMarks'])
    expect(html).not.toContain('K1')
    expect(html).not.toContain('L1')
    expect(html).not.toMatch(/ofullständigt|incomplete|requires.*marks|kräver.*märken/i)
  })
})
