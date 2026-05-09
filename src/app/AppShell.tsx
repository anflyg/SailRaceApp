import { useState } from 'react'
import type { ComponentType } from 'react'
import { NavigationBar } from '../components/NavigationBar'
import { CourseSetupView } from '../features/course/CourseSetupView'
import { StartTimerView } from '../features/timer/StartTimerView'
import { RaceDashboardView } from '../features/race/RaceDashboardView'
import { RaceAnalysisView } from '../features/analysis/RaceAnalysisView'
import type { AppView } from '../types'

const viewTitle: Record<AppView, string> = {
  course: 'Course setup',
  timer: 'Start timer',
  race: 'Race dashboard',
  analysis: 'Race analysis',
}

const viewComponents: Record<AppView, ComponentType> = {
  course: CourseSetupView,
  timer: StartTimerView,
  race: RaceDashboardView,
  analysis: RaceAnalysisView,
}

export function AppShell() {
  const [activeView, setActiveView] = useState<AppView>('course')
  const ActiveView = viewComponents[activeView]

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">SailRaceApp</p>
          <h1>{viewTitle[activeView]}</h1>
        </div>
        <p className="subtitle">Mobile-first sailing race foundation for iPhone 12 and newer.</p>
      </header>

      <NavigationBar currentView={activeView} onChange={setActiveView} />

      <main className="app-panel">
        <ActiveView />
      </main>
    </div>
  )
}
