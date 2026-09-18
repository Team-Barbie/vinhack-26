import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'
import { useEyeTracker, type EyeTracker } from '../hooks/useEyeTracker'
import {
  CALIBRATION_TARGETS,
  fitCalibration,
  type CalibrationModel,
  type CalibrationSample,
} from '../lib/eyeTracking'
import './AimGame.css'

type Phase = 'setup' | 'calibrating' | 'review' | 'playing' | 'results'
type InputMode = 'gaze' | 'mouse'
type Point = { x: number; y: number }

const SETTLE_MS = 1000
const COLLECT_TARGET = 24
const COLLECT_TIMEOUT_MS = 3500
const STABLE_SD = 0.02

const ROUND_MS = 30_000
const COUNTDOWN_MS = 3000
const TARGET_COUNT = 3
const TARGET_R = 46
// Webcam gaze lands a few cm off, so hits are judged on a radius well beyond the visible target.
const HIT_R = 72
const TARGET_TTL_MS = 3500
const HUD_CLEARANCE = 120

interface RoundResults {
  score: number
  hits: number
  misses: number
  bestCombo: number
  avgReactionMs: number | null
}

function qualityOf(error: number): { label: string; tone: 'good' | 'fair' | 'rough' } {
  if (error < 0.05) return { label: 'Good', tone: 'good' }
  if (error < 0.1) return { label: 'Fair', tone: 'fair' }
  return { label: 'Rough', tone: 'rough' }
}

