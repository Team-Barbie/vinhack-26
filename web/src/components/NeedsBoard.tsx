import { useCallback, useEffect, useRef, useState } from 'react'
import { useEyeTracker } from '../hooks/useEyeTracker'
import { Calibration, FaceChip } from './AimGame'
import GazePhraseBoard from './GazePhraseBoard'
import EyeRemote from './EyeRemote'
import './AimGame.css'
import './NeedsBoard.css'

interface NeedTile {
  id: string
  icon: string
  label: string
  phrase: string
  instant?: boolean
  group?: 'person' | 'action' | 'question' | 'care' | 'feeling' | 'modifier'
}

type Screen = 'main' | 'quick' | 'gaze' | 'sentence' | 'more' | 'urgent'

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

const SENTENCE_TILES: NeedTile[] = [
  { id: 'word-i', icon: '🧍', label: 'I', phrase: 'I', group: 'person' },
  { id: 'word-you', icon: '🫵', label: 'You', phrase: 'you', group: 'person' },
  { id: 'word-am', icon: '═', label: 'Am / Is', phrase: 'am', group: 'modifier' },
  { id: 'word-want', icon: '🤲', label: 'Want', phrase: 'want', group: 'action' },
  { id: 'word-need', icon: '🫴', label: 'Need', phrase: 'need', group: 'action' },
  { id: 'word-have', icon: '🤝', label: 'Have', phrase: 'have', group: 'action' },
  { id: 'word-feel', icon: '🫀', label: 'Feel', phrase: 'feel', group: 'action' },
  { id: 'word-help', icon: '🙋', label: 'Help', phrase: 'help', group: 'care' },
  { id: 'word-what', icon: '❔', label: 'What?', phrase: 'what', group: 'question' },
  { id: 'word-where', icon: '📍', label: 'Where?', phrase: 'where', group: 'question' },
  { id: 'word-nurse', icon: '🧑‍⚕️', label: 'Nurse', phrase: 'nurse', group: 'care' },
  { id: 'word-doctor', icon: '🩺', label: 'Doctor', phrase: 'doctor', group: 'care' },
  { id: 'word-water', icon: '💧', label: 'Water', phrase: 'water', group: 'care' },
  { id: 'word-medicine', icon: '💊', label: 'Medicine', phrase: 'medicine', group: 'care' },
  { id: 'word-pain', icon: '🤕', label: 'Pain', phrase: 'pain', group: 'feeling' },
  { id: 'word-hot', icon: '🥵', label: 'Hot', phrase: 'hot', group: 'feeling' },
  { id: 'word-cold', icon: '🥶', label: 'Cold', phrase: 'cold', group: 'feeling' },
  { id: 'word-good', icon: '👍', label: 'Good', phrase: 'good', group: 'feeling' },
  { id: 'word-bad', icon: '👎', label: 'Bad', phrase: 'bad', group: 'feeling' },
  { id: 'word-more', icon: '➕', label: 'More', phrase: 'more', group: 'modifier' },
  { id: 'word-not', icon: '✖️', label: 'Not', phrase: 'not', group: 'modifier' },
  { id: 'word-please', icon: '🙏', label: 'Please', phrase: 'please', group: 'modifier' },
  { id: 'word-now', icon: '⏱️', label: 'Now', phrase: 'now', group: 'modifier' },
  { id: 'word-finished', icon: '🏁', label: 'Finished', phrase: 'finished', group: 'modifier' },
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
  gaze: { title: 'Gaze Phrases', tiles: [] },
  sentence: { title: 'Sentence Builder · choose words from left to right', tiles: SENTENCE_TILES },
  more: { title: 'Comfort & Personal Needs', tiles: MORE_TILES },
  urgent: { title: 'Urgent / Health Requests', tiles: URGENT_TILES },
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

export default function NeedsBoard({ onExit }: { onExit: () => void }) {
  const eye = useEyeTracker()
  const [screen, setScreen] = useState<Screen>('main')
  const [boardPhase, setBoardPhase] = useState<'setup' | 'calibrating' | 'board'>('board')
  const boardRef = useRef<HTMLDivElement | null>(null)
  const [remoteVersion, setRemoteVersion] = useState(0)
  const [sentence, setSentence] = useState<NeedTile[]>([])
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

    if (screen === 'sentence') {
      setSentence((prev) => [...prev, tile])
      speak(tile.phrase)
      flashTile(tile.id, 450)
      return
    }

    if (tile.instant) speak(tile.phrase)
    else {
      playAudioClips([tile.id])
      speak(tile.phrase)
    }
    setSpokenMessage(tile.phrase)
    flashTile(tile.id, 650)
    if (PAGER_IDS.has(tile.id)) setPager(`Nurse alerted at ${nurseTime()}`)
  }

  const clearSentence = () => setSentence([])
  const undoSentence = () => setSentence((prev) => prev.slice(0, -1))

  const speakSentence = () => {
    speak(sentence.map((tile) => tile.phrase).join(' '))
  }

  const answer = (value: 'yes' | 'no') => {
    playAudioClips([`answer-${value}`])
    setAnswerFlash(value)
    window.setTimeout(() => setAnswerFlash((current) => (current === value ? null : current)), 500)
  }

  const { title, tiles } = SCREENS[screen]


  if (boardPhase === 'calibrating') {
    return (
      <div className="needs-board">
        <video ref={eye.videoRef} className="board-cam" muted playsInline />
        <Calibration
          eye={eye}
          onComplete={(model) => {
            if (!model) {
              setBoardPhase('setup')
              return
            }
            eye.setCalibration(model)
            setBoardPhase('board')
          }}
          onCancel={() => setBoardPhase('setup')}
        />
      </div>
    )
  }

  if (boardPhase === 'setup') {
    const ready = eye.status === 'ready' && eye.faceFound
    return (
      <div className="needs-board">
        <video ref={eye.videoRef} className="board-cam is-large" muted playsInline />
        <div className="board-setup">
          <span className="board-setup-eyebrow">GazeBridge</span>
          <h1>Look at a request. Blink to confirm.</h1>
          <p>Sit 50–80 cm from the camera. Keep your head still and move only your eyes to each glowing dot. Recalibrate — the old saved map will not work.</p>
          <FaceChip eye={eye} />
          {eye.status === 'error' && <p className="board-setup-error">{eye.error}</p>}
          <div className="board-setup-actions">
            <button type="button" className="home-btn" disabled={!ready} onClick={() => setBoardPhase('calibrating')}>
              {eye.calibrated ? 'Recalibrate' : 'Start calibration'}
            </button>
            {eye.calibrated && (
              <button type="button" className="home-btn" disabled={!ready} onClick={() => setBoardPhase('board')}>
                Use saved calibration
              </button>
            )}
            <button type="button" className="home-btn" onClick={() => setBoardPhase('board')}>
              Skip — tap to demo
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div ref={boardRef} className={`needs-board screen-${screen} ${screen !== 'gaze' ? 'has-eye-remote' : ''}`}>
      <video ref={eye.videoRef} className="board-cam" muted playsInline />
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
          ← Home
        </button>
        <button type="button" className="home-btn" onClick={() => screen === 'gaze' ? setBoardPhase('calibrating') : setRemoteVersion((v) => v + 1)}>
          {screen === 'gaze' ? 'Recalibrate' : 'Reset remote'}
        </button>
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
            className={`nav-tab ${screen === 'gaze' ? 'active' : ''}`}
            onClick={() => setScreen('gaze')}
          >
            Gaze Phrases
          </button>
          <button
            type="button"
            className={`nav-tab ${screen === 'sentence' ? 'active' : ''}`}
            onClick={() => setScreen('sentence')}
          >
            Sentence Board
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

      {screen !== 'gaze' && <EyeRemote key={remoteVersion} eye={eye} root={boardRef} screenKey={screen} autoStart />}
      {screen !== 'gaze' && (
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
      )}

      {screen === 'gaze' ? (
        <GazePhraseBoard eye={eye} />
      ) : screen === 'sentence' ? (
        <div className="phrase-bar">
          <div className="phrase-text" aria-live="polite">
            {sentence.length === 0 ? (
              <span className="phrase-placeholder">Choose words below to build a sentence…</span>
            ) : (
              sentence.map((t, i) => (
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
              className="phrase-btn speak"
              onClick={speakSentence}
              disabled={sentence.length === 0}
            >
              🔊 Speak
            </button>
            <button
              type="button"
              className="phrase-btn undo"
              onClick={undoSentence}
              disabled={sentence.length === 0}
            >
              ↶ Undo
            </button>
            <button
              type="button"
              className="phrase-btn clear"
              onClick={clearSentence}
              disabled={sentence.length === 0}
            >
              Clear
            </button>
          </div>
        </div>
      ) : (
        <div className="speech-status" role="status" aria-live="polite">
          {spokenMessage ? `Spoke: “${spokenMessage}”` : 'Look left / right / up / down to move · center stops · hold a blink to select · or tap'}
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
                className={`need-tile ${tile.group ? `group-${tile.group}` : ''} ${spokenTile === tile.id ? 'spoken' : ''}`}
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
