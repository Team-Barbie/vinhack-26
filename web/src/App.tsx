import { useState } from 'react'
import AimGame from './components/AimGame'
import Home, { type Destination } from './components/Home'
import NeedsBoard from './components/NeedsBoard'

type View = 'home' | Destination

function App() {
  const [view, setView] = useState<View>('home')
  const goHome = () => setView('home')

  if (view === 'board') return <NeedsBoard onExit={goHome} />
  if (view === 'game') return <AimGame onExit={goHome} />
  return <Home onSelect={setView} />
}

export default App
