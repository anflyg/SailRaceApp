import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { LanguageProvider } from '../../i18n/LanguageContext'
import { createWindInstrumentState, stepWindInstrument } from '../../domain/windShiftInstrument'
import { WindShiftDots, WindShiftScale } from './WindShiftInstruments'

function instrumentAt(course: number) {
  let state = createWindInstrumentState()
  let output = stepWindInstrument(state, sample(100_000, 135))
  for (let second = 1; second <= 35; second += 1) {
    state = output.state
    output = stepWindInstrument(state, sample(100_000 + second * 1_000, 135))
  }
  return stepWindInstrument(output.state, sample(136_000, course))
}

function sample(timestamp: number, courseDegrees: number) {
  return { nowMs: timestamp, timestamp, courseDegrees, courseReliable: true,
    windHeadingDegrees: 180, windReferenceFrame: 'true-north', alphaDegrees: 90, startGunTimeMs: 0 }
}

function render(output: ReturnType<typeof instrumentAt>, validReference: boolean, wind: number | null) {
  return renderToStaticMarkup(
    <LanguageProvider language="sv" setLanguage={() => {}}>
      <WindShiftDots output={output} validReference={validReference} />
      <WindShiftScale output={output} validReference={validReference} windHeadingDegrees={wind} />
    </LanguageProvider>,
  )
}

describe('permanent wind instrument display', () => {
  it('renders equally spaced marks and suppresses fills and the marker without a valid reference', () => {
    const html = render(instrumentAt(145), false, null)
    expect(html).toContain('—°')
    expect(html).toContain('class="wind-shift-endpoint start">−30°')
    expect(html).toContain('class="wind-shift-endpoint end">+30°')
    expect(html.match(/class="wind-cue-dot /g)).toHaveLength(6)
    expect(html).not.toContain('wind-cue-dot active')
    expect(html).not.toContain('wind-shift-marker')
    const tickPositions = [...html.matchAll(/class="wind-shift-tick" style="left:([\d.]+)%"/g)]
      .map((match) => Number(match[1]))
    expect(tickPositions).toHaveLength(4)
    const expectedPositions = [1, 2, 4, 5].map((position) => position * 100 / 6)
    expectedPositions.forEach((position, index) => expect(tickPositions[index]).toBeCloseTo(position))
    expect(html).toContain('wind-shift-center-tick')
  })

  it('shows the existing starboard lift and header output in the correct groups', () => {
    const lift = instrumentAt(145)
    const header = instrumentAt(125)
    expect(lift.liftDots).toBe(1)
    expect(lift.scalePositionDegrees).toBe(10)
    expect(header.headerDots).toBe(1)
    const liftHtml = render(lift, true, 180)
    const headerHtml = render(header, true, 180)
    expect(liftHtml).toContain('wind-cue-dots lift')
    expect(liftHtml).toContain('wind-shift-marker')
    expect(liftHtml).toContain('class="wind-shift-endpoint start">−30°')
    expect(liftHtml).toContain('class="wind-shift-endpoint end">+30°')
    expect(liftHtml.split('wind-cue-dots lift')[1]).toContain('wind-cue-dot active')
    expect(headerHtml.split('wind-cue-dots header')[1].split('wind-cue-dots lift')[0]).toContain('wind-cue-dot active')
  })
})
