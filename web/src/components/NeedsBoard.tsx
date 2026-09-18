import { useCallback, useEffect, useRef, useState } from 'react'
import './NeedsBoard.css'

interface NeedTile {
  id: string
  icon: string
  label: string
  phrase: string
  instant?: boolean
}

type Screen = 'main' | 'quick' | 'more' | 'urgent'

const MAIN_TILES: NeedTile[] = [
  { id: 'nurse', icon: '🔔', label: 'Call Nurse', phrase: 'I need a nurse' },
  { id: 'water', icon: '💧', label: 'Water', phrase: 'I need drinking water' },
  { id: 'bathroom', icon: '🚻', label: 'Bathroom', phrase: 'I need help using the bathroom' },
  { id: 'move', icon: '🦽', label: 'Help Me Move', phrase: 'Help me sit up, stand, or move' },
  { id: 'medicine', icon: '💊', label: 'Medicine / Pain Relief', phrase: 'I need to discuss medication or pain' },
  { id: 'pain', icon: '🤕', label: "I'm in Pain", phrase: 'I am experiencing discomfort' },
  { id: 'food', icon: '🍽️', label: 'Food', phrase: 'I need food or meal assistance' },
  { id: 'reposition', icon: '🔄', label: 'Change Position', phrase: 'I need to be repositioned' },
  { id: 'blanket', icon: '🛏️', label: 'Blanket / Pillow', phrase: 'I need a blanket or pillow' },
  { id: 'temperature', icon: '🌡️', label: 'Too Hot / Cold', phrase: 'The room or I feel too hot or cold' },
]

const MORE_TILES: NeedTile[] = [
  { id: 'hygiene', icon: '🧼', label: 'Clean Me / Hygiene', phrase: 'I need hygiene assistance' },
  { id: 'clean-room', icon: '🧹', label: 'Clean Room', phrase: 'My surroundings need cleaning' },
  { id: 'bedpan', icon: '🗑️', label: 'Bedpan / Waste', phrase: 'I need waste or bedpan assistance' },
  { id: 'family', icon: '📞', label: 'Call Family', phrase: 'I want to contact a family member' },
  { id: 'belongings', icon: '👓', label: 'Glasses / Belongings', phrase: 'I need help locating something' },
  { id: 'phone', icon: '🔌', label: 'Phone / Charger', phrase: 'I need my phone or charger' },
  { id: 'room', icon: '💡', label: 'Adjust Room', phrase: 'Help with curtains, lights, or room settings' },
  { id: 'rest', icon: '😴', label: "I'm Ready to Rest", phrase: "I don't need assistance right now" },
]

const QUICK_TILES: NeedTile[] = [
  { id: 'help', icon: '🙋', label: 'Help', phrase: 'I need help', instant: true },
  { id: 'stop', icon: '✋', label: 'Stop', phrase: 'Please stop', instant: true },
  { id: 'more', icon: '➕', label: 'More', phrase: 'I want more', instant: true },
  { id: 'finished', icon: '✅', label: 'Finished', phrase: 'I am finished', instant: true },
  { id: 'please', icon: '🙏', label: 'Please', phrase: 'Please', instant: true },
  { id: 'thanks', icon: '💛', label: 'Thank You', phrase: 'Thank you', instant: true },
  { id: 'repeat', icon: '🔁', label: 'Repeat That', phrase: 'Please repeat that', instant: true },
  { id: 'understand', icon: '❓', label: "I Don't Understand", phrase: "I don't understand", instant: true },
  { id: 'wait', icon: '⏳', label: 'Please Wait', phrase: 'Please wait', instant: true },
  { id: 'talk', icon: '💬', label: 'Talk to Me', phrase: 'I need to talk to you', instant: true },
  { id: 'wrong', icon: '⚠️', label: "Something's Wrong", phrase: 'Something is wrong', instant: true },
  { id: 'uncomfortable', icon: '😣', label: "I'm Uncomfortable", phrase: 'I am uncomfortable', instant: true },
]

const URGENT_TILES: NeedTile[] = [
  { id: 'emergency', icon: '🚨', label: 'Emergency Help', phrase: 'I need immediate assistance' },
  { id: 'breathing', icon: '🫁', label: 'Breathing Trouble', phrase: "I'm having difficulty breathing" },
  { id: 'nauseous', icon: '🤢', label: 'Feeling Nauseous', phrase: 'I feel like vomiting' },
  { id: 'bleeding', icon: '🩸', label: 'Bleeding', phrase: 'I need help with bleeding' },
  { id: 'dizzy', icon: '😵‍💫', label: 'Dizzy / Faint', phrase: 'I feel dizzy or faint' },
  { id: 'unwell', icon: '🤒', label: 'Feeling Unwell', phrase: 'Something feels wrong' },
]

