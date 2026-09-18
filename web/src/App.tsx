import { useState } from 'react'
import CalibrationFlow from './components/CalibrationFlow'
import Home, { type Destination } from './components/Home'
import { Privacy, Terms } from './components/Legal'
import NeedsBoard from './components/NeedsBoard'
import { EyeTrackerProvider, useEye } from './hooks/EyeTrackerProvider'

type View = 'home' | Destination

function Shell() {
  const { calibrated } = useEye()
  // Calibrate once, up front. A saved calibration skips straight to home.
  const [view, setView] = useState<View>(() => (calibrated ? 'home' : 'calibrate'))
  const goHome = () => setView('home')
  const recalibrate = () => setView('calibrate')

  if (view === 'calibrate') return <CalibrationFlow onDone={goHome} />
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
