import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { LanguageProvider } from '../i18n/LanguageContext'
import { NavigationBar } from './NavigationBar'

describe('NavigationBar', () => {
  it('shows the existing destinations in the requested order and keeps the active destination mapped', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider language="sv" setLanguage={() => {}}>
        <NavigationBar currentView="setup" onChange={() => {}} />
      </LanguageProvider>,
    )
    const labels = [...html.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map(match => match[1])

    expect(labels).toEqual(['Bana', 'Start', 'Segling', 'Setup', 'Analys'])
    expect(html).toContain('class="nav-button active">Setup</button>')
  })
})
