export type Direction = 'center' | 'left' | 'right' | 'up' | 'down'
export const DIRECTIONS: Direction[] = ['center', 'left', 'right', 'up', 'down']
export type RemoteProfile = Record<Direction, number[]>

export function medianFeatures(samples: number[][]): number[] {
  return [0, 1, 2, 3].map((i) => samples.map((s) => s[i]).sort((a, b) => a - b)[Math.floor(samples.length / 2)])
}

export function profileValid(p: RemoteProfile): boolean {
  return DIRECTIONS.every((d) => p[d]?.length === 4 && p[d].every(Number.isFinite)) &&
    DIRECTIONS.slice(1).every((d) => Math.hypot(...p[d].map((v, i) => v - p.center[i])) > 0.008)
}

export const MOVE_ENTER = 0.24
export const MOVE_ENTER_SETTLE = 0.32
export const SCREEN_SETTLE_MS = 1000

// Each extremity is its own calibrated template. Those axes are not orthogonal, so
// a look left can also score a bit on up. Once a direction is active, keep it while
// that look is still present so a noisy frame does not drop tracking.
export function directionSignal(
  p: RemoteProfile,
  f: number[],
  held: Direction = 'center',
  enter = MOVE_ENTER,
): { direction: Direction; strength: number } {
  if (f.length !== 4 || !f.every(Number.isFinite)) return { direction: 'center', strength: 0 }
  const scales = p.center.map((_, i) => Math.max(0.008,
    Math.max(...DIRECTIONS.map((d) => p[d][i])) - Math.min(...DIRECTIONS.map((d) => p[d][i]))))
  const delta = f.map((v, i) => (v - p.center[i]) / scales[i])
  const ranked = DIRECTIONS.slice(1).map((d) => {
    const axis = p[d].map((v, i) => (v - p.center[i]) / scales[i])
    const length = axis.reduce((s, v) => s + v * v, 0)
    const strength = delta.reduce((s, v, i) => s + v * axis[i], 0) / Math.max(length, 1e-6)
    const residual = Math.sqrt(delta.reduce((s, v, i) => s + (v - strength * axis[i]) ** 2, 0))
    return { d, strength, residual, score: strength - residual * 0.16 }
  }).sort((a, b) => b.score - a.score)
  const best = ranked[0]
  const runnerUp = ranked[1]
  const stay = Math.max(0.12, enter - 0.1)
  if (held !== 'center') {
    const current = ranked.find((r) => r.d === held)
    if (current && current.strength >= stay && current.strength <= 2.5) {
      if (best.d === held || best.strength < current.strength + 0.1) {
        return { direction: held, strength: Math.max(0, current.strength) }
      }
    }
  }
  // Diagonal/noisy samples can project equally well onto two calibrated axes.
  // Treat those as neutral instead of moving in an arbitrary direction.
  if (best.strength < enter || best.strength > 2.5 || best.score - runnerUp.score < 0.08) {
    return { direction: 'center', strength: Math.max(0, best.strength) }
  }
  return { direction: best.d, strength: Math.max(0, best.strength) }
}

export function classifyDirection(p: RemoteProfile, f: number[]): Direction {
  return directionSignal(p, f, 'center', 0.3).direction
}

// Where each calibration dot sits, as fractions of the viewport.
export const DIRECTION_TARGETS: Record<Direction, [number, number]> = {
  center: [0.5, 0.5],
  left: [0.08, 0.5],
  right: [0.92, 0.5],
  up: [0.5, 0.08],
  down: [0.5, 0.9],
}

export function profileUsable(p: RemoteProfile): boolean {
  return profileValid(p) && DIRECTIONS.every((d) => classifyDirection(p, p[d]) === d)
}

// Screen pointer from the same five templates. Eye features move roughly
// linearly with gaze, so fit the offset from the middle template as a mix of the
// left-to-right and top-to-bottom feature changes (2x2 least squares), which
// also cancels the vertical drift that horizontal looks carry and vice versa.
export function pointerFromProfile(p: RemoteProfile, f: number[]): [number, number] | null {
  if (f.length !== 4 || !f.every(Number.isFinite)) return null
  const T = DIRECTION_TARGETS
  const bx = p.right.map((v, i) => (v - p.left[i]) / (T.right[0] - T.left[0]))
  const by = p.down.map((v, i) => (v - p.up[i]) / (T.down[1] - T.up[1]))
  const delta = f.map((v, i) => v - p.center[i])
  const dot = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * b[i], 0)
  const xx = dot(bx, bx)
  const yy = dot(by, by)
  const xy = dot(bx, by)
  const det = xx * yy - xy * xy
  if (Math.abs(det) < 1e-12) return null
  const rx = dot(delta, bx)
  const ry = dot(delta, by)
  const sx = (rx * yy - ry * xy) / det
  const sy = (ry * xx - rx * xy) / det
  const clamp = (v: number) => Math.min(1, Math.max(0, v))
  return [clamp(T.center[0] + sx), clamp(T.center[1] + sy)]
}

export const MOVE_HOLD_MS = 420
export const MOVE_HOLD_SETTLE_MS = 620
export const MOVE_REPEAT_MS = 900

