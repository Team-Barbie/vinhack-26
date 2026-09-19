import { useEffect, useState } from 'react'
import CalibrationFlow from './components/CalibrationFlow'
import LogoReveal from './components/LogoReveal'
import NeedsBoard from './components/NeedsBoard'
import RemoteIntro from './components/RemoteIntro'
import { EyeTrackerProvider } from './hooks/EyeTrackerProvider'
import { unlockAlertAudio } from './lib/alert'

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
  useEffect(() => {
    const unlock = () => unlockAlertAudio()
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])

  return (
    <EyeTrackerProvider>
      <Shell />
    </EyeTrackerProvider>
  )
}

export default App
