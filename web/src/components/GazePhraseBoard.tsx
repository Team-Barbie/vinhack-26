import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { EyeTracker } from '../hooks/useEyeTracker'
import './GazePhraseBoard.css'

type GazeZone = 'left' | 'right' | 'back'
type RemoteDirection = GazeZone | 'neutral'

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

function remoteDirectionFor(screen: { x: number; y: number } | null): RemoteDirection | null {
  if (!screen) return null
  if (screen.y < window.innerHeight * 0.18) return 'back'
  if (screen.x < window.innerWidth * 0.43) return 'left'
  if (screen.x > window.innerWidth * 0.57) return 'right'
  return 'neutral'
}

export default function GazePhraseBoard({ eye }: { eye: EyeTracker }) {
  const { status, faceFound, calibrated, snapshotRef, onBlink } = eye
  const [choices, setChoices] = useState<readonly string[]>(PHRASES)
  const [history, setHistory] = useState<readonly string[][]>([])
  const [activeZone, setActiveZone] = useState<GazeZone | null>(null)
  const [progress, setProgress] = useState(0)
  const [lastSpoken, setLastSpoken] = useState('')
  const [awaitingNeutral, setAwaitingNeutral] = useState(false)
  const dwellRef = useRef<{ zone: GazeZone | null; startedAt: number }>({ zone: null, startedAt: 0 })
  const lockedRef = useRef(false)
  const needsNeutralRef = useRef(false)
  const blinkPausedAtRef = useRef<number | null>(null)
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

  const commitGazeZone = useCallback(
    (zone: GazeZone) => {
      if (lockedRef.current) return
      lockedRef.current = true
      needsNeutralRef.current = true
      setAwaitingNeutral(true)
      if (zone === 'back') goBack()
      else chooseSide(zone)
      dwellRef.current = { zone: null, startedAt: performance.now() }
      setActiveZone(null)
      setProgress(0)
    },
    [chooseSide, goBack],
  )

  useEffect(() => {
    if (!calibrated) return

    const timer = window.setInterval(() => {
      const frame = snapshotRef.current
      let zone: GazeZone | null = null

      // Keep the highlighted zone while the eyes are closed. BlinkDetector
      // fires on reopen, so clearing it here would leave nothing to confirm.
      if (frame.eyesClosed) {
        blinkPausedAtRef.current ??= performance.now()
        return
      }

      if (blinkPausedAtRef.current !== null) {
        const pausedFor = performance.now() - blinkPausedAtRef.current
        dwellRef.current.startedAt += pausedFor
        blinkPausedAtRef.current = null
      }

      if (frame.faceFound && frame.screen) {
        const direction = remoteDirectionFor(frame.screen)
        if (direction !== 'neutral') zone = direction
      }

      const now = performance.now()
      if (needsNeutralRef.current) {
        if (zone === null) {
          needsNeutralRef.current = false
          lockedRef.current = false
          setAwaitingNeutral(false)
        }
        setActiveZone(null)
        setProgress(0)
        return
      }

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

      if (nextProgress >= 1) commitGazeZone(zone)
    }, 50)

    return () => window.clearInterval(timer)
  }, [calibrated, commitGazeZone, snapshotRef])

  useEffect(() => {
    if (!calibrated) return
    return onBlink(() => {
      const zone = dwellRef.current.zone
      if (zone) commitGazeZone(zone)
    })
  }, [calibrated, commitGazeZone, onBlink])

  const trackerLabel =
    status === 'error'
      ? 'Camera unavailable. Tap a side instead.'
      : !calibrated
        ? 'Not calibrated. Tap a side instead.'
        : awaitingNeutral
          ? 'Look back at the middle'
        : activeZone === 'left'
          ? 'Left side. Blink to pick it.'
          : activeZone === 'right'
            ? 'Right side. Blink to pick it.'
            : activeZone === 'back'
              ? 'Going back. Blink to confirm.'
        : faceFound
          ? 'Look at a side, then blink or hold still'
          : 'Looking for your face'

  return (
    <section className="gaze-phrase-board" aria-label="Gaze phrase selector">
      <div className="gaze-phrase-toolbar">
        <button type="button" className={`gaze-back ${activeZone === 'back' ? 'dwelling' : ''}`} onClick={goBack} disabled={history.length === 0}>
          ↑ Look up or tap to go back
        </button>
        <div className={`gaze-tracker-status ${calibrated && faceFound ? 'ready' : ''}`}>{trackerLabel}</div>
        <div className="gaze-toolbar-actions">
          <button type="button" className="gaze-reset" onClick={reset}>Reset phrases</button>
        </div>
      </div>

      {lastSpoken && <div className="gaze-spoken" role="status">Said: "{lastSpoken}"</div>}

      <div className="gaze-choice-layout">
        <button
          type="button"
          className={`gaze-choice gaze-choice-left ${activeZone === 'left' ? 'dwelling' : ''}`}
          style={{ '--dwell-progress': activeZone === 'left' ? `${progress * 100}%` : '0%' } as CSSProperties}
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
          style={{ '--dwell-progress': activeZone === 'right' ? `${progress * 100}%` : '0%' } as CSSProperties}
          onClick={() => chooseSide('right')}
        >
          <span className="gaze-direction">Look right →</span>
          <span className="gaze-choice-list">
            {rightChoices.map((phrase) => <span key={phrase}>{phrase}</span>)}
          </span>
        </button>
      </div>

      <p className="gaze-phrase-hint">
        Look at a side, then blink or hold your gaze to select it. Return to the center between choices.
      </p>
    </section>
  )
}