// Ignore one-frame flips so the overlay highlight and fill bar stay put.
export class DirectionHold {
  private held: Direction = 'center'
  private pending: Direction = 'center'
  private pendingAt = 0
  private returnMs: number
  private leaveCenterMs: number
  private changeMs: number
  constructor(returnMs = 200, leaveCenterMs = 80, changeMs = 70) {
    this.returnMs = returnMs
    this.leaveCenterMs = leaveCenterMs
    this.changeMs = changeMs
  }
  get value(): Direction { return this.held }
  reset(): void { this.held = 'center'; this.pending = 'center'; this.pendingAt = 0 }
  update(raw: Direction, now: number): Direction {
    if (raw === this.held) {
      this.pending = raw
      this.pendingAt = now
      return this.held
    }
    if (raw !== this.pending) {
      this.pending = raw
      this.pendingAt = now
      return this.held
    }
    const wait = raw === 'center' ? this.returnMs : this.held === 'center' ? this.leaveCenterMs : this.changeMs
    if (now - this.pendingAt >= wait) this.held = raw
    return this.held
  }
}

export class RemoteRepeater {
  private direction: Direction = 'center'
  private nextAt = 0
  private neutralAt: number | null = null
  private waitStartedAt = 0
  private initialMs: number
  private repeatMs: number
  constructor(initialMs = MOVE_HOLD_MS, repeatMs = MOVE_REPEAT_MS) { this.initialMs = initialMs; this.repeatMs = repeatMs }
  get repeating(): boolean { return this.direction !== 'center' && this.neutralAt === null && this.nextAt - this.waitStartedAt >= this.repeatMs - 1 }
  progress(now: number): number {
    if (this.direction === 'center' || this.neutralAt !== null) return 0
    return Math.min(1, Math.max(0, (now - this.waitStartedAt) / Math.max(1, this.nextAt - this.waitStartedAt)))
  }
  reset(): void { this.direction = 'center'; this.nextAt = 0; this.neutralAt = null; this.waitStartedAt = 0 }
  update(direction: Direction, now: number, holdMs = this.initialMs): Direction | null {
    if (direction === 'center') {
      this.neutralAt ??= now
      if (now - this.neutralAt >= 280) this.reset()
      return null
    }
    // Bridge a single uncertain frame, but restart the hold after a genuine
    // return to center so a series of short glances cannot trigger movement.
    if (this.neutralAt !== null && now - this.neutralAt >= 80) this.reset()
    this.neutralAt = null
    if (direction !== this.direction) {
      this.direction = direction
      this.waitStartedAt = now
      this.nextAt = now + holdMs
    }
    if (now < this.nextAt) return null
    this.waitStartedAt = now
    this.nextAt = now + this.repeatMs
    return direction
  }
}

export type RemoteItem = { id: string; x: number; y: number; width: number; height: number }
export function nextRemoteItem(items: RemoteItem[], current: string, direction: Direction): string {
  const from = items.find((i) => i.id === current)
  if (!from || direction === 'center') return current
  const horizontal = direction === 'left' || direction === 'right'
  const sign = direction === 'left' || direction === 'up' ? -1 : 1
  const candidates = items.map((item) => {
    const primary = (horizontal ? item.x - from.x : item.y - from.y) * sign
    const cross = Math.abs(horizontal ? item.y - from.y : item.x - from.x)
    const overlap = horizontal ? (from.height + item.height) / 2 : (from.width + item.width) / 2
    return { item, primary, sameRow: cross < overlap * 0.8, score: primary + cross * 2 + (cross > overlap * 0.8 ? 10000 : 0) }
  }).filter((c) => c.item.id !== current && c.primary > 8 && (!horizontal || c.sameRow))
  candidates.sort((a, b) => a.score - b.score)
  return candidates[0]?.item.id ?? current
}

export class RemoteBlink {
  private openAt = 0
  private closedAt: number | null = null
  private armed = false
  private selected = ''
  private peak = 0
  get holding(): boolean { return this.closedAt !== null }
  reset(): void { this.closedAt = null; this.armed = false; this.openAt = 0; this.selected = ''; this.peak = 0 }
  // faceLost: keep a close in progress when lids hide the landmarks.
  update(left: number, right: number, now: number, selected: string, faceLost = false): string | null {
    // Selection requires both eyes to close; using the weaker eye rejects winks.
    const score = Math.min(left, right)
    const closed = this.closedAt !== null
      ? faceLost || score > 0.32
      : !faceLost && score > 0.42
    const opened = !faceLost && score < 0.2

    if (opened) {
      if (this.closedAt !== null) {
        const duration = now - this.closedAt
        const hit = this.armed && this.peak >= 0.48 && duration >= 280 && duration <= 1100 && selected === this.selected
          ? selected
          : null
        this.closedAt = null
        this.peak = 0
        this.selected = ''
        this.openAt = now
        this.armed = true
        return hit
      }
      if (!this.openAt) this.openAt = now
      if (now - this.openAt >= 200) this.armed = true
      return null
    }

    if (closed) {
      if (this.closedAt === null) {
        this.closedAt = now
        this.selected = selected
        this.peak = score
      } else {
        this.peak = Math.max(this.peak, faceLost ? 0.7 : score)
      }
    }
    return null
  }
}
