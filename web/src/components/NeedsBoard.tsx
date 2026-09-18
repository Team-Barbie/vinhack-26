import { useCallback, useEffect, useRef, useState } from 'react'
import { useEye } from '../hooks/EyeTrackerProvider'
import GazePhraseBoard from './GazePhraseBoard'
import EyeRemote from './EyeRemote'
import './NeedsBoard.css'

interface NeedTile {
  id: string
  icon: string
  label: string
  phrase: string
  instant?: boolean
}

type Screen = 'main' | 'quick' | 'gaze' | 'more' | 'urgent'

const MAIN_TILES: NeedTile[] = [
  { id: 'nurse', icon: '🔔', label: 'Call a nurse', phrase: 'I need a nurse' },
  { id: 'water', icon: '💧', label: 'Water', phrase: 'I need drinking water' },
  { id: 'bathroom', icon: '🚻', label: 'Bathroom', phrase: 'I need help using the bathroom' },
  { id: 'move', icon: '🦽', label: 'Help me move', phrase: 'Help me sit up, stand, or move' },
  { id: 'medicine', icon: '💊', label: 'Medicine', phrase: 'I need to discuss medication or pain' },
  { id: 'pain', icon: '🤕', label: "I'm in pain", phrase: 'I am experiencing discomfort' },
  { id: 'food', icon: '🍽️', label: 'Food', phrase: 'I need food or meal assistance' },
  { id: 'reposition', icon: '🔄', label: 'Turn me', phrase: 'I need to be repositioned' },
  { id: 'blanket', icon: '🛏️', label: 'Blanket or pillow', phrase: 'I need a blanket or pillow' },
  { id: 'temperature', icon: '🌡️', label: 'Too hot or cold', phrase: 'The room or I feel too hot or cold' },
]

const MORE_TILES: NeedTile[] = [
  { id: 'hygiene', icon: '🧼', label: 'Wash me', phrase: 'I need hygiene assistance' },
  { id: 'clean-room', icon: '🧹', label: 'Clean the room', phrase: 'My surroundings need cleaning' },
  { id: 'bedpan', icon: '🗑️', label: 'Bedpan', phrase: 'I need waste or bedpan assistance' },
  { id: 'family', icon: '📞', label: 'Call my family', phrase: 'I want to contact a family member' },
  { id: 'belongings', icon: '👓', label: 'My glasses or things', phrase: 'I need help locating something' },
  { id: 'phone', icon: '🔌', label: 'Phone or charger', phrase: 'I need my phone or charger' },
  { id: 'room', icon: '💡', label: 'Lights or curtains', phrase: 'Help with curtains, lights, or room settings' },
  { id: 'rest', icon: '😴', label: "I'm fine, let me rest", phrase: "I don't need assistance right now" },
]

const QUICK_TILES: NeedTile[] = [
  { id: 'help', icon: '🙋', label: 'Help', phrase: 'I need help', instant: true },
  { id: 'stop', icon: '✋', label: 'Stop', phrase: 'Please stop', instant: true },
  { id: 'more', icon: '➕', label: 'More', phrase: 'I want more', instant: true },
  { id: 'finished', icon: '✅', label: 'Finished', phrase: 'I am finished', instant: true },
  { id: 'please', icon: '🙏', label: 'Please', phrase: 'Please', instant: true },
  { id: 'thanks', icon: '💛', label: 'Thank you', phrase: 'Thank you', instant: true },
  { id: 'repeat', icon: '🔁', label: 'Say that again', phrase: 'Please repeat that', instant: true },
  { id: 'understand', icon: '❓', label: "I don't understand", phrase: "I don't understand", instant: true },
  { id: 'wait', icon: '⏳', label: 'Wait', phrase: 'Please wait', instant: true },
  { id: 'talk', icon: '💬', label: 'Talk to me', phrase: 'I need to talk to you', instant: true },
  { id: 'wrong', icon: '⚠️', label: "Something's wrong", phrase: 'Something is wrong', instant: true },
  { id: 'uncomfortable', icon: '😣', label: "I'm uncomfortable", phrase: 'I am uncomfortable', instant: true },
]

const URGENT_TILES: NeedTile[] = [
  { id: 'emergency', icon: '🚨', label: 'Get help now', phrase: 'I need immediate assistance' },
  { id: 'breathing', icon: '🫁', label: "Can't breathe well", phrase: "I'm having difficulty breathing" },
  { id: 'nauseous', icon: '🤢', label: 'I feel sick', phrase: 'I feel like vomiting' },
  { id: 'bleeding', icon: '🩸', label: 'Bleeding', phrase: 'I need help with bleeding' },
  { id: 'dizzy', icon: '😵‍💫', label: 'Dizzy or faint', phrase: 'I feel dizzy or faint' },
  { id: 'unwell', icon: '🤒', label: 'Something feels off', phrase: 'Something feels wrong' },
]

const SCREENS: Record<Screen, { title: string; tiles: NeedTile[] }> = {
  main: { title: 'What do you need?', tiles: MAIN_TILES },
  quick: { title: 'Say something', tiles: QUICK_TILES },
  gaze: { title: 'Phrases', tiles: [] },
  more: { title: 'Other requests', tiles: MORE_TILES },
  urgent: { title: 'Something is wrong', tiles: URGENT_TILES },
}

const PAGER_IDS = new Set(['nurse', 'emergency', 'breathing', 'nauseous', 'bleeding', 'dizzy', 'unwell'])
const COOLDOWN_MS = 1300

