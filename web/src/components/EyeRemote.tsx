import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import type { EyeTracker } from '../hooks/useEyeTracker'
import {
  DirectionHold,
  directionSignal,
  DIRECTIONS,
  medianFeatures,
  MOVE_ENTER,
  MOVE_ENTER_SETTLE,
  MOVE_HOLD_MS,
  MOVE_HOLD_SETTLE_MS,
  MOVE_REPEAT_MS,
  nextRemoteItem,
  RemoteBlink,
  RemoteRepeater,
  SCREEN_SETTLE_MS,
  type Direction,
} from '../lib/eyeRemote'

const SYMBOLS: Record<Direction, string> = { center: '●', left: '←', right: '→', up: '↑', down: '↓' }
const LABELS: Record<Direction, string> = { center: 'Center', left: 'Left', right: 'Right', up: 'Top', down: 'Bottom' }

// Direction templates come from the app-wide calibration (eye.remoteProfile);
// this component turns live eye features into moves and blink selections, and
// draws the four edge arrows that show and guide the direction being looked at.
// There is no panel: the arrows and the highlighted card are the whole interface.
export default function EyeRemote({ eye, root, screenKey }: {
  eye: EyeTracker; root: RefObject<HTMLDivElement | null>; screenKey: string
}) {
  const profile = eye.remoteProfile
  const [detected, setDetected] = useState<Direction>('center')
  const [fillCycle, setFillCycle] = useState(0)
  const [fillMs, setFillMs] = useState(MOVE_HOLD_MS)
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
    let lastPublished: Direction = 'center'
    let featureWindow: number[][] = []
    let cooldown = 0
    const repeat = new RemoteRepeater(MOVE_HOLD_MS, MOVE_REPEAT_MS)
    const blink = new RemoteBlink()
    const hold = new DirectionHold()
    let lastFillMs = MOVE_HOLD_MS
    const enteredAt = performance.now()
    const publish = (direction: Direction, duration = MOVE_HOLD_MS) => {
      if (direction === lastPublished && duration === lastFillMs) return
      lastPublished = direction
      lastFillMs = duration
      setDetected(direction)
      setFillMs(duration)
      if (direction !== 'center') setFillCycle((n) => n + 1)
    }
    // Entering Phrases: drop the old highlight so it refocuses on the phrase panels.
    if (screenKey === 'gaze' && selected.current) {
      selected.current.classList.remove('remote-focused')
      selected.current = null
    }

    const buttons = () => Array.from(root.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
      .filter((b) => !b.closest('.eye-remote') && b.getBoundingClientRect().width > 0)
    const mark = (button: HTMLButtonElement, _now: number, scroll = true) => {
      selected.current?.classList.remove('remote-focused')
      selected.current = button
      button.classList.add('remote-focused')
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
      const current = selected.current
      const center = (button: HTMLButtonElement) => {
        const rect = button.getBoundingClientRect()
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
      }
      const nearestByX = (choices: HTMLButtonElement[]) => {
        const fromX = center(current).x
        return choices.sort((a, b) => Math.abs(center(a).x - fromX) - Math.abs(center(b).x - fromX))[0]
      }

      // The answer bar is narrower than the card grid. Pure geometric navigation
      // otherwise skips it from an outside column and jumps to the top nav.
      if (direction === 'up' && current.classList.contains('need-tile')) {
        const currentY = center(current).y
        const cardAbove = controls.some((button) =>
          button.classList.contains('need-tile') && center(button).y < currentY - 8,
        )
        if (!cardAbove) {
          const answer = nearestByX(controls.filter((button) => button.classList.contains('answer-btn')))
          if (answer) { mark(answer, now); return }
        }
      }
      if (direction === 'down' && current.classList.contains('answer-btn')) {
        const firstRowY = Math.min(...controls
          .filter((button) => button.classList.contains('need-tile'))
          .map((button) => center(button).y))
        const firstRow = controls.filter((button) =>
          button.classList.contains('need-tile') && Math.abs(center(button).y - firstRowY) < 8,
        )
        const card = nearestByX(firstRow)
        if (card) { mark(card, now); return }
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
      repeat.reset()
      hold.reset()
      publish('center')
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
      if (document.hidden) {
        hold.reset(); repeat.reset(); featureWindow = []
        publish('center')
        return
      }

      const stale = now - snap.at > 400
      const trackingOk = Boolean(
        snap.detectedFace && snap.features?.length === 4 && snap.features.every(Number.isFinite),
      )
      const faceLost = !snap.detectedFace || stale
      const selectedId = selected.current?.dataset.remoteId ?? ''
      const clickId = blink.update(snap.blinkL ?? 0, snap.blinkR ?? 0, now, selectedId, faceLost)
      if (clickId && now >= cooldown && selected.current?.dataset.remoteId === clickId) {
        selected.current.click()
        cooldown = now + 1100
        hold.reset(); repeat.reset(); featureWindow = []
        publish('center')
        return
      }

      // Freeze the overlay during a blink so closing lids don't yank the bar.
      if (snap.eyesClosed || blink.holding || now < cooldown) return
      if (stale) {
        if (now - lastGood > 450) {
          hold.reset(); repeat.reset(); featureWindow = []
          publish('center')
        }
        return
      }
      if (!trackingOk) return
      if (snap.at <= lastFrame) return
      lastFrame = snap.at
      lastGood = snap.at

      featureWindow.push(snap.features!.slice(0, 4))
      if (featureWindow.length > 5) featureWindow.shift()
      const settling = now - enteredAt < SCREEN_SETTLE_MS
      const enter = settling ? MOVE_ENTER_SETTLE : MOVE_ENTER
      const holdMs = settling ? MOVE_HOLD_SETTLE_MS : MOVE_HOLD_MS
      const raw = directionSignal(profile, medianFeatures(featureWindow), hold.value, enter).direction
      const direction = hold.update(raw, now)
      const move = repeat.update(direction, now, holdMs)
      if (move) {
        navigate(move, now)
        publish(direction, MOVE_REPEAT_MS)
      } else {
        publish(direction, repeat.repeating ? MOVE_REPEAT_MS : holdMs)
      }
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', keydown)
      moveRef.current = () => undefined
      blink.reset()
      hold.reset()
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
          style={{ '--fill-ms': `${looking(d) ? fillMs : MOVE_HOLD_MS}ms` } as CSSProperties}
          aria-label={`Look here or tap to move ${LABELS[d].toLowerCase()}`}
          onClick={() => moveRef.current(d)}
        >
          <span className="remote-edge-arrow" aria-hidden="true">{SYMBOLS[d]}</span>
          <strong>{LABELS[d]}</strong>
          <span key={`${d}-${looking(d) ? fillCycle : 'idle'}`} className="remote-edge-progress" aria-hidden="true" />
        </button>
      ))}
    </div>
  )
}
