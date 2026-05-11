import type { AppView } from '../types'

interface NavigationBarProps {
  currentView: AppView
  isLocked?: boolean
  onChange: (view: AppView) => void
}

const viewItems: Array<{ view: AppView; label: string }> = [
  { view: 'setup', label: 'Setup' },
  { view: 'course', label: 'Bana' },
  { view: 'timer', label: 'Start' },
  { view: 'race', label: 'Segling' },
  { view: 'analysis', label: 'Analys' },
]

export function NavigationBar({ currentView, isLocked = false, onChange }: NavigationBarProps) {
  return (
    <nav className="navigation-bar" aria-label="Primary navigation">
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
            {item.label}
          </button>
        )
      })}
    </nav>
  )
}
