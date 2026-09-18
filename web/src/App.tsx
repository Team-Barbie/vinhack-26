import { useState } from 'react'
import AimGame from './components/AimGame'
import Home, { type Destination } from './components/Home'
import { Privacy, Terms } from './components/Legal'
import NeedsBoard from './components/NeedsBoard'

type View = 'home' | Destination

function App() {
  const [view, setView] = useState<View>('home')
  const goHome = () => setView('home')

  if (view === 'board') return <NeedsBoard onExit={goHome} />
  if (view === 'game') return <AimGame onExit={goHome} />
  if (view === 'privacy') return <Privacy onExit={goHome} />
  if (view === 'terms') return <Terms onExit={goHome} />
  return <Home onSelect={setView} />
}

export default App
