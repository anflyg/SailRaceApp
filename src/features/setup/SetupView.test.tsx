import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { LanguageProvider } from '../../i18n/LanguageContext'
import { SetupView } from './SetupView'

function renderSetup(language: 'sv' | 'en') {
  return renderToStaticMarkup(
    <LanguageProvider language={language} setLanguage={() => {}}>
      <SetupView
        gps={{ status: 'watching', error: null, latitude: null, longitude: null, accuracyMeters: null, speedKnots: null, courseDegrees: null, courseReliable: false, timestamp: null }}
        attitude={{ status: 'watching', error: null, rollDegrees: null, pitchDegrees: null, motionAvailable: true, headingAvailable: true, timestamp: null }}
        rollPitch={null}
        isCalibrated={false}
        onCalibrate={() => {}}
        laylineAlphaDegrees={90}
        onLaylineAlphaDegreesChange={() => {}}
        compassDisplayMode="wind-relative"
        onCompassDisplayModeChange={() => {}}
      />
    </LanguageProvider>,
  )
}

describe('SetupView compass settings', () => {
  it('shows Swedish compass options and the Slagvinkel label', () => {
    const html = renderSetup('sv')
    expect(html).toContain('KOMPASS')
    expect(html).toContain('Vanlig')
    expect(html).toContain('Vindrelativ')
    expect(html).toContain('SLAGVINKEL')
    expect(html).toContain('90°')
    expect(html).not.toContain('setup-layline-toggle')
    expect(html).not.toContain('LAYLINE')
    expect(html).toContain('aria-pressed="true">Vindrelativ')
  })

  it('shows English compass options and tack-angle accessibility labels', () => {
    const html = renderSetup('en')
    expect(html).toContain('COMPASS')
    expect(html).toContain('Normal')
    expect(html).toContain('Wind-relative')
    expect(html).toContain('TACK ANGLE')
    expect(html).toContain('Decrease tack angle')
  })
})
