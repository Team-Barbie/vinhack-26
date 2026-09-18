import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useEyeTracker } from '../hooks/useEyeTracker'
import type { CalibrationModel } from '../lib/eyeTracking'
import { Calibration, FaceChip } from './AimGame'
import './GazePhraseBoard.css'

type GazeZone = 'left' | 'right' | 'back'
type GazePhase = 'setup' | 'calibrating' | 'review' | 'selecting'
type InputMode = 'gaze' | 'buttons'

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
  const eye = useEyeTracker()
  const { videoRef, status, error, faceFound, calibrated, snapshotRef, setCalibration, onBlink } = eye
  const [phase, setPhase] = useState<GazePhase>('setup')
  const [inputMode, setInputMode] = useState<InputMode>('gaze')
  const [choices, setChoices] = useState<readonly string[]>(PHRASES)
  const [history, setHistory] = useState<readonly string[][]>([])
  const [activeZone, setActiveZone] = useState<GazeZone | null>(null)
  const [progress, setProgress] = useState(0)
  const [lastSpoken, setLastSpoken] = useState('')
  const [calibrationError, setCalibrationError] = useState(0)
  const [awaitingNeutral, setAwaitingNeutral] = useState(false)
  const [gazePoint, setGazePoint] = useState<{ x: number; y: number } | null>(null)
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

  const finishCalibration = useCallback(
    (model: CalibrationModel | null) => {
      if (!model) {
        setPhase('setup')
        return
      }
      setCalibration(model)
      setCalibrationError(model.error)
      setInputMode('gaze')
      setPhase('review')
    },
    [setCalibration],
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
    if (phase !== 'review') return
    let raf = 0
    const updatePreview = () => {
      const frame = snapshotRef.current
      setGazePoint(frame.faceFound ? frame.screen : null)
      raf = requestAnimationFrame(updatePreview)
    }
    raf = requestAnimationFrame(updatePreview)
    return () => cancelAnimationFrame(raf)
  }, [phase, snapshotRef])

  useEffect(() => {
    if (phase !== 'selecting' || inputMode !== 'gaze' || !calibrated) return

    const timer = window.setInterval(() => {
      const frame = snapshotRef.current
      let zone: GazeZone | null = null

      if (frame.faceFound && frame.screen) {
        setGazePoint(frame.screen)
      } else {
        setGazePoint(null)
      }

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
        if (frame.screen.y < window.innerHeight * 0.16) zone = 'back'
        else if (frame.screen.x < window.innerWidth * 0.43) zone = 'left'
        else if (frame.screen.x > window.innerWidth * 0.57) zone = 'right'
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
  }, [calibrated, commitGazeZone, inputMode, phase, snapshotRef])

  useEffect(() => {
    if (phase !== 'selecting' || inputMode !== 'gaze' || !calibrated) return
    return onBlink(() => {
      const zone = dwellRef.current.zone
      if (zone) commitGazeZone(zone)
    })
  }, [calibrated, commitGazeZone, inputMode, onBlink, phase])

  if (phase === 'calibrating') {
    return (
      <section className="gaze-phrase-board" aria-label="Gaze calibration">
        <video ref={videoRef} className="gaze-camera is-calibrating" muted playsInline aria-hidden="true" />
        <Calibration eye={eye} onComplete={finishCalibration} onCancel={() => setPhase('setup')} />
      </section>
    )
  }

  if (phase === 'setup') {
    const ready = status === 'ready' && faceFound
    return (
      <section className="gaze-phrase-board gaze-phrase-setup" aria-label="Set up gaze phrases">
        <div className="gaze-setup-card">
          <div className="gaze-setup-copy">
            <span className="gaze-setup-eyebrow">Gaze Phrases</span>
            <h2>Calibrate before you communicate.</h2>
            <p>
              Sit 50–80 cm from the screen, keep your head still, and follow each dot with your eyes.
              Calibration takes about 15 seconds.
            </p>
            <FaceChip eye={eye} />
            {status === 'error' && <p className="gaze-setup-error">{error}</p>}
            <div className="gaze-setup-actions">
              <button type="button" className="gaze-setup-primary" disabled={!ready} onClick={() => setPhase('calibrating')}>
                {calibrated ? 'Recalibrate now' : 'Start calibration'}
              </button>
              {calibrated && (
                <button type="button" className="gaze-setup-secondary" disabled={!ready} onClick={() => setPhase('selecting')}>
                  Use saved calibration
                </button>
              )}
              <button
                type="button"
                className="gaze-setup-secondary"
                onClick={() => {
                  setInputMode('buttons')
                  setPhase('selecting')
                }}
              >
                Test with buttons
              </button>
            </div>
          </div>
          <video ref={videoRef} className="gaze-setup-camera" muted playsInline />
        </div>
      </section>
    )
  }

  if (phase === 'review') {
    const quality = calibrationError < 0.05 ? 'Good' : calibrationError < 0.1 ? 'Fair' : 'Needs another try'
    return (
      <section className="gaze-phrase-board gaze-calibration-review" aria-label="Check gaze calibration">
        <video ref={videoRef} className="gaze-camera" muted playsInline aria-hidden="true" />
        {gazePoint && (
          <span className="gaze-debug-point is-review" style={{ left: gazePoint.x, top: gazePoint.y }} aria-hidden="true" />
        )}
        <div className="gaze-review-card">
          <span className="gaze-setup-eyebrow">Calibration check</span>
          <h2>Follow the green dot with your eyes.</h2>
          <p>
            Look left, right, up, and down. The dot should follow you closely before you use blink selection.
          </p>
          <div className="gaze-review-quality">
            <span>Tracking quality</span>
            <strong>{quality}</strong>
          </div>
          <div className="gaze-setup-actions">
            <button type="button" className="gaze-setup-primary" onClick={() => setPhase('selecting')}>
              Use this calibration
            </button>
            <button type="button" className="gaze-setup-secondary" onClick={() => setPhase('calibrating')}>
              Recalibrate
            </button>
          </div>
        </div>
        <span className="gaze-review-target gaze-review-left">Look left</span>
        <span className="gaze-review-target gaze-review-right">Look right</span>
        <span className="gaze-review-target gaze-review-up">Look up</span>
        <span className="gaze-review-target gaze-review-down">Look down</span>
      </section>
    )
  }

  const trackerLabel =
    inputMode === 'buttons'
      ? 'Button testing mode'
      : status === 'error'
      ? 'Camera unavailable · buttons still work'
      : !calibrated
        ? 'Calibrate in Aim Trainer to enable gaze'
        : awaitingNeutral
          ? 'Return your gaze to the center'
        : activeZone === 'left'
          ? 'Left highlighted · blink to select'
          : activeZone === 'right'
            ? 'Right highlighted · blink to select'
            : activeZone === 'back'
              ? 'Back highlighted · blink to select'
        : faceFound
          ? 'Look to highlight · blink or dwell to select'
          : 'Looking for your face'

  return (
    <section className="gaze-phrase-board" aria-label="Gaze phrase selector">
      <video ref={videoRef} className="gaze-camera" muted playsInline aria-hidden="true" />
      {inputMode === 'gaze' && gazePoint && (
        <span
          className="gaze-debug-point"
          style={{ left: gazePoint.x, top: gazePoint.y }}
          aria-hidden="true"
        />
      )}

      <div className="gaze-phrase-toolbar">
        <button type="button" className={`gaze-back ${activeZone === 'back' ? 'dwelling' : ''}`} onClick={goBack} disabled={history.length === 0}>
          ↑ Look up or tap to go back
        </button>
        <div className={`gaze-tracker-status ${calibrated && faceFound ? 'ready' : ''}`}>{trackerLabel}</div>
        <div className="gaze-toolbar-actions">
          <button type="button" className="gaze-reset" onClick={() => setPhase('setup')}>Recalibrate</button>
          <button type="button" className="gaze-reset" onClick={reset}>Reset phrases</button>
        </div>
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
        Look at a side, then blink or hold your gaze to select it. Return to the center between choices.
      </p>
    </section>
  )
}
