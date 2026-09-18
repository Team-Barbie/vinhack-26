import { useEffect, useRef, useState, type RefObject } from 'react'
import type { EyeTracker } from '../hooks/useEyeTracker'
import { directionSignal, DIRECTIONS, medianFeatures, nextRemoteItem, RemoteBlink, RemoteRepeater, type Direction } from '../lib/eyeRemote'

const SYMBOLS: Record<Direction, string> = { center: '●', left: '←', right: '→', up: '↑', down: '↓' }

// Direction templates come from the app-wide calibration (eye.remoteProfile);
// this component only turns live eye features into moves and blink selections.
export default function EyeRemote({ eye, root, screenKey }: {
  eye: EyeTracker; root: RefObject<HTMLDivElement | null>; screenKey: string
}) {
  const profile = eye.remoteProfile
  const [paused, setPaused] = useState(false)
  const [status, setStatus] = useState(profile ? 'Ready. Look left, right, up or down to move.' : 'Off until you calibrate')
  const [selectedLabel, setSelectedLabel] = useState('Call a nurse')
  const [detected, setDetected] = useState<Direction>('center')
  const [strength, setStrength] = useState(0)
  const selected = useRef<HTMLButtonElement | null>(null)
  const idCounter = useRef(0)

  useEffect(() => {
    let raf = 0
    let lastFrame = -1
    let lastGood = 0
    let featureWindow: number[][] = []
    let selectedAt = 0
    let cooldown = 0
    const repeat = new RemoteRepeater()
    const blink = new RemoteBlink()
    selected.current = null

    const buttons = () => Array.from(root.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
      .filter((b) => !b.closest('.eye-remote') && b.getBoundingClientRect().width > 0)
    const mark = (button: HTMLButtonElement, now: number) => {
      selected.current?.classList.remove('remote-focused')
      selected.current = button
      button.classList.add('remote-focused')
      setSelectedLabel(button.getAttribute('aria-label') ?? button.textContent?.trim() ?? 'Selected')
      selectedAt = now
      button.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
    }
    const navigate = (direction: Direction, now: number) => {
      const controls = buttons()
      if (!selected.current || !controls.includes(selected.current)) {
        const initial = controls.find((b) => b.classList.contains('need-tile')) ?? controls[0]
        if (initial) mark(initial, now)
        return
      }
      const items = controls.map((b) => {
        b.dataset.remoteId ??= `eye-control-${++idCounter.current}`
        const r = b.getBoundingClientRect()
        return { id: b.dataset.remoteId, x: r.left + r.width / 2, y: r.top + r.height / 2, width: r.width, height: r.height }
      })
      const id = nextRemoteItem(items, selected.current.dataset.remoteId!, direction)
      const next = controls.find((b) => b.dataset.remoteId === id)
      if (next && next !== selected.current) mark(next, now)
    }
    const keydown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || (e.target instanceof HTMLElement && e.target.closest('.eye-remote'))) return
      const directions: Record<string, Direction> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }
      if (directions[e.key]) { e.preventDefault(); navigate(directions[e.key], performance.now()) }
      if (e.key === 'Enter' && !e.repeat && selected.current) { e.preventDefault(); selected.current.click() }
    }
    window.addEventListener('keydown', keydown)

    const tick = () => {
      raf = requestAnimationFrame(tick)
      const now = performance.now()
      const snap = eye.snapshotRef.current
      navigate('center', now)
      // React may update the className after an activation.
      for (const b of buttons()) b.classList.toggle('remote-focused', b === selected.current)
      if (!profile) return
      if (paused || document.hidden || !snap.detectedFace || now - snap.at > 350 || snap.features?.length !== 4 || !snap.features.every(Number.isFinite)) {
        repeat.reset(); blink.reset(); featureWindow = []
        setDetected('center'); setStrength(0)
        setStatus(paused ? 'Paused' : now - snap.at > 350 ? 'Waiting for the camera' : 'Tracking paused. Face the camera.')
        return
      }
      if (snap.at <= lastFrame) return
      if (snap.at - lastGood > 350) { blink.reset(); repeat.reset() }
      lastFrame = snap.at
      lastGood = snap.at
      const lid = Math.max(snap.blinkL ?? 0, snap.blinkR ?? 0)
      const clickId = blink.update(snap.blinkL ?? 0, snap.blinkR ?? 0, now, selected.current?.dataset.remoteId ?? '')
      if (clickId && now >= cooldown && now - selectedAt > 450 && selected.current?.dataset.remoteId === clickId) {
        selected.current.click()
        cooldown = now + 1200
        repeat.reset()
        setStatus('Done. Wait a second before the next one.')
        return
      }
      if (lid > 0.55 || now < cooldown) {
        repeat.reset(); featureWindow = []
        if (lid > 0.55) setStatus('Eyes closed, holding still')
        return
      }
      featureWindow.push(snap.features!.slice(0, 4))
      if (featureWindow.length > 3) featureWindow.shift()
      const signal = directionSignal(profile, medianFeatures(featureWindow))
      const direction = signal.direction
      setDetected(direction)
      setStrength(Math.round(Math.min(1, signal.strength) * 100))
      setStatus(direction === 'center' ? 'Ready. Close your eyes to pick.' : `${SYMBOLS[direction]} Moving ${direction}. Look at the middle to stop.`)
      const move = repeat.update(direction, now)
      if (move) navigate(move, now)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', keydown)
      for (const b of buttons()) b.classList.remove('remote-focused')
    }
  }, [eye.snapshotRef, paused, profile, root, screenKey])

  return (
    <div className="eye-remote remote-bar">
      <div><strong>Eye remote</strong><span role="status">{status}</span></div>
      <div className="remote-selection">Selected: <strong>{selectedLabel}</strong></div>
      {profile && <div className="remote-feedback" aria-label="Detected eye direction">
        {DIRECTIONS.map((d) => <span key={d} className={detected === d ? 'active' : ''} title={d}>{SYMBOLS[d]}</span>)}
        <small>Eye movement {strength}%</small>
      </div>}
      {profile && <button type="button" className="home-btn" onClick={() => setPaused((v) => !v)}>{paused ? 'Resume' : 'Pause'}</button>}
      <p>
        {profile
          ? 'Look left, right, up or down to move between cards, and back at the middle to stop. Close your eyes for half a second to pick a card. Arrow keys and Enter work too.'
          : 'Calibrate to move between cards with your eyes. Until then, tap a card or use the arrow keys and Enter.'}
      </p>
      {eye.status === 'error' && <p>{eye.error}</p>}
    </div>
  )
}
