import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { LanguageProvider } from '../i18n/LanguageContext'
import { translations } from '../i18n/translations'
import { confirmRecordingStop, RecordingControl } from './RecordingControl'

describe('recording control', () => {
  it('shows the active state and a large, explicit stop action in both languages', () => {
    for (const language of ['sv', 'en'] as const) {
      const html = renderToStaticMarkup(
        <LanguageProvider language={language} setLanguage={() => {}}>
          <RecordingControl active messageKey={null} onStop={() => {}} />
        </LanguageProvider>,
      )
      expect(html).toContain(translations[language]['recording.active'])
      expect(html).toContain(translations[language]['recording.stop'])
      expect(html).toContain('recording-stop-button')
      expect(html).toContain('role="status"')
    }
  })

  it('does not stop when confirmation is cancelled', () => {
    const onStop = vi.fn()
    const confirm = vi.fn(() => false)

    expect(confirmRecordingStop('Confirm stop?', onStop, confirm)).toBe(false)
    expect(confirm).toHaveBeenCalledWith('Confirm stop?')
    expect(onStop).not.toHaveBeenCalled()
  })

  it('stops only after confirmation', () => {
    const onStop = vi.fn()

    expect(confirmRecordingStop('Confirm stop?', onStop, () => true)).toBe(true)
    expect(onStop).toHaveBeenCalledOnce()
  })

  it('shows the saved-in-library acknowledgement after stopping', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider language="sv" setLanguage={() => {}}>
        <RecordingControl active={false} messageKey="recording.saved" onStop={() => {}} />
      </LanguageProvider>,
    )

    expect(html).toContain(translations.sv['recording.saved'])
    expect(html).not.toContain('recording-stop-button')
  })
})
