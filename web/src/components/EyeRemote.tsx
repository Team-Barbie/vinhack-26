import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import type { EyeTracker } from '../hooks/useEyeTracker'
import { directionSignal, DIRECTIONS, medianFeatures, nextRemoteItem, RemoteBlink, RemoteRepeater, type Direction } from '../lib/eyeRemote'

const SYMBOLS: Record<Direction, string> = { center: '●', left: '←', right: '→', up: '↑', down: '↓' }

// Direction templates come from the app-wide calibration (eye.remoteProfile);
// this component turns live eye features into moves and blink selections, and
// draws the four edge arrows that show and guide the direction being looked at.
// There is no panel: the arrows and the highlighted card are the whole interface.
export default function EyeRemote({ eye, root, screenKey }: {
  eye: EyeTracker; root: RefObject<HTMLDivElement | null>; screenKey: string
}) {
  const profile = eye.remoteProfile
  const [detected, setDetected] = useState<Direction>('center')
  const [moveProgress, setMoveProgress] = useState(0)
  const moveRef = useRef<(direction: Direction) => void>(() => undefined)
  const selected = useRef<HTMLButtonElement | null>(null)
  const idCounter = useRef(0)

  useEffect(() => {
    const board = root.current
    if (board) board.dataset.eyeReady = String(Boolean(profile))
    return () => { if (board) delete board.dataset.eyeReady }
  }, [profile, root])

  useEffect(() => {
    let raf = 0
    let lastFrame = -1
    let lastGood = 0
    let featureWindow: number[][] = []
    let selectedAt = 0
    let cooldown = 0
    const repeat = new RemoteRepeater(420, 950)
    const blink = new RemoteBlink()
    // Entering Phrases: drop the old highlight so it refocuses on the phrase panels.
    if (screenKey === 'gaze' && selected.current) {
      selected.current.classList.remove('remote-focused')
      selected.current = null
    }

    const buttons = () => Array.from(root.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
      .filter((b) => !b.closest('.eye-remote') && b.getBoundingClientRect().width > 0)
    const mark = (button: HTMLButtonElement, now: number, scroll = true) => {
      selected.current?.classList.remove('remote-focused')
      selected.current = button
      button.classList.add('remote-focused')
      selectedAt = now
      if (scroll) button.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
    }
    const navigate = (direction: Direction, now: number) => {
      const controls = buttons()
      if (!selected.current || !controls.includes(selected.current)) {
        const initial = screenKey === 'gaze'
          ? controls.find((b) => b.dataset.gazeControl === 'true') ?? controls[0]
          : controls.find((b) => b.classList.contains('need-tile')) ?? controls[0]
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
      if (next && next !== selected.current) mark(next, now)
    }
    moveRef.current = (direction) => {
      repeat.reset(); setMoveProgress(0)
      navigate(direction, performance.now())
    }
    const keydown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement ||
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
      navigate('center', now)
      // React may update the className after an activation.
      for (const b of buttons()) b.classList.toggle('remote-focused', b === selected.current)
      if (!profile) return
      if (document.hidden || !snap.detectedFace || now - snap.at > 350 || snap.features?.length !== 4 || !snap.features.every(Number.isFinite)) {
        repeat.reset(); blink.reset(); featureWindow = []
        setDetected('center'); setMoveProgress(0)
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
        setDetected('center'); setMoveProgress(0)
        return
      }
      if (lid > 0.55 || now < cooldown) {
        repeat.reset(); featureWindow = []
        setDetected('center'); setMoveProgress(0)
        return
      }
      featureWindow.push(snap.features!.slice(0, 4))
      if (featureWindow.length > 3) featureWindow.shift()
      const direction = directionSignal(profile, medianFeatures(featureWindow)).direction
      setDetected(direction)
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
  }, [eye.snapshotRef, profile, root, screenKey])

  const looking = (d: Direction) => Boolean(profile) && detected === d

  return (
    <div className="eye-remote remote-edges" aria-label="Direction arrows">
      {DIRECTIONS.filter((d) => d !== 'center').map((d) => (
        <button
          type="button"
          key={d}
          className={`remote-edge remote-edge-${d} ${looking(d) ? 'is-looking' : ''}`}
          style={{ '--move-progress': `${looking(d) ? moveProgress * 100 : 0}%` } as CSSProperties}
          aria-label={`Look here or tap to move ${d}`}
          onClick={() => moveRef.current(d)}
        >
          <span className="remote-edge-arrow" aria-hidden="true">{SYMBOLS[d]}</span>
          <strong>{d}</strong>
          <small>Look here</small>
          <span className="remote-edge-progress" aria-hidden="true" />
        </button>
      ))}
    </div>
  )
}