const SCREENS: Record<Screen, { title: string; tiles: NeedTile[] }> = {
  main: { title: 'Essential Requests', tiles: MAIN_TILES },
  quick: { title: 'Quick Talk · tap once to speak', tiles: QUICK_TILES },
  more: { title: 'Comfort & Personal Needs', tiles: MORE_TILES },
  urgent: { title: 'Urgent / Health Requests', tiles: URGENT_TILES },
}

function speak(text: string) {
  if (!text || !('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.rate = 0.9
  window.speechSynthesis.speak(utterance)
}

export default function NeedsBoard() {
  const [screen, setScreen] = useState<Screen>('urgent')
  const [phrase, setPhrase] = useState<NeedTile[]>([])
  const [answerFlash, setAnswerFlash] = useState<'yes' | 'no' | null>(null)
  const [spokenTile, setSpokenTile] = useState<string | null>(null)
  const [spokenMessage, setSpokenMessage] = useState('')
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioQueueRef = useRef<string[]>([])
  const playNextRef = useRef<() => void>(() => undefined)

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

  const addTile = (tile: NeedTile) => {
    setPhrase((prev) => [...prev, tile])
    playAudioClips([tile.id])
  }

  const activateTile = (tile: NeedTile) => {
    if (!tile.instant) {
      addTile(tile)
      return
    }

    speak(tile.phrase)
    setSpokenTile(tile.id)
    setSpokenMessage(tile.phrase)
    window.setTimeout(() => {
      setSpokenTile((current) => (current === tile.id ? null : current))
    }, 650)
  }

  const clear = () => setPhrase([])

  const answer = (value: 'yes' | 'no') => {
    playAudioClips([`answer-${value}`])
    setAnswerFlash(value)
    window.setTimeout(() => setAnswerFlash((current) => (current === value ? null : current)), 500)
  }

  const { title, tiles } = SCREENS[screen]

  return (
    <div className={`needs-board screen-${screen}`}>
      <audio
        ref={audioRef}
        preload="auto"
        playsInline
        onEnded={() => playNextRef.current()}
        onError={() => playNextRef.current()}
      />
      <div className="board-nav">
        <div className="nav-tabs">
          <button
            type="button"
            className={`nav-tab ${screen === 'main' ? 'active' : ''}`}
            onClick={() => setScreen('main')}
          >
            Main
          </button>
          <button
            type="button"
            className={`nav-tab ${screen === 'quick' ? 'active' : ''}`}
            onClick={() => setScreen('quick')}
          >
            Quick Talk
          </button>
          <button
            type="button"
            className={`nav-tab ${screen === 'more' ? 'active' : ''}`}
            onClick={() => setScreen('more')}
          >
            More Requests
          </button>
        </div>
        <button
          type="button"
          className={`emergency-btn ${screen === 'urgent' ? 'active' : ''}`}
          onClick={() => setScreen('urgent')}
        >
          🚨 Emergency
        </button>
      </div>

      <div className="quick-answer">
        <span className="quick-answer-label">Answering a question?</span>
        <div className="quick-answer-buttons">
          <button
            type="button"
            className={`answer-btn answer-yes ${answerFlash === 'yes' ? 'flash' : ''}`}
            onClick={() => answer('yes')}
          >
            ✅ Yes
          </button>
          <button
            type="button"
            className={`answer-btn answer-no ${answerFlash === 'no' ? 'flash' : ''}`}
            onClick={() => answer('no')}
          >
            ❌ No
          </button>
        </div>
      </div>

      {screen === 'quick' && (
        <div className="speech-status" role="status" aria-live="polite">
          {spokenMessage ? `Spoke: “${spokenMessage}”` : 'Ready to speak'}
        </div>
      )}

      <div className="phrase-bar">
        <div className="phrase-text" aria-live="polite">
          {phrase.length === 0 ? (
            <span className="phrase-placeholder">Tap icons below to build a phrase…</span>
          ) : (
            phrase.map((t, i) => (
              <span key={`${t.id}-${i}`} className="phrase-chip">
                <span className="phrase-chip-icon">{t.icon}</span>
                {t.phrase}
              </span>
            ))
          )}
        </div>
        <div className="phrase-actions">
          <button
            type="button"
            className="phrase-btn clear"
            onClick={clear}
            disabled={phrase.length === 0}
          >
            Clear
          </button>
        </div>
      </div>

      <h2 className="screen-title">{title}</h2>

      <div className="tile-grid">
        {tiles.map((tile) => (
          <button
            key={tile.id}
            type="button"
            className={`need-tile ${spokenTile === tile.id ? 'spoken' : ''}`}
            onClick={() => activateTile(tile)}
          >
            <span className="need-icon">{tile.icon}</span>
            <span className="need-label">{tile.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
