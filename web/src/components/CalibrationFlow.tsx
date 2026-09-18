import { useCallback, useEffect, useState } from 'react'
import { useEye } from '../hooks/EyeTrackerProvider'
import { directionSignal, profileFromCalibration, REMOTE_CENTER_TARGET, type Direction } from '../lib/eyeRemote'
import { CALIBRATION_TARGETS, fitCalibration, type CalibrationSample, type Vec2 } from '../lib/eyeTracking'
import { Calibration, Crosshair, FaceChip, qualityOf, useCursor } from './Calibration'
import './AimGame.css'
import './CalibrationFlow.css'

// The gaze model is fitted on the 12-dot grid only; the extra centre dot shown
// first gives the eye remote a true resting-gaze reference.
const TARGETS: Vec2[] = [REMOTE_CENTER_TARGET, ...CALIBRATION_TARGETS]
const isCenter = (s: CalibrationSample) =>
  s.target[0] === REMOTE_CENTER_TARGET[0] && s.target[1] === REMOTE_CENTER_TARGET[1]

type Phase = 'intro' | 'calibrating' | 'check'

function DirectionPad() {
  const eye = useEye()
  const profile = eye.remoteProfile
  const [direction, setDirection] = useState<Direction | null>(null)

  useEffect(() => {
    if (!profile) return
    let raf = 0
    const tick = () => {
      const snap = eye.snapshotRef.current
      const f = snap.features
      setDirection(snap.detectedFace && f?.length === 4 ? directionSignal(profile, f).direction : null)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [eye.snapshotRef, profile])

  if (!profile) {
    return (
      <p className="calib-flow-note">
        The eye remote couldn't tell your directions apart, so it's off for now. Tapping still works. Calibrate again
        and move your eyes all the way to each dot to turn it on.
      </p>
    )
  }

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
  const [failed, setFailed] = useState(false)
  const [error, setError] = useState(0)
  const cursorRef = useCursor(eye, 'gaze')
  const ready = eye.status === 'ready' && eye.faceFound

  useEffect(() => {
    setPreview(phase === 'check' ? 'small' : 'medium')
    return () => setPreview('small')
  }, [phase, setPreview])

  const finish = useCallback(
    (samples: CalibrationSample[]) => {
      const model = fitCalibration(samples.filter((s) => !isCenter(s)))
      if (!model) {
        setFailed(true)
        setPhase('intro')
        return
      }
      saveCalibration(model, profileFromCalibration(samples))
      setError(model.error)
      setFailed(false)
      setPhase('check')
    },
    [saveCalibration],
  )

  const cancel = useCallback(() => setPhase('intro'), [])

  if (phase === 'calibrating') {
    return <Calibration eye={eye} targets={TARGETS} onComplete={finish} onCancel={cancel} />
  }

  if (phase === 'check') {
    const quality = qualityOf(error)
    return (
      <main className="aim-setup">
        <Crosshair cursorRef={cursorRef} dimmed={!eye.faceFound} />
        <div className="aim-setup-card">
          <span className="aim-eyebrow">Calibration saved</span>
          <h1 className="aim-title">
            Tracking is <span className={`aim-quality is-${quality.tone}`}>{quality.label.toLowerCase()}</span>
          </h1>
          <p className="aim-lede">
            Look around. The crosshair should follow your eyes, and the pad below lights up as you look up, down,
            left and right.
          </p>
          <DirectionPad />
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
          You only do this once. Sit about an arm's length from the laptop with your face lit, keep your head still,
          and look at each dot until it fills in. It takes about 20 seconds.
        </p>
        {failed && (
          <p className="aim-error">That didn't work. Try again with more light on your face and your head still.</p>
        )}
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
