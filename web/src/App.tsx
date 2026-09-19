import { useState } from 'react'
import CalibrationFlow from './components/CalibrationFlow'
import LogoReveal from './components/LogoReveal'
import NeedsBoard from './components/NeedsBoard'
import RemoteIntro from './components/RemoteIntro'
import { EyeTrackerProvider } from './hooks/EyeTrackerProvider'

type View = 'intro' | 'calibrate' | 'logo' | 'board'

function Shell() {
  const [view, setView] = useState<View>('intro')
  const goBoard = () => setView('board')
  const recalibrate = () => setView('calibrate')

  if (view === 'intro') return <RemoteIntro onCalibrate={recalibrate} />
  if (view === 'logo') return <LogoReveal onDone={goBoard} />
  if (view === 'calibrate') return <CalibrationFlow onDone={() => setView('logo')} />
  return <NeedsBoard onRecalibrate={recalibrate} />
}

function App() {
  return (
    <EyeTrackerProvider>
      <Shell />
    </EyeTrackerProvider>
  )
}

export default App
