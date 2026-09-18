import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import type { EyeTracker } from '../hooks/useEyeTracker'
import type { CalibrationSample, Vec2 } from '../lib/eyeTracking'
import './AimGame.css'

const SETTLE_MS = 1000
const COLLECT_TARGET = 24
const COLLECT_TIMEOUT_MS = 3500
const STABLE_SD = 0.02

export type Point = { x: number; y: number }

export function qualityOf(error: number): { label: string; tone: 'good' | 'fair' | 'rough' } {
  if (error < 0.05) return { label: 'Good', tone: 'good' }
  if (error < 0.1) return { label: 'Fair', tone: 'fair' }
  return { label: 'Rough', tone: 'rough' }
}

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

// Walks the patient through `targets`, keeping only steady, eyes-open samples,
// and hands back the median features for each dot.
export function Calibration({
  eye,
  targets,
  onComplete,
  onCancel,
}: {
  eye: EyeTracker
  targets: Vec2[]
  onComplete: (samples: CalibrationSample[]) => void
  onCancel: () => void
}) {
  const [index, setIndex] = useState(0)
  const [attempt, setAttempt] = useState(0)
  const [collectingKey, setCollectingKey] = useState('')
  const [warning, setWarning] = useState('')
  const samplesRef = useRef<CalibrationSample[]>([])
  const onCompleteRef = useRef(onComplete)
  const pointKey = `${index}-${attempt}`
  const collecting = collectingKey === pointKey

  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  useEffect(() => {
    if (index >= targets.length) {
      onCompleteRef.current(samplesRef.current)
      return
    }

    const target = targets[index]
    const buffer: number[][] = []
    let raf = 0
    let collecting = false
    let done = false
    let settleFrom = performance.now()
    let collectAt = 0

    const finish = (next: () => void) => {
      if (done) return
      done = true
      next()
    }

    let lastSampleAt = -1

    const tick = () => {
      if (done) return
      raf = requestAnimationFrame(tick)
      const now = performance.now()
      const snap = eye.snapshotRef.current
      if (snap.at === lastSampleAt) return
      lastSampleAt = snap.at
      const usable = Boolean(snap.faceFound && !snap.eyesClosed && snap.features?.every(Number.isFinite))

      if (!usable) {
        settleFrom = now
        if (collecting) {
          buffer.length = 0
          collecting = false
          setCollectingKey('')
          setWarning('Keep your eyes open and your face in view')
        }
        return
      }

      if (!collecting) {
        if (now - settleFrom < SETTLE_MS) return
        collecting = true
        collectAt = now
        setCollectingKey(`${index}-${attempt}`)
        setWarning('')
      }

      buffer.push(snap.features!.slice())

      if (buffer.length < COLLECT_TARGET) {
        if (now - collectAt > COLLECT_TIMEOUT_MS) {
          finish(() => {
            setWarning("Couldn't see your eyes. Look at the dot and hold still.")
            setAttempt((a) => a + 1)
          })
        }
        return
      }

      const dim = buffer[0].length
      const stable = Array.from({ length: dim }, (_, d) => {
        const values = buffer.map((s) => s[d])
        const mean = values.reduce((a, b) => a + b, 0) / values.length
        const sd = Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length)
        return sd <= STABLE_SD
      }).every(Boolean)
      if (!stable) {
        finish(() => {
          setWarning('Hold still and keep looking at this dot')
          setAttempt((a) => a + 1)
        })
        return
      }

      const features = Array.from({ length: dim }, (_, d) => {
        const values = buffer.map((s) => s[d]).sort((a, b) => a - b)
        return values[Math.floor(values.length / 2)]
      })
      finish(() => {
        samplesRef.current.push({ features, target })
        setWarning('')
        setIndex((i) => i + 1)
      })
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
    }
  }, [index, attempt, eye.snapshotRef, targets])

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onCancel])

  const target = targets[Math.min(index, targets.length - 1)]

  return (
    <div className="aim-calibration">
      <div className="aim-calibration-hud">
        <span className="aim-eyebrow">
          Dot {Math.min(index + 1, targets.length)} of {targets.length}
        </span>
        <span className="aim-calibration-hint">
          {warning || (collecting ? 'Keep looking' : 'Look at the dot until it fills in')}
        </span>
        <FaceChip eye={eye} />
      </div>
      <div
        key={pointKey}
        className={`calib-dot ${collecting ? 'is-collecting' : ''}`}
        style={{ left: `${target[0] * 100}%`, top: `${target[1] * 100}%` }}
      />
      <EyeLandmarkOverlay eye={eye} />
      <span className={`eye-lock-label ${eye.faceFound ? 'is-locked' : ''}`}>
        {eye.faceFound ? 'Eyes found' : 'Looking for your eyes'}
      </span>
      <span className="aim-calibration-escape">Esc to cancel</span>
    </div>
  )
}
