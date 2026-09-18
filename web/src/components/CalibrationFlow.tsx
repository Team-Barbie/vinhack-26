import { useCallback, useEffect, useState } from 'react'
import { useEye } from '../hooks/EyeTrackerProvider'
import { directionSignal, medianFeatures, type Direction, type RemoteProfile } from '../lib/eyeRemote'
import { Crosshair, DirectionCalibration, FaceChip, useCursor } from './Calibration'
import './AimGame.css'
import './CalibrationFlow.css'

type Phase = 'intro' | 'calibrating' | 'check'

function DirectionPad({ profile }: { profile: RemoteProfile }) {
  const eye = useEye()
  const [direction, setDirection] = useState<Direction | null>(null)

  useEffect(() => {
    let raf = 0
    let recent: number[][] = []
    const tick = () => {
      const snap = eye.snapshotRef.current
      const f = snap.features
      if (snap.detectedFace && f?.length === 4 && f.every(Number.isFinite)) {
        recent = [...recent.slice(-2), f.slice(0, 4)]
        setDirection(directionSignal(profile, medianFeatures(recent)).direction)
      } else {
        recent = []
        setDirection(null)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [eye.snapshotRef, profile])

  const key = (d: Direction, label: string) => (
    <span className={`calib-pad-key is-${d} ${direction === d ? 'is-active' : ''}`}>{label}</span>
  )

  return (
    <div className="calib-pad" aria-live="polite">
      {key('up', 'Up')}
      {key('left', 'Left')}
      {key('center', 'Middle')}
      {key('right', 'Right')}
      {key('down', 'Down')}
    </div>
  )
}

export default function CalibrationFlow({ onDone }: { onDone: () => void }) {
  const eye = useEye()
  const { setPreview, saveCalibration } = eye
  const [phase, setPhase] = useState<Phase>('intro')
  const [failure, setFailure] = useState('')
  const cursorRef = useCursor(eye, 'gaze')
  const ready = eye.status === 'ready' && eye.faceFound

  useEffect(() => {
    setPreview(phase === 'check' ? 'small' : 'medium')
    return () => setPreview('small')
  }, [phase, setPreview])

  const complete = useCallback(
    (profile: RemoteProfile) => {
      saveCalibration(profile)
      setFailure('')
      setPhase('check')
    },
    [saveCalibration],
  )

  const fail = useCallback((message: string) => {
    setFailure(message)
    setPhase('intro')
  }, [])

  const cancel = useCallback(() => setPhase('intro'), [])

  if (phase === 'calibrating') {
    return <DirectionCalibration eye={eye} onComplete={complete} onFail={fail} onCancel={cancel} />
  }

  if (phase === 'check' && eye.remoteProfile) {
    return (
      <main className="aim-setup">
        <Crosshair cursorRef={cursorRef} dimmed={!eye.faceFound} />
        <div className="aim-setup-card">
          <span className="aim-eyebrow">Calibration saved</span>
          <h1 className="aim-title">Check it works</h1>
          <p className="aim-lede">
            Look up, down, left and right. The matching box should light up, and look back at the middle to settle it.
            The crosshair follows your eyes too.
          </p>
          <DirectionPad profile={eye.remoteProfile} />
          <div className="aim-actions">
            <button type="button" className="aim-btn is-primary" onClick={onDone}>
              Looks right, continue
            </button>
            <button type="button" className="aim-btn" onClick={() => setPhase('calibrating')}>
              Calibrate again
            </button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="aim-setup">
      <div className="aim-setup-card">
        <span className="aim-eyebrow">GazeBridge</span>
        <h1 className="aim-title">First, calibrate your eyes</h1>
        <p className="aim-lede">
          You only do this once. Sit about an arm's length from the laptop with your face lit and keep your head still.
          A dot will appear in the middle, then on the left, right, top and bottom of the screen. Look at each one until
          the bar fills. It takes about 15 seconds.
        </p>
        {failure && <p className="aim-error">{failure}</p>}
        <div className="aim-status-row">
          <FaceChip eye={eye} />
        </div>
        {eye.status === 'error' && <p className="aim-error">{eye.error}</p>}
        <div className="aim-actions">
          <button type="button" className="aim-btn is-primary" disabled={!ready} onClick={() => setPhase('calibrating')}>
            {eye.calibrated ? 'Calibrate again' : 'Start'}
          </button>
          {eye.calibrated ? (
            <button type="button" className="aim-btn" onClick={onDone}>
              Keep my current calibration
            </button>
          ) : (
            <button type="button" className="aim-btn is-ghost" onClick={onDone}>
              Skip, I'll use touch
            </button>
          )}
        </div>
      </div>
    </main>
  )
}
