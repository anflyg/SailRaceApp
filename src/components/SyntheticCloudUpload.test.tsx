import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../i18n/LanguageContext'
import { NativeTestControl } from '../services/sync/nativeTestControl'
import { SyntheticCloudUpload } from './SyntheticCloudUpload'
import { SyncError } from '../services/sync/types'
import type { createIsolatedNativeSync } from '../services/sync/isolatedNative'

describe('real synthetic upload UI', () => {
  it('explains expiry and offers a distinct explicit test, without starting it during rendering', async () => {
    const newTest = vi.fn(), sync = vi.fn(async () => { throw new SyncError('upload_expired') })
    const handle = { stop: vi.fn(), account: { snapshot: () => ({ status: 'signed_in' }), restore: vi.fn() }, sync, newTest }
    const control = new NativeTestControl({ purpose: 'synthetic-existing-backend', workerOrigin: 'https://api.tackwise.se', approvedWorkerOrigin: 'https://api.tackwise.se', auth: { url: 'https://auth.synthetic.invalid', publishableKey: 'sb_publishable_fixture' } }, vi.fn(async () => handle) as unknown as typeof createIsolatedNativeSync)
    await control.upload()
    const html = renderToStaticMarkup(<LanguageProvider language="sv" setLanguage={vi.fn()}><SyntheticCloudUpload control={control} /></LanguageProvider>)
    expect(html).toContain('Testets uppladdningstid har gått ut')
    expect(html).toContain('Starta nytt syntetiskt test')
    expect(html).toContain('Det tidigare försöket bevaras')
    expect(newTest).not.toHaveBeenCalled()
    expect(sync).toHaveBeenCalledOnce()
  })
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
