import { useRef, useState } from 'react'
import { useEye } from '../hooks/EyeTrackerProvider'
import { speak } from '../lib/speech'
import GazePhraseBoard from './GazePhraseBoard'
import Emoji from './Emoji'
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
type TalkLayer = 'answer' | 'more'

const MAIN_TILES: NeedTile[] = [
  { id: 'nurse', icon: '🔔', label: 'Call a nurse', phrase: 'I need a nurse' },
  { id: 'water', icon: '💧', label: 'Water', phrase: 'I need drinking water' },
  { id: 'bathroom', icon: '🚻', label: 'Bathroom', phrase: 'I need help using the bathroom' },
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

const TALK_YES: NeedTile = { id: 'yes', icon: '✅', label: 'Yes', phrase: 'Yes', instant: true }
const TALK_NO: NeedTile = { id: 'no', icon: '❌', label: 'No', phrase: 'No', instant: true }

const TALK_STEER: NeedTile[] = [
  { id: 'maybe', icon: '🤷', label: 'Maybe', phrase: 'Maybe', instant: true },
  { id: 'unsure', icon: '❔', label: "I don't know", phrase: "I don't know", instant: true },
  { id: 'repeat', icon: '🔁', label: 'Repeat that', phrase: 'Please repeat that', instant: true },
  { id: 'slow', icon: '🐢', label: 'Speak slowly', phrase: 'Please speak slowly', instant: true },
  { id: 'understand', icon: '❓', label: "I don't understand", phrase: "I don't understand", instant: true },
  { id: 'wrong', icon: '⚠️', label: "That's not it", phrase: "That's not what I meant", instant: true },
  { id: 'wait', icon: '⏳', label: 'Please wait', phrase: 'Please wait', instant: true },
  { id: 'stop', icon: '✋', label: 'Please stop', phrase: 'Please stop', instant: true },
]

const TALK_MORE: NeedTile[] = [
  { id: 'question', icon: '💬', label: 'I have a question', phrase: 'I have a question. Please ask me yes or no questions so I can answer.', instant: true },
  { id: 'nurse', icon: '🔔', label: 'I need a nurse', phrase: 'I need a nurse', instant: true },
  { id: 'pain', icon: '🤕', label: "I'm in pain", phrase: 'I am in pain', instant: true },
  { id: 'water', icon: '💧', label: 'I need water', phrase: 'I need drinking water', instant: true },
  { id: 'bathroom', icon: '🚻', label: 'Bathroom', phrase: 'I need help using the bathroom', instant: true },
  { id: 'reposition', icon: '🔄', label: 'Please turn me', phrase: 'I need to be repositioned', instant: true },
  { id: 'family', icon: '📞', label: 'Call my family', phrase: 'I want to contact a family member', instant: true },
  { id: 'scared', icon: '😟', label: "I'm scared", phrase: 'I am scared. Please stay with me.', instant: true },
  { id: 'thanks', icon: '💛', label: 'Thank you', phrase: 'Thank you', instant: true },
  { id: 'finished', icon: '✅', label: "I'm done talking", phrase: 'I am finished talking', instant: true },
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
  quick: { title: 'Nurse: ask a question', tiles: TALK_STEER },
  gaze: { title: 'Phrases', tiles: [] },
  more: { title: 'Other requests', tiles: MORE_TILES },
  urgent: { title: 'Something is wrong', tiles: URGENT_TILES },
}

const PAGER_IDS = new Set(['nurse', 'emergency', 'breathing', 'nauseous', 'bleeding', 'dizzy', 'unwell'])
const COOLDOWN_MS = 1300
const TRANSCRIPT_LIMIT = 8

function nurseTime() {
  return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export default function NeedsBoard({ onRecalibrate }: { onRecalibrate: () => void }) {
  const eye = useEye()
  const [screen, setScreen] = useState<Screen>('main')
  const [talkLayer, setTalkLayer] = useState<TalkLayer>('answer')
  const boardRef = useRef<HTMLDivElement | null>(null)
  const [answerFlash, setAnswerFlash] = useState<'yes' | 'no' | null>(null)
  const [spokenTile, setSpokenTile] = useState<string | null>(null)
  const [spokenMessage, setSpokenMessage] = useState('')
  const [transcript, setTranscript] = useState<string[]>([])
  const [pager, setPager] = useState('')
  const coolUntil = useRef(0)

  const flashTile = (id: string, ms: number) => {
    setSpokenTile(id)
    window.setTimeout(() => {
      setSpokenTile((current) => (current === id ? null : current))
    }, ms)
  }

  const rememberLine = (message: string) => {
    setSpokenMessage(message)
    setTranscript((lines) => [...lines, message].slice(-TRANSCRIPT_LIMIT))
  }

  const activateTile = (tile: NeedTile, afterSpeak?: () => void) => {
    if (performance.now() < coolUntil.current) return
    coolUntil.current = performance.now() + COOLDOWN_MS

    speak(tile.phrase)
    rememberLine(tile.phrase)
    flashTile(tile.id, 650)
    if (PAGER_IDS.has(tile.id)) setPager(`Nurse alerted at ${nurseTime()}`)
    afterSpeak?.()
  }

  const answer = (value: 'yes' | 'no') => {
    const message = value === 'yes' ? 'Yes' : 'No'
    speak(message)
    rememberLine(message)
    setAnswerFlash(value)
    window.setTimeout(() => setAnswerFlash((current) => (current === value ? null : current)), 500)
  }

  const openTalk = () => {
    setTalkLayer('answer')
    setScreen('quick')
  }

  const { title, tiles } = SCREENS[screen]
  const talking = screen === 'quick'
  const talkTiles = talkLayer === 'more' ? TALK_MORE : TALK_STEER

  return (
    <div ref={boardRef} className={`needs-board screen-${screen} has-eye-remote`}>
      {pager && <div className="pager-banner" role="status">{pager}</div>}
      <div className="board-nav">
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
            onClick={openTalk}
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

      <EyeRemote eye={eye} root={boardRef} screenKey={`${screen}:${talking ? talkLayer : 'grid'}`} />
      {screen !== 'gaze' && !talking && (
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
        <GazePhraseBoard />
      ) : talking ? (
        <section className="talk-stage" aria-label="Nurse conversation">
          <p className="talk-cue">
            Nurse: ask a question. Patient: look Yes or No, or pick something else. After each line we stay here so
            you can keep talking.
          </p>
          <h2 className="screen-title">
            {talkLayer === 'more' ? 'Say more, then go back to yes or no' : title}
          </h2>
          {talkLayer === 'answer' && (
            <div className="talk-answers">
              <button
                type="button"
                aria-label="Yes"
                className={`talk-answer talk-yes answer-btn answer-yes ${spokenTile === TALK_YES.id || answerFlash === 'yes' ? 'spoken' : ''}`}
                onClick={() => activateTile(TALK_YES)}
              >
                Yes
              </button>
              <button
                type="button"
                aria-label="No"
                className={`talk-answer talk-no answer-btn answer-no ${spokenTile === TALK_NO.id || answerFlash === 'no' ? 'spoken' : ''}`}
                onClick={() => activateTile(TALK_NO)}
              >
                No
              </button>
            </div>
          )}
          <div className={`tile-grid talk-grid ${talkLayer === 'more' ? 'talk-grid-more' : ''}`}>
            {talkLayer === 'more' && (
              <button type="button" className="need-tile talk-back" onClick={() => setTalkLayer('answer')}>
                <span className="need-copy">
                  <strong className="need-label">Back to yes or no</strong>
                  <small className="need-phrase">Return to the answer screen for the next question.</small>
                </span>
              </button>
            )}
            {talkTiles.map((tile) => (
              <button
                key={tile.id}
                type="button"
                aria-label={tile.label}
                className={`need-tile ${spokenTile === tile.id ? 'spoken' : ''}`}
                onClick={() =>
                  activateTile(tile, talkLayer === 'more' ? () => setTalkLayer('answer') : undefined)
                }
              >
                <Emoji char={tile.icon} className="need-icon" />
                <span className="need-copy">
                  <strong className="need-label">{tile.label}</strong>
                  <small className="need-phrase">{tile.phrase}</small>
                </span>
              </button>
            ))}
            {talkLayer === 'answer' && (
              <button type="button" className="need-tile talk-more" onClick={() => setTalkLayer('more')}>
                <Emoji char="💬" className="need-icon" />
                <span className="need-copy">
                  <strong className="need-label">More to say</strong>
                  <small className="need-phrase">Pain, water, family, or I have a question.</small>
                </span>
              </button>
            )}
          </div>
          <aside className="talk-transcript" aria-live="polite">
            <strong>Conversation</strong>
            {transcript.length === 0 ? (
              <p>Nothing spoken yet. Blink on Yes or No to start.</p>
            ) : (
              <ol>
                {transcript.map((line, index) => (
                  <li key={`${index}-${line}`}>{line}</li>
                ))}
              </ol>
            )}
          </aside>
        </section>
      ) : (
        <>
          <div className="speech-status" role="status" aria-live="polite">
            {spokenMessage ? `Said: "${spokenMessage}"` : 'Tap a card, or look at an arrow.'}
          </div>
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
                <Emoji char={tile.icon} className="need-icon" />
                <span className="need-copy">
                  <strong className="need-label">{tile.label}</strong>
                  <small className="need-phrase">{tile.phrase}</small>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
