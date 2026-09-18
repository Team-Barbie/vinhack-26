import { useCallback, useEffect, useRef, useState } from 'react'
import './NeedsBoard.css'

interface NeedTile {
  id: string
  icon: string
  label: string
  phrase: string
}

type Screen = 'main' | 'more' | 'urgent'

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
  more: { title: 'Comfort & Personal Needs', tiles: MORE_TILES },
  urgent: { title: 'Urgent / Health Requests', tiles: URGENT_TILES },
}

export default function NeedsBoard() {
  const [screen, setScreen] = useState<Screen>('urgent')
  const [phrase, setPhrase] = useState<NeedTile[]>([])
  const [answerFlash, setAnswerFlash] = useState<'yes' | 'no' | null>(null)
  const [isSpeaking, setIsSpeaking] = useState(false)
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
      if (!clipId) {
        setIsSpeaking(false)
        return
      }

      audio.src = `/audio/${clipId}.wav`
      audio.currentTime = 0
      audio.muted = false
      audio.volume = 1
      audio.load()
      setIsSpeaking(true)
      void audio.play().catch(() => {
        setIsSpeaking(false)
        audioQueueRef.current = []
      })
    }

    playNextRef.current()
  }, [])

  const addTile = (tile: NeedTile) => {
    setPhrase((prev) => [...prev, tile])
  }

  const clear = () => setPhrase([])

  const speakPhrase = () => {
    playAudioClips(phrase.map((tile) => tile.id))
  }

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
            className={`phrase-btn speak ${isSpeaking ? 'is-speaking' : ''}`}
            onClick={speakPhrase}
            disabled={phrase.length === 0}
            aria-pressed={isSpeaking}
          >
            {isSpeaking ? '🔊 Speaking…' : '🔊 Speak'}
          </button>
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
            className="need-tile"
            onClick={() => addTile(tile)}
          >
            <span className="need-icon">{tile.icon}</span>
            <span className="need-label">{tile.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
