import { useState } from 'react'
import './App.css'
import { AppShell } from './app/AppShell'
import AsterRaceSplash from './components/AsterRaceSplash'

function App() {
  const [showSplash, setShowSplash] = useState(true)

  return (
    <>
      <AppShell />
      {showSplash && <AsterRaceSplash onComplete={() => setShowSplash(false)} />}
    </>
  )
}

export default App
