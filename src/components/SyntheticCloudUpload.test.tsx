import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../i18n/LanguageContext'
import { NativeTestControl } from '../services/sync/nativeTestControl'
import { SyntheticCloudUpload } from './SyntheticCloudUpload'

describe('real synthetic upload UI', () => {
  it('keeps missing native configuration disabled and performs no work on rendering', () => {
    const create = vi.fn(), control = new NativeTestControl(null, create)
    const html = renderToStaticMarkup(<LanguageProvider language="sv" setLanguage={vi.fn()}><SyntheticCloudUpload control={control} /></LanguageProvider>)
    expect(html).toContain('Syntetisk molnuppladdning')
    expect(html).toContain('Dina inspelade race används inte')
    expect(html).toContain('disabled=""')
    expect(html).toContain('gratisutrymmet')
    expect(create).not.toHaveBeenCalled()
  })
})
