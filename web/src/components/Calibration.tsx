import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import type { EyeTracker } from '../hooks/useEyeTracker'
import {
  DIRECTION_TARGETS,
  medianFeatures,
  profileUsable,
  type Direction,
  type RemoteProfile,
} from '../lib/eyeRemote'
import './AimGame.css'
import './CalibrationFlow.css'

// Timing and noise gates are prnvh's original eye-remote setup values.
const SETTLE_MS = 850
const SAMPLES_PER_STEP = 24
const MAX_NOISE = 0.018
const CLOSED_LID = 0.55

export type Point = { x: number; y: number }

export function useCursor(eye: EyeTracker, mode: 'gaze' | 'mouse'): MutableRefObject<Point | null> {
  const cursorRef = useRef<Point | null>(null)

  useEffect(() => {
    cursorRef.current = null
    if (mode === 'mouse') {
      const move = (e: PointerEvent) => {
        cursorRef.current = { x: e.clientX, y: e.clientY }
      }
      window.addEventListener('pointermove', move)
      return () => window.removeEventListener('pointermove', move)
    }
    let raf = 0
    const tick = () => {
      cursorRef.current = eye.snapshotRef.current.screen
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [eye.snapshotRef, mode])

  return cursorRef
}

export function Crosshair({ cursorRef, dimmed }: { cursorRef: MutableRefObject<Point | null>; dimmed: boolean }) {
  const el = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let raf = 0
    const tick = () => {
      const node = el.current
      const c = cursorRef.current
      if (node) {
        node.style.opacity = c ? '' : '0'
        if (c) node.style.transform = `translate(${c.x}px, ${c.y}px)`
      }
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [cursorRef])

  return <div ref={el} className={`crosshair ${dimmed ? 'is-dimmed' : ''}`} aria-hidden="true" />
}

export function FaceChip({ eye }: { eye: EyeTracker }) {
  if (eye.status === 'loading') return <span className="aim-chip">Loading eye tracker…</span>
  if (eye.status === 'error') return <span className="aim-chip is-bad">Tracker error</span>
  return (
    <span className={`aim-chip ${eye.faceFound ? 'is-good' : 'is-bad'}`}>
      <span className="aim-chip-dot" />
      {eye.faceFound ? 'Face found' : 'Face not found'}
    </span>
  )
}

const LEFT_EYE_CONTOUR = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246]
const RIGHT_EYE_CONTOUR = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398]
const LEFT_IRIS = [468, 469, 470, 471, 472]
const RIGHT_IRIS = [473, 474, 475, 476, 477]

function EyeLandmarkOverlay({ eye }: { eye: EyeTracker }) {
  const [landmarkFrame, setLandmarkFrame] = useState<readonly { x: number; y: number }[]>([])

  useEffect(() => {
    let raf = 0
    let lastUpdate = 0
    const update = (now: number) => {
      const landmarks = eye.landmarksRef.current
      if (now - lastUpdate >= 80) {
        lastUpdate = now
        setLandmarkFrame(landmarks?.map((point) => ({ x: 1 - point.x, y: point.y })) ?? [])
      }
      raf = requestAnimationFrame(update)
    }
    raf = requestAnimationFrame(update)
    return () => cancelAnimationFrame(raf)
  }, [eye.landmarksRef])

  const points = (indices: readonly number[]) =>
    indices
      .map((index) => landmarkFrame[index])
      .filter((point): point is { x: number; y: number } => Boolean(point))
      .map((point) => `${point.x},${point.y}`)
      .join(' ')

  const bounds = (indices: readonly number[]) => {
    const eyePoints = indices.map((index) => landmarkFrame[index]).filter(Boolean)
    if (eyePoints.length === 0) return null
    const xs = eyePoints.map((point) => point.x)
    const ys = eyePoints.map((point) => point.y)
    const paddingX = 0.018
    const paddingY = 0.028
    const x = Math.max(0, Math.min(...xs) - paddingX)
    const y = Math.max(0, Math.min(...ys) - paddingY)
    return {
      x,
      y,
      width: Math.min(1 - x, Math.max(...xs) - Math.min(...xs) + paddingX * 2),
      height: Math.min(1 - y, Math.max(...ys) - Math.min(...ys) + paddingY * 2),
    }
  }

  const leftBounds = bounds(LEFT_EYE_CONTOUR)
  const rightBounds = bounds(RIGHT_EYE_CONTOUR)

  return (
    <svg className="eye-landmark-overlay" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
      {leftBounds && <rect className="eye-lock-box" rx="0.015" {...leftBounds} />}
      {rightBounds && <rect className="eye-lock-box" rx="0.015" {...rightBounds} />}
      <polyline className="eye-contour" points={points(LEFT_EYE_CONTOUR)} />
      <polyline className="eye-contour" points={points(RIGHT_EYE_CONTOUR)} />
      <polyline className="iris-contour" points={points(LEFT_IRIS)} />
      <polyline className="iris-contour" points={points(RIGHT_IRIS)} />
      {[468, 473].map((index) => {
        const point = landmarkFrame[index]
        return point ? <circle key={index} className="iris-center" cx={point.x} cy={point.y} r="0.012" /> : null
      })}
    </svg>
  )
}

