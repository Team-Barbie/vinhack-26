import { useEffect, useRef, useState, type RefObject, type CSSProperties } from 'react'
import type { EyeTracker } from '../hooks/useEyeTracker'
import { classifyDirection, directionSignal, DIRECTIONS, medianFeatures, nextRemoteItem, profileValid,
  RemoteBlink, RemoteRepeater, type Direction, type RemoteProfile } from '../lib/eyeRemote'

const SYMBOLS: Record<Direction, string> = { center: '●', left: '←', right: '→', up: '↑', down: '↓' }

export default function EyeRemote({ eye, root, screenKey }: {
  eye: EyeTracker; root: RefObject<HTMLDivElement | null>; screenKey: string
}) {
  const [step, setStep] = useState(-1)
  const [profile, setProfile] = useState<RemoteProfile | null>(null)
  const [paused, setPaused] = useState(false)
  const [status, setStatus] = useState('Set up your eye remote to begin')
  const [progress, setProgress] = useState(0)
  const [selectedLabel, setSelectedLabel] = useState('Call Nurse')
  const [detected, setDetected] = useState<Direction>('center')
  const [moveProgress, setMoveProgress] = useState(0)
  const [pace, setPace] = useState<'steady' | 'quick'>('steady')
  const [feedback, setFeedback] = useState('')
  const moveRef = useRef<(direction: Direction) => void>(() => undefined)
  const templates = useRef<Partial<RemoteProfile>>({})
  const selected = useRef<HTMLButtonElement | null>(null)
  const idCounter = useRef(0)
  const configuring = step >= 0
  const calibrationDirection = DIRECTIONS[step] ?? 'center'

  useEffect(() => {
    const board = root.current
    if (board) board.dataset.eyeReady = String(Boolean(profile) && !paused && !configuring)
    return () => { if (board) delete board.dataset.eyeReady }
  }, [configuring, paused, profile, root])

  useEffect(() => {
    let raf = 0
    let lastFrame = -1
    let lastGood = 0
    let collectAt = 0
    let samples: number[][] = []
    let featureWindow: number[][] = []
    let selectedAt = 0
    let cooldown = 0
    const repeat = new RemoteRepeater(pace === 'steady' ? 420 : 280, pace === 'steady' ? 950 : 700)
    const blink = new RemoteBlink()

    const buttons = () => Array.from(root.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
      .filter((b) => !b.closest('.eye-remote') && b.getBoundingClientRect().width > 0)
    const mark = (button: HTMLButtonElement, now: number, scroll = true) => {
      selected.current?.classList.remove('remote-focused')
      selected.current = button
      button.classList.add('remote-focused')
      setSelectedLabel(button.textContent?.trim() ?? 'Selected')
      selectedAt = now
      if (scroll) button.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
    }
    const navigate = (direction: Direction, now: number) => {
      const controls = buttons()
      if (!selected.current || !controls.includes(selected.current)) {
        const initial = controls.find((b) => b.classList.contains('need-tile')) ?? controls[0]
        if (initial) mark(initial, now, Boolean(profile))
        return
      }
      const items = controls.map((b) => {
        b.dataset.remoteId ??= `eye-control-${++idCounter.current}`
        const r = b.getBoundingClientRect()
        return { id: b.dataset.remoteId, x: r.left + r.width / 2, y: r.top + r.height / 2, width: r.width, height: r.height }
      })
      const id = nextRemoteItem(items, selected.current.dataset.remoteId!, direction)
      const next = controls.find((b) => b.dataset.remoteId === id)
      if (next && next !== selected.current) { mark(next, now); setFeedback('') }
      else if (direction !== 'center') setFeedback(`No more controls ${direction}`)
    }
    moveRef.current = (direction) => {
      repeat.reset(); setMoveProgress(0)
      navigate(direction, performance.now())
    }
    const keydown = (e: KeyboardEvent) => {
      if (configuring || e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement ||
        (e.target instanceof HTMLElement && e.target.closest('.eye-remote') && !e.target.closest('.remote-edge'))) return
      const directions: Record<string, Direction> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }
      if (directions[e.key]) { e.preventDefault(); navigate(directions[e.key], performance.now()) }
      if (e.key === 'Enter' && !e.repeat && selected.current) { e.preventDefault(); selected.current.click() }
    }
    window.addEventListener('keydown', keydown)

    const tick = () => {
      raf = requestAnimationFrame(tick)
      const now = performance.now()
      const snap = eye.snapshotRef.current
      if (!configuring) {
        navigate('center', now)
        // React may update the className after an activation.
        for (const b of buttons()) b.classList.toggle('remote-focused', b === selected.current)
      }
      if (paused || document.hidden || !snap.detectedFace || now - snap.at > 350 || snap.features?.length !== 4 || !snap.features.every(Number.isFinite)) {
        repeat.reset(); blink.reset(); featureWindow = []
        setDetected('center'); setMoveProgress(0)
        samples = []; collectAt = 0
        if (configuring) setProgress(0)
        if (profile || configuring) setStatus(paused ? 'Remote paused' : now - snap.at > 350 ? 'Waiting for a fresh camera frame' : 'Tracking paused — face the camera')
        return
      }
      if (snap.at <= lastFrame) return
      if (snap.at - lastGood > 350) { blink.reset(); repeat.reset() }
      lastFrame = snap.at
      lastGood = snap.at
      const lid = Math.max(snap.blinkL ?? 0, snap.blinkR ?? 0)
      if (configuring) {
        if (lid > 0.55) { samples = []; collectAt = 0; setProgress(0); setStatus('Open your eyes to continue setup'); return }
        collectAt ||= now
        setStatus(`Look ${calibrationDirection === 'center' ? 'at the center' : calibrationDirection} and hold your head still`)
        if (now - collectAt < 850) return
        samples.push(snap.features!.slice(0, 4))
        setProgress(Math.min(1, samples.length / 24))
        if (samples.length < 24) return
        const median = medianFeatures(samples)
        const noise = Math.max(...median.map((v, i) =>
          Math.sqrt(samples.reduce((s, f) => s + (f[i] - v) ** 2, 0) / samples.length)))
        if (noise > 0.018) { samples = []; collectAt = now; setStatus('Hold steady — retrying this direction'); return }
        templates.current[calibrationDirection] = median
        if (step < 5) { setProgress(0); setStep(step + 1) }
        else {
          const candidate = templates.current as RemoteProfile
          if (!profileValid(candidate) || DIRECTIONS.some((d) => classifyDirection(candidate, candidate[d]) !== d)) {
            setStep(-1); setStatus('Directions overlapped. Try setup again with slightly larger eye movements.'); return
          }
          setProfile({ ...candidate }); setStep(-1); setStatus('Remote ready — look in a direction to move')
        }
        return
      }
      if (!profile) return
      const clickId = blink.update(snap.blinkL ?? 0, snap.blinkR ?? 0, now, selected.current?.dataset.remoteId ?? '')
      if (clickId && now >= cooldown && now - selectedAt > 450 && selected.current?.dataset.remoteId === clickId) {
        selected.current.click()
        cooldown = now + 1200
        repeat.reset()
        setDetected('center'); setMoveProgress(0)
        setStatus('Selected — ready again in a moment')
        return
      }
      if (lid > 0.55 || now < cooldown) {
        repeat.reset(); featureWindow = []
        setDetected('center'); setMoveProgress(0)
        if (lid > 0.55) setStatus('Eyes closing — movement paused')
        return
      }
      featureWindow.push(snap.features!.slice(0, 4))
      if (featureWindow.length > 3) featureWindow.shift()
      const signal = directionSignal(profile, medianFeatures(featureWindow))
      const direction = signal.direction
      setDetected(direction)
      setStatus(direction === 'center' ? 'Look at an edge arrow to move' : `${SYMBOLS[direction]} Hold your look to move ${direction}`)
      const move = repeat.update(direction, now)
      setMoveProgress(repeat.progress(now))
      if (move) navigate(move, now)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', keydown)
      moveRef.current = () => undefined
      for (const b of buttons()) b.classList.remove('remote-focused')
    }
  }, [calibrationDirection, configuring, eye.snapshotRef, pace, paused, profile, root, screenKey, step])

  const start = () => { templates.current = {}; setProfile(null); setPaused(false); setProgress(0); setStep(0) }
  return <>
    <div className="eye-remote remote-bar">
      <div><strong>Eye remote</strong><span role="status">{status}</span></div>
      <div className="remote-selection"><span>Highlighted</span><strong>{selectedLabel}</strong><small>{profile ? 'Close eyes briefly, then open to choose' : 'Tap a card, or set up eye control'}</small></div>
      <label className="remote-pace">Movement pace<select value={pace} onChange={(event) => setPace(event.target.value as 'steady' | 'quick')}><option value="steady">Steady</option><option value="quick">Quicker</option></select></label>
      <button type="button" className="home-btn" onClick={start} disabled={eye.status !== 'ready'}>{profile ? 'Reset directions' : 'Set up remote'}</button>
      {profile && <button type="button" className="home-btn" onClick={() => setPaused((v) => !v)}>{paused ? 'Resume' : 'Pause'}</button>}
      {profile && <button type="button" className="home-btn" onClick={() => { templates.current = { ...profile }; setPaused(false); setProgress(0); setStep(5) }}>Re-center</button>}
      {!configuring && <p className="remote-howto"><span><b>1</b> Look at an edge arrow to move</span><span><b>2</b> Look back to the middle to stop</span><span><b>3</b> Hold a blink (~½ second) to choose</span></p>}
      {feedback && <p role="status">{feedback}</p>}
      {eye.status === 'error' && <p>{eye.error}</p>}
    </div>
    {!configuring && <div className="eye-remote remote-edges" aria-label="Directional eye controls">
      {DIRECTIONS.filter((d) => d !== 'center').map((d) => <button type="button" key={d}
        className={`remote-edge remote-edge-${d} ${profile && !paused && detected === d ? 'is-looking' : ''}`}
        style={{ '--move-progress': `${profile && !paused && detected === d ? moveProgress * 100 : 0}%` } as CSSProperties}
        disabled={paused} aria-label={`Look here or tap to move ${d}`}
        onClick={() => moveRef.current(d)}>
        <span className="remote-edge-arrow" aria-hidden="true">{SYMBOLS[d]}</span><strong>{d}</strong><small>{paused ? 'Paused' : 'Look here'}</small>
        <span className="remote-edge-progress" aria-hidden="true" />
      </button>)}
    </div>}
    {configuring && <div className={`eye-remote remote-setup setup-${calibrationDirection}`} role="dialog" aria-modal="true" aria-label="Set up eye remote">
      <div className="remote-setup-copy"><strong>{step === 5 ? 'Return to center · ready to use' : `Direction ${step + 1} of 5`}</strong><p>{status}</p><p>Move your eyes toward the symbol. Keep your head comfortable and still.</p>
        <progress value={progress} max={1} /><button type="button" className="home-btn" onClick={() => { setStep(-1); setStatus('Setup cancelled — tap Set up remote to try again') }}>Cancel setup</button></div>
      <div className={`remote-dot remote-dot-${calibrationDirection}`}>{SYMBOLS[calibrationDirection]}</div>
    </div>}
  </>
}
