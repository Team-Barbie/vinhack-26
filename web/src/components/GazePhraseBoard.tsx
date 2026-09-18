import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useEyeTracker } from '../hooks/useEyeTracker'
import './GazePhraseBoard.css'

type GazeZone = 'left' | 'right' | 'back'

const DWELL_MS = 1100

const PHRASES = [
  'Yes',
  'No',
  'Maybe',
  "I don't know",
  'I need a nurse',
  'I need water',
  'I need help using the bathroom',
  'I need my medicine',
  'Please help me move',
  'Please change my position',
  'I need food',
  'I need a blanket or pillow',
  'I need my phone or charger',
  'Please call my family',
  'I am in pain',
  'I am having trouble breathing',
  'I feel nauseous',
  'I feel dizzy',
  'I feel too hot',
  'I feel too cold',
  'I feel numbness',
  'I am uncomfortable',
  'I feel scared',
  'I am tired',
  'Please stop',
  'Please repeat that',
  'Please speak slowly',
  'Please wait',
  'Please ask me yes or no questions',
  'Please turn the lights on',
  'Please turn the lights off',
  'Please open the curtains',
  'Please close the curtains',
  'Please sit me up',
  'Please help me lie down',
  'Please turn me to the left',
  'Please turn me to the right',
  'I am ready to rest',
] as const

function speak(text: string) {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.rate = 0.9
  window.speechSynthesis.speak(utterance)
}

function splitPhrases(phrases: readonly string[]) {
  const middle = Math.ceil(phrases.length / 2)
  return [phrases.slice(0, middle), phrases.slice(middle)] as const
}

export default function GazePhraseBoard() {
  const { videoRef, status, faceFound, calibrated, snapshotRef } = useEyeTracker()
  const [choices, setChoices] = useState<readonly string[]>(PHRASES)
  const [history, setHistory] = useState<readonly string[][]>([])
  const [activeZone, setActiveZone] = useState<GazeZone | null>(null)
  const [progress, setProgress] = useState(0)
  const [lastSpoken, setLastSpoken] = useState('')
  const dwellRef = useRef<{ zone: GazeZone | null; startedAt: number }>({ zone: null, startedAt: 0 })
  const lockedRef = useRef(false)
  const [leftChoices, rightChoices] = useMemo(() => splitPhrases(choices), [choices])

  const reset = useCallback(() => {
    setChoices(PHRASES)
    setHistory([])
    setProgress(0)
    setActiveZone(null)
  }, [])

  const goBack = useCallback(() => {
    setHistory((previous) => {
      const parent = previous.at(-1)
      if (parent) setChoices(parent)
      return parent ? previous.slice(0, -1) : previous
    })
  }, [])

  const chooseSide = useCallback(
    (side: 'left' | 'right') => {
      const selected = side === 'left' ? leftChoices : rightChoices
      if (selected.length === 0) return

      if (selected.length === 1) {
        const phrase = selected[0]
        speak(phrase)
        setLastSpoken(phrase)
        reset()
        return
      }

      setHistory((previous) => [...previous, [...choices]])
      setChoices(selected)
    },
    [choices, leftChoices, reset, rightChoices],
  )

  useEffect(() => {
    if (!calibrated) return

    const timer = window.setInterval(() => {
      const frame = snapshotRef.current
      let zone: GazeZone | null = null

      if (frame.faceFound && frame.screen && !frame.eyesClosed) {
        if (frame.screen.y < window.innerHeight * 0.16) zone = 'back'
        else if (frame.screen.x < window.innerWidth * 0.43) zone = 'left'
        else if (frame.screen.x > window.innerWidth * 0.57) zone = 'right'
      }

      const now = performance.now()
      if (zone !== dwellRef.current.zone) {
        dwellRef.current = { zone, startedAt: now }
        setActiveZone(zone)
        setProgress(0)
        lockedRef.current = false
        return
      }

      if (!zone || lockedRef.current) return
      const nextProgress = Math.min(1, (now - dwellRef.current.startedAt) / DWELL_MS)
      setProgress(nextProgress)

      if (nextProgress < 1) return
      lockedRef.current = true
      if (zone === 'back') goBack()
      else chooseSide(zone)
      dwellRef.current = { zone: null, startedAt: now }
      setActiveZone(null)
      setProgress(0)
    }, 50)

    return () => window.clearInterval(timer)
  }, [calibrated, chooseSide, goBack, snapshotRef])

  const trackerLabel =
    status === 'error'
      ? 'Camera unavailable · buttons still work'
      : !calibrated
        ? 'Calibrate in Aim Trainer to enable gaze'
        : faceFound
          ? 'Gaze ready'
          : 'Looking for your face'

  return (
    <section className="gaze-phrase-board" aria-label="Gaze phrase selector">
      <video ref={videoRef} className="gaze-camera" muted playsInline aria-hidden="true" />

      <div className="gaze-phrase-toolbar">
        <button type="button" className={`gaze-back ${activeZone === 'back' ? 'dwelling' : ''}`} onClick={goBack} disabled={history.length === 0}>
          ↑ Look up or tap to go back
        </button>
        <div className={`gaze-tracker-status ${calibrated && faceFound ? 'ready' : ''}`}>{trackerLabel}</div>
        <button type="button" className="gaze-reset" onClick={reset}>Reset phrases</button>
      </div>

      {lastSpoken && <div className="gaze-spoken" role="status">Spoke: “{lastSpoken}”</div>}

      <div className="gaze-choice-layout">
        <button
          type="button"
          className={`gaze-choice gaze-choice-left ${activeZone === 'left' ? 'dwelling' : ''}`}
          style={{ '--dwell-progress': activeZone === 'left' ? `${progress * 100}%` : '0%' } as React.CSSProperties}
          onClick={() => chooseSide('left')}
        >
          <span className="gaze-direction">← Look left</span>
          <span className="gaze-choice-list">
            {leftChoices.map((phrase) => <span key={phrase}>{phrase}</span>)}
          </span>
        </button>

        <button
          type="button"
          className={`gaze-choice gaze-choice-right ${activeZone === 'right' ? 'dwelling' : ''}`}
          style={{ '--dwell-progress': activeZone === 'right' ? `${progress * 100}%` : '0%' } as React.CSSProperties}
          onClick={() => chooseSide('right')}
        >
          <span className="gaze-direction">Look right →</span>
          <span className="gaze-choice-list">
            {rightChoices.map((phrase) => <span key={phrase}>{phrase}</span>)}
          </span>
        </button>
      </div>

      <p className="gaze-phrase-hint">
        Choose a side to narrow the list. When one phrase remains, it is spoken aloud.
      </p>
    </section>
  )
}