// Middle, left, right, up, down, then the middle again: the last look replaces
// the first centre template once the eyes have relaxed from the edges.
const STEPS: Direction[] = ['center', 'left', 'right', 'up', 'down', 'center']
const ARROWS: Record<Direction, string> = { center: '●', left: '←', right: '→', up: '↑', down: '↓' }
const SPOKEN: Record<Direction, string> = {
  center: 'at the middle dot',
  left: 'at the left dot',
  right: 'at the right dot',
  up: 'at the top dot',
  down: 'at the bottom dot',
}

export function DirectionCalibration({
  eye,
  onComplete,
  onFail,
  onCancel,
}: {
  eye: EyeTracker
  onComplete: (profile: RemoteProfile) => void
  onFail: (message: string) => void
  onCancel: () => void
}) {
  const [step, setStep] = useState(0)
  const [progress, setProgress] = useState(0)
  const [hint, setHint] = useState('')
  const templates = useRef<Partial<RemoteProfile>>({})
  const callbacks = useRef({ onComplete, onFail })
  const direction = STEPS[step] ?? 'center'

  useEffect(() => {
    callbacks.current = { onComplete, onFail }
  }, [onComplete, onFail])

  useEffect(() => {
    if (step >= STEPS.length) {
      const profile = templates.current as RemoteProfile
      if (profileUsable(profile)) callbacks.current.onComplete({ ...profile })
      else callbacks.current.onFail("Couldn't tell your directions apart. Try again and move your eyes all the way to each dot.")
      return
    }

    let raf = 0
    let lastFrame = -1
    let settleFrom = performance.now()
    let samples: number[][] = []

    const tick = () => {
      raf = requestAnimationFrame(tick)
      const now = performance.now()
      const snap = eye.snapshotRef.current
      const fresh = now - snap.at < 350
      const usable = fresh && snap.detectedFace && snap.features?.length === 4 && snap.features.every(Number.isFinite)
      if (!usable) {
        samples = []
        settleFrom = now
        setProgress(0)
        setHint(fresh ? 'Face the camera' : 'Waiting for the camera')
        return
      }
      if (snap.at <= lastFrame) return
      lastFrame = snap.at
      if (Math.max(snap.blinkL ?? 0, snap.blinkR ?? 0) > CLOSED_LID) {
        samples = []
        settleFrom = now
        setProgress(0)
        setHint('Keep your eyes open')
        return
      }
      if (now - settleFrom < SETTLE_MS) {
        setHint('')
        return
      }

      samples.push(snap.features!.slice(0, 4))
      setProgress(samples.length / SAMPLES_PER_STEP)
      if (samples.length < SAMPLES_PER_STEP) return

      const median = medianFeatures(samples)
      const noise = Math.max(
        ...median.map((v, i) => Math.sqrt(samples.reduce((sum, f) => sum + (f[i] - v) ** 2, 0) / samples.length)),
      )
      if (noise > MAX_NOISE) {
        samples = []
        settleFrom = now
        setProgress(0)
        setHint('Hold still, trying that one again')
        return
      }
      templates.current[STEPS[step]] = median
      cancelAnimationFrame(raf)
      setProgress(0)
      setHint('')
      setStep((s) => s + 1)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [eye.snapshotRef, step])

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onCancel])

  const [x, y] = DIRECTION_TARGETS[direction]
  const isLast = step === STEPS.length - 1

  return (
    <div className={`direction-calibration at-${direction}`} role="dialog" aria-modal="true" aria-label="Calibrate your eyes">
      <div className="direction-copy">
        <span className="aim-eyebrow">
          Step {Math.min(step + 1, STEPS.length)} of {STEPS.length}
        </span>
        <strong>{isLast ? 'Back to the middle' : `Look ${SPOKEN[direction]}`}</strong>
        <p>{hint || 'Move only your eyes and keep your head still until the bar fills.'}</p>
        <progress value={progress} max={1} />
        <div className="direction-copy-row">
          <FaceChip eye={eye} />
          <button type="button" className="aim-btn is-ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
      <div className="direction-dot" style={{ left: `${x * 100}%`, top: `${y * 100}%` }}>
        {ARROWS[direction]}
      </div>
      <EyeLandmarkOverlay eye={eye} />
    </div>
  )
}
