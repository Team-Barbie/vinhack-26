import type { Point } from './types'

const STORAGE_KEY = 'gaze-shot-look-log-v4'
const MAX_LOGS = 48
const FEAT_NEAR = 0.018
const MAX_SHIFT = 0.08
const DISAGREE = 0.22

export type LookLog = {
  features: number[]
  predicted: Point
  actual: Point
  at: number
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

function gx(f: number[]): number {
  return (f[0] + f[2]) / 2
}

function gy(f: number[]): number {
  return (f[1] + f[3]) / 2
}

function featDist(a: number[], b: number[]): number {
  if (a.length < 4 || b.length < 4) return Infinity
  return Math.hypot(gx(a) - gx(b), gy(a) - gy(b))
}

function dump(logs: LookLog[], extra?: unknown): void {
  const summary = logs.map((l) => ({
    predicted: [round(l.predicted.x), round(l.predicted.y)],
    actual: [round(l.actual.x), round(l.actual.y)],
    residual: [round(l.actual.x - l.predicted.x), round(l.actual.y - l.predicted.y)],
  }))
  const payload = { at: Date.now(), count: logs.length, logs: summary, extra }
  console.warn('[gaze-log]', JSON.stringify(payload))
  void fetch('/__gaze-log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {
    /* dev server only */
  })
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000
}

export class LookLogger {
  private logs: LookLog[] = []

  constructor() {
    this.load()
  }

  count(): number {
    return this.logs.length
  }

  entries(): LookLog[] {
    return this.logs
  }

  clear(): void {
    this.logs = []
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
    dump(this.logs)
  }

  record(features: number[], predicted: Point, actual: Point): void {
    const dx = actual.x - predicted.x
    const dy = actual.y - predicted.y
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return
    if (Math.hypot(dx, dy) < 0.012) return
    this.logs.push({
      features: features.slice(),
      predicted: { ...predicted },
      actual: { ...actual },
      at: Date.now(),
    })
    if (this.logs.length > MAX_LOGS) this.logs.splice(0, this.logs.length - MAX_LOGS)
    this.save()
  }

  apply(features: number[] | null, predicted: Point): Point {
    if (!features || this.logs.length === 0) return predicted

    const nearby = this.logs.filter((log) => featDist(features, log.features) <= FEAT_NEAR)
    if (nearby.length === 0) return predicted

    const meanX = nearby.reduce((s, l) => s + l.actual.x, 0) / nearby.length
    const meanY = nearby.reduce((s, l) => s + l.actual.y, 0) / nearby.length
    const spread = Math.sqrt(
      nearby.reduce((s, l) => s + (l.actual.x - meanX) ** 2 + (l.actual.y - meanY) ** 2, 0) /
        nearby.length,
    )
    if (spread > DISAGREE) return predicted

    let wsum = 0
    let dx = 0
    let dy = 0
    for (const log of nearby) {
      const d = featDist(features, log.features)
      const w = 1 / (d * d + 1e-6)
      dx += w * (log.actual.x - log.predicted.x)
      dy += w * (log.actual.y - log.predicted.y)
      wsum += w
    }
    if (wsum <= 0) return predicted

    return {
      x: clamp01(predicted.x + clamp(dx / wsum, -MAX_SHIFT, MAX_SHIFT)),
      y: clamp01(predicted.y + clamp(dy / wsum, -MAX_SHIFT, MAX_SHIFT)),
    }
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.logs))
    } catch {
      /* quota */
    }
    dump(this.logs)
  }

  private load(): void {
    const extras: Record<string, number> = {}
    try {
      for (const key of ['gaze-shot-look-log-v2', 'gaze-shot-look-log-v3', STORAGE_KEY]) {
        const raw = localStorage.getItem(key)
        extras[key] = raw ? JSON.parse(raw).length : 0
      }
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as LookLog[]
        if (Array.isArray(parsed)) {
          this.logs = parsed
            .filter((l) => l && Array.isArray(l.features) && l.features.length >= 4 && l.predicted && l.actual)
            .slice(-MAX_LOGS)
        }
      }
    } catch {
      this.logs = []
    }
    dump(this.logs, extras)
  }
}
