import type { AppView } from '../types'

interface NavigationBarProps {
  currentView: AppView
  onChange: (view: AppView) => void
}

const viewItems: Array<{ view: AppView; label: string }> = [
  { view: 'setup', label: 'Setup' },
  { view: 'course', label: 'Bana' },
  { view: 'timer', label: 'Start' },
  { view: 'race', label: 'Segling' },
  { view: 'analysis', label: 'Analys' },
]

export function NavigationBar({ currentView, onChange }: NavigationBarProps) {
  return (
    <nav className="navigation-bar" aria-label="Primary navigation">
      {viewItems.map((item) => (
        <button
          key={item.view}
          type="button"
          className={`nav-button ${currentView === item.view ? 'active' : ''}`}
          onClick={() => onChange(item.view)}
        >
          {item.label}
        </button>
      ))}
    </nav>
  )
}
