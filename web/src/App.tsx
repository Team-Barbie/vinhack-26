import { useState } from 'react'
import CalibrationFlow from './components/CalibrationFlow'
import Home, { type Destination } from './components/Home'
import { Privacy, Terms } from './components/Legal'
import NeedsBoard from './components/NeedsBoard'
import RemoteIntro from './components/RemoteIntro'
import { EyeTrackerProvider } from './hooks/EyeTrackerProvider'

type View = 'intro' | 'home' | Destination

function Shell() {
  const [view, setView] = useState<View>('intro')
  const goHome = () => setView('intro')
  const openChoices = () => setView('home')
  const recalibrate = () => setView('calibrate')

  if (view === 'intro') return <RemoteIntro onCalibrate={recalibrate} />
  if (view === 'calibrate') return <CalibrationFlow onDone={openChoices} />
  if (view === 'board') return <NeedsBoard onExit={goHome} onRecalibrate={recalibrate} />
  if (view === 'privacy') return <Privacy onExit={goHome} />
  if (view === 'terms') return <Terms onExit={goHome} />
  return <Home onSelect={setView} />
}

function App() {
  return (
    <EyeTrackerProvider>
      <Shell />
    </EyeTrackerProvider>
  )
}

export default App
