import { useCallback, useEffect, useState } from 'react'
import { useEye } from '../hooks/EyeTrackerProvider'
import { DirectionHold, directionSignal, medianFeatures, MOVE_ENTER, type Direction, type RemoteProfile } from '../lib/eyeRemote'
import { DirectionCalibration, FaceChip } from './Calibration'
import './Panel.css'
import './CalibrationFlow.css'

type Phase = 'intro' | 'calibrating' | 'check'

function DirectionPad({ profile }: { profile: RemoteProfile }) {
  const eye = useEye()
  const [direction, setDirection] = useState<Direction | null>('center')

  useEffect(() => {
    let raf = 0
    let recent: number[][] = []
    let last: Direction | null = 'center'
    const hold = new DirectionHold(200, 90, 80)
    let lastGood = 0
    const publish = (next: Direction | null) => {
      if (next === last) return
      last = next
      setDirection(next)
    }
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const now = performance.now()
      const snap = eye.snapshotRef.current
      const f = snap.features
      const trackingOk = Boolean(snap.detectedFace && f?.length === 4 && f.every(Number.isFinite))
      if (!trackingOk || !f) {
        if (now - lastGood > 280) {
          recent = []
          hold.reset()
          publish(null)
        }
        return
      }
      lastGood = now
      recent.push(f.slice(0, 4))
      if (recent.length > 4) recent.shift()
      const raw = directionSignal(profile, medianFeatures(recent), hold.value, MOVE_ENTER).direction
      publish(hold.update(raw, now))
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
  const [phase, setPhase] = useState<Phase>('calibrating')
  const [failure, setFailure] = useState('')
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
      <main className="panel-page">
        <div className="panel">
          <span className="panel-eyebrow">Calibration saved</span>
          <h1 className="panel-title">Check it works</h1>
          <p className="panel-lede">
            Look up, down, left and right. The matching box should light up. Look back at the middle to settle it.
          </p>
          <DirectionPad profile={eye.remoteProfile} />
          <div className="panel-actions">
            <button type="button" className="panel-btn is-primary" onClick={onDone}>
              Looks right, continue
            </button>
            <button type="button" className="panel-btn" onClick={() => setPhase('calibrating')}>
              Calibrate again
            </button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="panel-page">
      <div className="panel">
        <span className="panel-eyebrow">GazeBridge</span>
        <h1 className="panel-title">First, calibrate your eyes</h1>
        <p className="panel-lede">
          You only do this once. Sit about an arm's length from the laptop with your face lit and keep your head still.
          A dot will appear in the middle, then on the left, right, top and bottom of the screen. Look at each one until
          the bar fills. It takes about 15 seconds.
        </p>
        {failure && <p className="panel-error">{failure}</p>}
        <div className="panel-status">
          <FaceChip eye={eye} />
        </div>
        {eye.status === 'error' && <p className="panel-error">{eye.error}</p>}
        <div className="panel-actions">
          <button type="button" className="panel-btn is-primary" disabled={!ready} onClick={() => setPhase('calibrating')}>
            {eye.calibrated ? 'Calibrate again' : 'Start'}
          </button>
          {eye.calibrated ? (
            <button type="button" className="panel-btn" onClick={onDone}>
              Keep my current calibration
            </button>
          ) : (
            <button type="button" className="panel-btn is-ghost" onClick={onDone}>
              Skip, I'll use touch
            </button>
          )}
        </div>
      </div>
    </main>
  )
}
