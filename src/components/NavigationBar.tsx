import type { AppView } from '../types'
import { useTranslation } from '../i18n/LanguageContext'

interface NavigationBarProps {
  currentView: AppView
  isLocked?: boolean
  onChange: (view: AppView) => void
}

const viewItems: Array<{ view: AppView; label: 'navigation.setup' | 'navigation.course' | 'navigation.start' | 'navigation.sailing' | 'navigation.analysis' }> = [
  { view: 'setup', label: 'navigation.setup' }, { view: 'course', label: 'navigation.course' }, { view: 'timer', label: 'navigation.start' }, { view: 'race', label: 'navigation.sailing' }, { view: 'analysis', label: 'navigation.analysis' },
]

export function NavigationBar({ currentView, isLocked = false, onChange }: NavigationBarProps) {
  const { t } = useTranslation()
  return (
    <nav className="navigation-bar" aria-label={t('navigation.label')}>
      {viewItems.map((item) => {
        const isActive = currentView === item.view
        const isDisabled = isLocked && !isActive

        return (
          <button
            key={item.view}
            type="button"
            className={`nav-button ${isActive ? 'active' : ''}`}
            onClick={() => onChange(item.view)}
            disabled={isDisabled}
          >
            {t(item.label)}
          </button>
        )
      })}
    </nav>
  )
}
