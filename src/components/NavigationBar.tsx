import type { AppView } from '../types'

interface NavigationBarProps {
  currentView: AppView
  onChange: (view: AppView) => void
}

const viewItems: Array<{ view: AppView; label: string }> = [
  { view: 'course', label: 'Course' },
  { view: 'timer', label: 'Timer' },
  { view: 'race', label: 'Race' },
  { view: 'analysis', label: 'Analysis' },
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