function useCursor(eye: EyeTracker, mode: InputMode): MutableRefObject<Point | null> {
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

function Crosshair({ cursorRef, dimmed }: { cursorRef: MutableRefObject<Point | null>; dimmed: boolean }) {
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
        setLandmarkFrame(
          landmarks?.map((point) => ({ x: 1 - point.x, y: point.y })) ?? [],
        )
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

function Setup({
  eye,
  onCalibrate,
  onPlay,
  onMouse,
  onExit,
}: {
  eye: EyeTracker
  onCalibrate: () => void
  onPlay: () => void
  onMouse: () => void
  onExit: () => void
}) {
  const ready = eye.status === 'ready' && eye.faceFound

  return (
    <div className="aim-setup">
      <button type="button" className="aim-back" onClick={onExit}>
        Home
      </button>
      <div className="aim-setup-card">
        <span className="aim-eyebrow">Aim Trainer</span>
        <h1 className="aim-title">Aim with your eyes. Blink to shoot.</h1>
        <p className="aim-lede">
          Sit 50–80 cm from the screen with your face evenly lit and your head mostly still. Calibration takes
          about 15 seconds. Just follow the dot with your eyes.
        </p>

        <div className="aim-status-row">
          <FaceChip eye={eye} />
        </div>
        {eye.status === 'error' && <p className="aim-error">{eye.error}</p>}

        <div className="aim-actions">
          <button type="button" className="aim-btn is-primary" disabled={!ready} onClick={onCalibrate}>
            {eye.calibrated ? 'Recalibrate' : 'Start calibration'}
          </button>
          {eye.calibrated && (
            <button type="button" className="aim-btn" disabled={!ready} onClick={onPlay}>
              Play with last calibration
            </button>
          )}
          <button type="button" className="aim-btn is-ghost" onClick={onMouse}>
            Use mouse instead
          </button>
        </div>
      </div>
    </div>
  )
}

export function Calibration({
  eye,
  onComplete,
  onCancel,
}: {
  eye: EyeTracker
  onComplete: (model: CalibrationModel | null) => void
  onCancel: () => void
}) {
  const [index, setIndex] = useState(0)
  const [attempt, setAttempt] = useState(0)
  const [collectingKey, setCollectingKey] = useState('')
  const [framesCollected, setFramesCollected] = useState(0)
  const [warning, setWarning] = useState('')
  const samplesRef = useRef<CalibrationSample[]>([])
  const onCompleteRef = useRef(onComplete)
  const pointKey = `${index}-${attempt}`
  const collecting = collectingKey === pointKey

  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  useEffect(() => {
    if (index >= CALIBRATION_TARGETS.length) {
      onCompleteRef.current(fitCalibration(samplesRef.current))
      return
    }

    const target = CALIBRATION_TARGETS[index]
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
          setFramesCollected(0)
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
      if (buffer.length % 4 === 0) setFramesCollected(buffer.length)

      if (buffer.length < COLLECT_TARGET) {
        if (now - collectAt > COLLECT_TIMEOUT_MS) {
          finish(() => {
            setWarning("Couldn't see your eyes. Look at the dot and hold still.")
            setFramesCollected(0)
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
          setFramesCollected(0)
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
        setFramesCollected(0)
        setIndex((i) => i + 1)
      })
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
    }
  }, [index, attempt, eye.snapshotRef])

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onCancel])

  const target = CALIBRATION_TARGETS[Math.min(index, CALIBRATION_TARGETS.length - 1)]

  return (
    <div className="aim-calibration">
      <div className="aim-calibration-hud">
        <span className="aim-eyebrow">
          Calibrating · {Math.min(index + 1, CALIBRATION_TARGETS.length)} / {CALIBRATION_TARGETS.length}
        </span>
        <span className="aim-calibration-hint">
          {warning || (collecting ? `Eyes tracked · ${framesCollected} samples` : 'Look at the dot until it fills in')}
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
        {eye.faceFound ? 'Eyes locked' : 'Find your eyes'}
      </span>
      <span className="aim-calibration-escape">Esc to cancel</span>
    </div>
  )
}

function Review({
  eye,
  error,
  onPlay,
  onRecalibrate,
}: {
  eye: EyeTracker
  error: number
  onPlay: () => void
  onRecalibrate: () => void
}) {
  const cursorRef = useCursor(eye, 'gaze')
  const quality = qualityOf(error)

  return (
    <div className="aim-setup">
      <Crosshair cursorRef={cursorRef} dimmed={!eye.faceFound} />
      <div className="aim-setup-card">
        <span className="aim-eyebrow">Calibration complete</span>
        <h1 className="aim-title">
          Quality: <span className={`aim-quality is-${quality.tone}`}>{quality.label}</span>
        </h1>
        <p className="aim-lede">
          Look around the screen. The crosshair should follow your eyes.
          {quality.tone === 'rough' && ' Tracking looks unreliable; recalibrating in better light usually helps.'}
        </p>
        <div className="aim-actions">
          <button type="button" className="aim-btn is-primary" onClick={onPlay}>
            Start round
          </button>
          <button type="button" className="aim-btn" onClick={onRecalibrate}>
            Recalibrate
          </button>
        </div>
      </div>
    </div>
  )
}

interface Target {
  id: number
  x: number
  y: number
  spawnedAt: number
}

interface RoundStats {
  score: number
  hits: number
  misses: number
  combo: number
  bestCombo: number
}

const EMPTY_STATS: RoundStats = { score: 0, hits: 0, misses: 0, combo: 0, bestCombo: 0 }

interface Marker {
  id: number
  x: number
  y: number
  hit: boolean
}

let nextId = 1

function spawnTarget(existing: Target[], now: number): Target {
  const w = window.innerWidth
  const h = window.innerHeight
  const margin = TARGET_R + 24
  let best = { x: w / 2, y: h / 2 }
  for (let i = 0; i < 40; i++) {
    const candidate = {
      x: margin + Math.random() * (w - margin * 2),
      y: HUD_CLEARANCE + margin + Math.random() * (h - HUD_CLEARANCE - margin * 2),
    }
    best = candidate
    if (existing.every((t) => Math.hypot(t.x - candidate.x, t.y - candidate.y) > HIT_R * 2 + 12)) break
  }
  return { id: nextId++, ...best, spawnedAt: now }
}

function Gridshot({
  eye,
  mode,
  onToggleMode,
  onFinish,
  onQuit,
}: {
  eye: EyeTracker
  mode: InputMode
  onToggleMode: () => void
  onFinish: (results: RoundResults) => void
  onQuit: () => void
}) {
  const cursorRef = useCursor(eye, mode)
  // Mutable round state lives in refs so the rAF loop and blink handler never
  // see stale values; `view` is the snapshot React renders from.
  const targetsRef = useRef<Target[]>([])
  const statsRef = useRef<RoundStats>({ ...EMPTY_STATS })
  const [view, setView] = useState<{ targets: Target[]; stats: RoundStats }>({ targets: [], stats: EMPTY_STATS })
  const reactionsRef = useRef<number[]>([])
  const startRef = useRef<number | null>(null)
  const [countdown, setCountdown] = useState(3)
  const [timeLeftTenths, setTimeLeftTenths] = useState(ROUND_MS / 100)
  const [markers, setMarkers] = useState<Marker[]>([])
  const onFinishRef = useRef(onFinish)

  useEffect(() => {
    onFinishRef.current = onFinish
  }, [onFinish])

  const syncView = useCallback(() => {
    setView({ targets: targetsRef.current, stats: { ...statsRef.current } })
  }, [])

  const addMarker = useCallback((x: number, y: number, hit: boolean) => {
    const marker = { id: nextId++, x, y, hit }
    setMarkers((m) => [...m, marker])
    window.setTimeout(() => setMarkers((m) => m.filter((k) => k.id !== marker.id)), 450)
  }, [])

  const shoot = useCallback(() => {
    if (startRef.current === null) return
    const c = cursorRef.current
    if (!c) return
    const now = performance.now()
    const stats = statsRef.current
    const hit = targetsRef.current.find((t) => Math.hypot(t.x - c.x, t.y - c.y) <= HIT_R)
    if (hit) {
      reactionsRef.current.push(now - hit.spawnedAt)
      stats.score += 100 + stats.combo * 10
      stats.hits += 1
      stats.combo += 1
      stats.bestCombo = Math.max(stats.bestCombo, stats.combo)
      const others = targetsRef.current.filter((t) => t.id !== hit.id)
      targetsRef.current = [...others, spawnTarget(others, now)]
    } else {
      stats.misses += 1
      stats.combo = 0
    }
    addMarker(c.x, c.y, Boolean(hit))
    syncView()
  }, [addMarker, cursorRef, syncView])

  useEffect(() => {
    const begin = performance.now()
    let raf = 0
    let lastTenths = -1

    const tick = () => {
      raf = requestAnimationFrame(tick)
      const now = performance.now()

      if (startRef.current === null) {
        const remaining = COUNTDOWN_MS - (now - begin)
        if (remaining > 0) {
          setCountdown(Math.ceil(remaining / 1000))
          return
        }
        startRef.current = now
        setCountdown(0)
        const initial: Target[] = []
        for (let i = 0; i < TARGET_COUNT; i++) initial.push(spawnTarget(initial, now))
        targetsRef.current = initial
        syncView()
      }

      const elapsed = now - startRef.current
      const tenths = Math.max(0, Math.ceil((ROUND_MS - elapsed) / 100))
      if (tenths !== lastTenths) {
        lastTenths = tenths
        setTimeLeftTenths(tenths)
      }

      const expired = targetsRef.current.filter((t) => now - t.spawnedAt > TARGET_TTL_MS)
      if (expired.length > 0) {
        const stats = statsRef.current
        stats.misses += expired.length
        stats.combo = 0
        let alive = targetsRef.current.filter((t) => !expired.includes(t))
        for (let i = 0; i < expired.length; i++) alive = [...alive, spawnTarget(alive, now)]
        targetsRef.current = alive
        syncView()
      }

      if (elapsed >= ROUND_MS) {
        cancelAnimationFrame(raf)
        const s = statsRef.current
        const reactions = reactionsRef.current
        onFinishRef.current({
          score: s.score,
          hits: s.hits,
          misses: s.misses,
          bestCombo: s.bestCombo,
          avgReactionMs: reactions.length ? reactions.reduce((a, b) => a + b, 0) / reactions.length : null,
        })
      }
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [syncView])

  const { onBlink } = eye
  useEffect(() => (mode === 'gaze' ? onBlink(shoot) : undefined), [onBlink, mode, shoot])

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault()
        shoot()
      } else if (e.key === 'Escape') onQuit()
      else if (e.key === 'm' || e.key === 'M') onToggleMode()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [shoot, onQuit, onToggleMode])

  const { stats, targets } = view
  const attempts = stats.hits + stats.misses
  const accuracy = attempts ? Math.round((stats.hits / attempts) * 100) : 100
  const faceLost = mode === 'gaze' && !eye.faceFound

  return (
    <div className="aim-playfield" onPointerDown={shoot}>
      <div className="aim-hud" onPointerDown={(e) => e.stopPropagation()}>
        <div className="aim-hud-stat">
          <span className="aim-hud-label">Time</span>
          <span className="aim-hud-value">{(timeLeftTenths / 10).toFixed(1)}</span>
        </div>
        <div className="aim-hud-stat">
          <span className="aim-hud-label">Score</span>
          <span className="aim-hud-value">{stats.score}</span>
        </div>
        <div className="aim-hud-stat">
          <span className="aim-hud-label">Accuracy</span>
          <span className="aim-hud-value">{accuracy}%</span>
        </div>
        <div className="aim-hud-stat">
          <span className="aim-hud-label">Combo</span>
          <span className="aim-hud-value">×{stats.combo}</span>
        </div>
        <div className="aim-hud-actions">
          <button type="button" className="aim-chip-btn" onClick={onToggleMode}>
            {mode === 'gaze' ? 'Gaze' : 'Mouse'} (M)
          </button>
          <button type="button" className="aim-chip-btn" onClick={onQuit}>
            Quit
          </button>
        </div>
      </div>

      {targets.map((t) => (
        <div
          key={t.id}
          className="aim-target"
          style={{ left: t.x, top: t.y, width: TARGET_R * 2, height: TARGET_R * 2 }}
        />
      ))}

      {markers.map((m) => (
        <div key={m.id} className={`aim-marker ${m.hit ? 'is-hit' : 'is-miss'}`} style={{ left: m.x, top: m.y }} />
      ))}

      {countdown > 0 && <div className="aim-countdown">{countdown}</div>}
      {faceLost && countdown === 0 && <div className="aim-banner">Face not found. Look at the screen.</div>}

      <Crosshair cursorRef={cursorRef} dimmed={faceLost} />
    </div>
  )
}

function Results({
  results,
  onReplay,
  onRecalibrate,
  onExit,
}: {
  results: RoundResults
  onReplay: () => void
  onRecalibrate: () => void
  onExit: () => void
}) {
  const attempts = results.hits + results.misses
  const accuracy = attempts ? Math.round((results.hits / attempts) * 100) : 0

  return (
    <div className="aim-setup">
      <div className="aim-setup-card">
        <span className="aim-eyebrow">Round complete</span>
        <h1 className="aim-title aim-score">{results.score}</h1>
        <div className="aim-results">
          <div>
            <span className="aim-hud-label">Hits</span>
            <span className="aim-hud-value">{results.hits}</span>
          </div>
          <div>
            <span className="aim-hud-label">Accuracy</span>
            <span className="aim-hud-value">{accuracy}%</span>
          </div>
          <div>
            <span className="aim-hud-label">Avg reaction</span>
            <span className="aim-hud-value">
              {results.avgReactionMs === null ? 'No hits' : `${Math.round(results.avgReactionMs)} ms`}
            </span>
          </div>
          <div>
            <span className="aim-hud-label">Best combo</span>
            <span className="aim-hud-value">×{results.bestCombo}</span>
          </div>
        </div>
        <div className="aim-actions">
          <button type="button" className="aim-btn is-primary" onClick={onReplay}>
            Play again
          </button>
          <button type="button" className="aim-btn" onClick={onRecalibrate}>
            Recalibrate
          </button>
          <button type="button" className="aim-btn is-ghost" onClick={onExit}>
            Home
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AimGame({ onExit }: { onExit: () => void }) {
  const eye = useEyeTracker()
  const [phase, setPhase] = useState<Phase>('setup')
  const [mode, setMode] = useState<InputMode>('gaze')
  const [calibrationError, setCalibrationError] = useState(0)
  const [results, setResults] = useState<RoundResults | null>(null)
  const [round, setRound] = useState(0)

  const startRound = (nextMode: InputMode) => {
    setMode(nextMode)
    setRound((r) => r + 1)
    setPhase('playing')
  }

  const finishCalibration = useCallback(
    (model: CalibrationModel | null) => {
      if (!model) {
        setPhase('setup')
        return
      }
      eye.setCalibration(model)
      setCalibrationError(model.error)
      setMode('gaze')
      setPhase('review')
    },
    [eye],
  )

  const cancelCalibration = useCallback(() => setPhase('setup'), [])
  const quitRound = useCallback(() => setPhase('setup'), [])
  const toggleMode = useCallback(() => {
    setMode((m) => (m === 'mouse' && eye.calibrated ? 'gaze' : 'mouse'))
  }, [eye.calibrated])
  const finishRound = useCallback((r: RoundResults) => {
    setResults(r)
    setPhase('results')
  }, [])

  return (
    <div className={`aim phase-${phase} mode-${mode}`}>
      <video
        ref={eye.videoRef}
        className={`aim-preview ${phase === 'setup' ? 'is-large' : ''}`}
        muted
        playsInline
      />

      {phase === 'setup' && (
        <Setup
          eye={eye}
          onCalibrate={() => setPhase('calibrating')}
          onPlay={() => startRound('gaze')}
          onMouse={() => startRound('mouse')}
          onExit={onExit}
        />
      )}
      {phase === 'calibrating' && <Calibration eye={eye} onComplete={finishCalibration} onCancel={cancelCalibration} />}
      {phase === 'review' && (
        <Review
          eye={eye}
          error={calibrationError}
          onPlay={() => startRound('gaze')}
          onRecalibrate={() => setPhase('calibrating')}
        />
      )}
      {phase === 'playing' && (
        <Gridshot
          key={round}
          eye={eye}
          mode={mode}
          onToggleMode={toggleMode}
          onFinish={finishRound}
          onQuit={quitRound}
        />
      )}
      {phase === 'results' && results && (
        <Results
          results={results}
          onReplay={() => startRound(mode)}
          onRecalibrate={() => setPhase('calibrating')}
          onExit={onExit}
        />
      )}
    </div>
  )
}
