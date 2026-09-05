import { createContext, useContext } from 'react'
import type { Dispatch, ReactNode, SetStateAction } from 'react'
import { translations, type AppLanguage, type TranslationKey } from './translations'

type TranslationValues = Record<string, string | number>
type LanguageContextValue = { language: AppLanguage; setLanguage: Dispatch<SetStateAction<AppLanguage>>; t: (key: TranslationKey, values?: TranslationValues) => string }
export type Translate = LanguageContextValue['t']
const LanguageContext = createContext<LanguageContextValue | null>(null)

export function LanguageProvider({ language, setLanguage, children }: Pick<LanguageContextValue, 'language' | 'setLanguage'> & { children: ReactNode }) {
  const t = (key: TranslationKey, values?: TranslationValues) => Object.entries(values ?? {}).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
    translations[language][key] as string,
  )
  return <LanguageContext.Provider value={{ language, setLanguage, t }}>{children}</LanguageContext.Provider>
}

export function useTranslation() {
  const context = useContext(LanguageContext)
  if (!context) throw new Error('useTranslation must be used within LanguageProvider')
  return context
}
