import { useCallback, useEffect, useRef, useState } from 'react'
import { useEye } from '../hooks/EyeTrackerProvider'
import type { EyeTracker } from '../hooks/useEyeTracker'
import { Crosshair, FaceChip, useCursor } from './Calibration'
import './AimGame.css'

type Phase = 'start' | 'playing' | 'results'
type InputMode = 'gaze' | 'mouse'

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

function Start({
  eye,
  onPlay,
  onMouse,
  onRecalibrate,
  onExit,
}: {
  eye: EyeTracker
  onPlay: () => void
  onMouse: () => void
  onRecalibrate: () => void
  onExit: () => void
}) {
  return (
    <div className="aim-setup">
      <button type="button" className="aim-back" onClick={onExit}>
        Home
      </button>
      <div className="aim-setup-card">
        <span className="aim-eyebrow">Aim Trainer</span>
        <h1 className="aim-title">Aim with your eyes. Blink to shoot.</h1>
        <p className="aim-lede">
          {eye.calibrated
            ? 'Three targets, thirty seconds. Look at a target and blink to hit it.'
            : "You haven't calibrated, so this round uses the mouse. Calibrate to aim with your eyes."}
        </p>
        <div className="aim-status-row">
          <FaceChip eye={eye} />
        </div>
        <div className="aim-actions">
          {eye.calibrated ? (
            <button type="button" className="aim-btn is-primary" disabled={eye.status !== 'ready'} onClick={onPlay}>
              Start round
            </button>
          ) : (
            <button type="button" className="aim-btn is-primary" onClick={onRecalibrate}>
              Calibrate
            </button>
          )}
          <button type="button" className="aim-btn is-ghost" onClick={onMouse}>
            Use the mouse
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

export default function AimGame({ onExit, onRecalibrate }: { onExit: () => void; onRecalibrate: () => void }) {
  const eye = useEye()
  const [phase, setPhase] = useState<Phase>('start')
  const [mode, setMode] = useState<InputMode>('gaze')
  const [results, setResults] = useState<RoundResults | null>(null)
  const [round, setRound] = useState(0)

  const startRound = (nextMode: InputMode) => {
    setMode(nextMode)
    setRound((r) => r + 1)
    setPhase('playing')
  }

  const quitRound = useCallback(() => setPhase('start'), [])
  const toggleMode = useCallback(() => {
    setMode((m) => (m === 'mouse' && eye.calibrated ? 'gaze' : 'mouse'))
  }, [eye.calibrated])
  const finishRound = useCallback((r: RoundResults) => {
    setResults(r)
    setPhase('results')
  }, [])

  return (
    <div className={`aim phase-${phase} mode-${mode}`}>
      {phase === 'start' && (
        <Start
          eye={eye}
          onPlay={() => startRound('gaze')}
          onMouse={() => startRound('mouse')}
          onRecalibrate={onRecalibrate}
          onExit={onExit}
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
          onRecalibrate={onRecalibrate}
          onExit={onExit}
        />
      )}
    </div>
  )
}
