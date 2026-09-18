import type { FireMode, Point, RoundResults } from './types'

export type Target = {
  id: number
  x: number
  y: number
  radius: number
  spawnedAt: number
  dwellMs: number
}

export type GameConfig = {
  durationMs: number
  targetCount: number
  radius: number
  fireMode: FireMode
  dwellMs: number
}

const DEFAULTS: GameConfig = {
  durationMs: 60_000,
  targetCount: 3,
  radius: 90,
  fireMode: 'blink',
  dwellMs: 600,
}

function randomIn(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

export class Game {
  targets: Target[] = []
  hits = 0
  misses = 0
  startedAt = 0
  ended = false
  lastShot: { point: Point; hit: boolean; at: number } | null = null
  config: GameConfig
  private nextId = 1
  private ttk: number[] = []
  private width = 1
  private height = 1
  private lastNow = 0

  constructor(config: Partial<GameConfig> = {}) {
    this.config = { ...DEFAULTS, ...config }
  }

  start(now: number, width: number, height: number): void {
    this.width = width
    this.height = height
    this.startedAt = now
    this.ended = false
    this.hits = 0
    this.misses = 0
    this.ttk = []
    this.targets = []
    this.lastShot = null
    this.nextId = 1
    this.lastNow = now
    for (let i = 0; i < this.config.targetCount; i++) this.spawn(now)
  }

  remainingMs(now: number): number {
    return Math.max(0, this.config.durationMs - (now - this.startedAt))
  }

  update(now: number, gaze: Point | null): void {
    if (this.ended) return
    if (this.remainingMs(now) <= 0) {
      this.ended = true
      return
    }

    const dt = this.lastNow ? Math.min(50, now - this.lastNow) : 16.7
    this.lastNow = now

    if (this.config.fireMode !== 'dwell' || !gaze) {
      for (const t of this.targets) t.dwellMs = 0
      return
    }

    for (const t of this.targets) {
      if (this.hitsTarget(t, gaze)) t.dwellMs += dt
      else t.dwellMs = 0
    }

    const charged = this.targets.find((t) => t.dwellMs >= this.config.dwellMs)
    if (charged) this.fire(gaze, now)
  }

  fire(point: Point, now: number): boolean {
    if (this.ended) return false
    const hit = this.targets.find((t) => this.hitsTarget(t, point))
    this.lastShot = { point, hit: Boolean(hit), at: now }
    if (hit) {
      this.hits += 1
      this.ttk.push(now - hit.spawnedAt)
      this.targets = this.targets.filter((t) => t.id !== hit.id)
      this.spawn(now)
      return true
    }
    this.misses += 1
    return false
  }

  nearestTarget(point: Point, maxDist: number): Target | null {
    let best: Target | null = null
    let bestD = maxDist
    for (const t of this.targets) {
      const d = Math.hypot(t.x - point.x, t.y - point.y)
      if (d < bestD) {
        best = t
        bestD = d
      }
    }
    return best
  }

  results(): RoundResults {
    const avgTtkMs =
      this.ttk.length === 0 ? 0 : this.ttk.reduce((a, b) => a + b, 0) / this.ttk.length
    const shots = this.hits + this.misses
    return {
      hits: this.hits,
      misses: this.misses,
      accuracy: shots === 0 ? 0 : this.hits / shots,
      avgTtkMs,
      durationMs: this.config.durationMs,
    }
  }

  playArea(): { x: number; y: number; w: number; h: number } {
    const mx = this.width * 0.07
    const my = this.height * 0.08
    return { x: mx, y: my, w: this.width - mx * 2, h: this.height - my * 2 }
  }

  private hitsTarget(target: Target, point: Point): boolean {
    return Math.hypot(point.x - target.x, point.y - target.y) <= target.radius
  }

  private spawn(now: number): void {
    const area = this.playArea()
    const r = this.config.radius
    let placed: Point | null = null
    for (let attempt = 0; attempt < 40; attempt++) {
      const candidate = {
        x: randomIn(area.x + r, area.x + area.w - r),
        y: randomIn(area.y + r, area.y + area.h - r),
      }
      const far = this.targets.every(
        (t) => Math.hypot(t.x - candidate.x, t.y - candidate.y) >= r * 2.3,
      )
      if (far) {
        placed = candidate
        break
      }
    }
    const pos = placed ?? {
      x: area.x + area.w / 2,
      y: area.y + area.h / 2,
    }
    this.targets.push({
      id: this.nextId++,
      x: pos.x,
      y: pos.y,
      radius: r,
      spawnedAt: now,
      dwellMs: 0,
    })
  }
}