function nurseTime() {
  return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function speak(text: string) {
  if (!text || !('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.rate = 0.9
  window.speechSynthesis.speak(utterance)
}

export default function NeedsBoard({ onExit, onRecalibrate }: { onExit: () => void; onRecalibrate: () => void }) {
  const eye = useEye()
  const [screen, setScreen] = useState<Screen>('main')
  const boardRef = useRef<HTMLDivElement | null>(null)
  const [answerFlash, setAnswerFlash] = useState<'yes' | 'no' | null>(null)
  const [spokenTile, setSpokenTile] = useState<string | null>(null)
  const [spokenMessage, setSpokenMessage] = useState('')
  const [pager, setPager] = useState('')
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioQueueRef = useRef<string[]>([])
  const playNextRef = useRef<() => void>(() => undefined)
  const coolUntil = useRef(0)

  useEffect(() => () => {
    audioRef.current?.pause()
    audioQueueRef.current = []
  }, [])

  const playAudioClips = useCallback((clipIds: string[]) => {
    const audio = audioRef.current
    if (!audio) return

    audio.pause()
    audioQueueRef.current = [...clipIds]

    playNextRef.current = () => {
      const clipId = audioQueueRef.current.shift()
      if (!clipId) return

      audio.src = `/audio/${clipId}.wav`
      audio.currentTime = 0
      audio.muted = false
      audio.volume = 1
      audio.load()
      void audio.play().catch(() => {
        audioQueueRef.current = []
      })
    }

    playNextRef.current()
  }, [])

  const flashTile = (id: string, ms: number) => {
    setSpokenTile(id)
    window.setTimeout(() => {
      setSpokenTile((current) => (current === id ? null : current))
    }, ms)
  }

  const activateTile = (tile: NeedTile) => {
    if (performance.now() < coolUntil.current) return
    coolUntil.current = performance.now() + COOLDOWN_MS

    if (tile.instant) speak(tile.phrase)
    else {
      playAudioClips([tile.id])
      speak(tile.phrase)
    }
    setSpokenMessage(tile.phrase)
    flashTile(tile.id, 650)
    if (PAGER_IDS.has(tile.id)) setPager(`Nurse alerted at ${nurseTime()}`)
  }

  const answer = (value: 'yes' | 'no') => {
    playAudioClips([`answer-${value}`])
    setAnswerFlash(value)
    window.setTimeout(() => setAnswerFlash((current) => (current === value ? null : current)), 500)
  }

  const { title, tiles } = SCREENS[screen]

  return (
    <div ref={boardRef} className={`needs-board screen-${screen} ${screen !== 'gaze' ? 'has-eye-remote' : ''}`}>
      {pager && <div className="pager-banner" role="status">{pager}</div>}
      <audio
        ref={audioRef}
        preload="auto"
        playsInline
        onEnded={() => playNextRef.current()}
        onError={() => playNextRef.current()}
      />
      <div className="board-nav">
        <button type="button" className="home-btn" onClick={onExit}>
          Home
        </button>
        <button type="button" className="home-btn" onClick={onRecalibrate}>
          Calibrate again
        </button>
        <div className="nav-tabs">
          <button
            type="button"
            className={`nav-tab ${screen === 'main' ? 'active' : ''}`}
            onClick={() => setScreen('main')}
          >
            Needs
          </button>
          <button
            type="button"
            className={`nav-tab ${screen === 'quick' ? 'active' : ''}`}
            onClick={() => setScreen('quick')}
          >
            Talk
          </button>
          <button
            type="button"
            className={`nav-tab ${screen === 'gaze' ? 'active' : ''}`}
            onClick={() => setScreen('gaze')}
          >
            Phrases
          </button>
          <button
            type="button"
            className={`nav-tab ${screen === 'more' ? 'active' : ''}`}
            onClick={() => setScreen('more')}
          >
            More
          </button>
        </div>
        <button
          type="button"
          className={`emergency-btn ${screen === 'urgent' ? 'active' : ''}`}
          onClick={() => setScreen('urgent')}
        >
          Emergency
        </button>
      </div>

      {screen !== 'gaze' && <EyeRemote eye={eye} root={boardRef} screenKey={screen} />}
      {screen !== 'gaze' && (
        <div className="quick-answer">
          <span className="quick-answer-label">Answer a question</span>
          <div className="quick-answer-buttons">
            <button
              type="button"
              className={`answer-btn answer-yes ${answerFlash === 'yes' ? 'flash' : ''}`}
              onClick={() => answer('yes')}
            >
              Yes
            </button>
            <button
              type="button"
              className={`answer-btn answer-no ${answerFlash === 'no' ? 'flash' : ''}`}
              onClick={() => answer('no')}
            >
              No
            </button>
          </div>
        </div>
      )}

      {screen === 'gaze' ? (
        <GazePhraseBoard eye={eye} />
      ) : (
        <div className="speech-status" role="status" aria-live="polite">
          {spokenMessage ? `Said: "${spokenMessage}"` : 'Tap a card, or use the eye remote above.'}
        </div>
      )}

      {screen !== 'gaze' && (
        <>
          <h2 className="screen-title">{title}</h2>
          <div className="tile-grid">
            {tiles.map((tile) => (
              <button
                key={tile.id}
                type="button"
                aria-label={tile.label}
                className={`need-tile ${spokenTile === tile.id ? 'spoken' : ''}`}
                onClick={() => activateTile(tile)}
              >
                <span className="need-icon">{tile.icon}</span>
                <span className="need-label">{tile.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
