import { useState } from 'react'
import type { ComponentType } from 'react'
import { NavigationBar } from '../components/NavigationBar'
import { CourseSetupView } from '../features/course/CourseSetupView'
import { StartTimerView } from '../features/timer/StartTimerView'
import { RaceDashboardView } from '../features/race/RaceDashboardView'
import { RaceAnalysisView } from '../features/analysis/RaceAnalysisView'
import type { AppView } from '../types'

const viewTitle: Record<AppView, string> = {
  course: 'Bana',
  timer: 'Start',
  race: 'Segling',
  analysis: 'Analys',
}

const viewComponents: Record<AppView, ComponentType<any>> = {
  course: CourseSetupView,
  timer: StartTimerView,
  race: RaceDashboardView,
  analysis: RaceAnalysisView,
}

export function AppShell() {
  const [activeView, setActiveView] = useState<AppView>('course')
  const ActiveView = viewComponents[activeView]
  const compactHeader = activeView !== 'analysis'

  return (
    <div className={`app-shell ${activeView}`}>
      <header className={`app-header ${compactHeader ? 'header-compact' : ''}`}>
        <div>
          <p className="eyebrow">SailRaceApp</p>
          <h1>{viewTitle[activeView]}</h1>
        </div>
        <p className="subtitle">Startar på Bana. Klar för vattenläge.</p>
      </header>

      <NavigationBar currentView={activeView} onChange={setActiveView} />

      <main className="app-panel">
        <ActiveView onFinish={() => setActiveView('race')} />
      </main>
    </div>
  )
}
