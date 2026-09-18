import type { Vec2 } from './eyeTracking'

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = values.slice().sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

class LowPassFilter {
  private y: number | null = null

  filter(value: number, alpha: number): number {
    if (this.y === null) {
      this.y = value
      return value
    }
    this.y = alpha * value + (1 - alpha) * this.y
    return this.y
  }

  reset(): void {
    this.y = null
  }
}

function smoothingFactor(dt: number, cutoff: number): number {
  const r = 2 * Math.PI * cutoff * dt
  return r / (r + 1)
}

class OneEuroFilter1D {
  private xFilter = new LowPassFilter()
  private dxFilter = new LowPassFilter()
  private lastTime: number | null = null
  private lastX: number | null = null
  private minCutoff: number
  private beta: number
  private dCutoff: number

  constructor(minCutoff: number, beta: number, dCutoff: number) {
    this.minCutoff = minCutoff
    this.beta = beta
    this.dCutoff = dCutoff
  }

  setMinCutoff(value: number): void {
    this.minCutoff = value
  }

  setBeta(value: number): void {
    this.beta = value
  }

  filter(x: number, timestamp: number): number {
    if (this.lastTime === null || this.lastX === null) {
      this.lastTime = timestamp
      this.lastX = x
      this.xFilter.filter(x, 1)
      this.dxFilter.filter(0, 1)
      return x
    }
    const dt = Math.max((timestamp - this.lastTime) / 1000, 1e-4)
    this.lastTime = timestamp
    const dx = (x - this.lastX) / dt
    this.lastX = x
    const edx = this.dxFilter.filter(dx, smoothingFactor(dt, this.dCutoff))
    const cutoff = this.minCutoff + this.beta * Math.abs(edx)
    return this.xFilter.filter(x, smoothingFactor(dt, cutoff))
  }

  reset(): void {
    this.xFilter.reset()
    this.dxFilter.reset()
    this.lastTime = null
    this.lastX = null
  }
}

class GazeSmoother {
  private x: OneEuroFilter1D
  private y: OneEuroFilter1D
  private window: Vec2[] = []
  private last: Vec2 | null = null
  private lastAt = -Infinity

  constructor() {
    this.x = new OneEuroFilter1D(0.16, 0.04, 1)
    this.y = new OneEuroFilter1D(0.12, 0.03, 1)
  }

  update(raw: Vec2 | null, timestamp: number, hold: boolean, saccade = false): Vec2 | null {
    if (hold || !raw) return this.last
    if (!Number.isFinite(raw[0]) || !Number.isFinite(raw[1]) || timestamp <= this.lastAt) return this.last
    if (timestamp - this.lastAt > 280) this.reset()
    this.lastAt = timestamp

    this.x.setMinCutoff(saccade ? 1.1 : 0.14)
    this.y.setMinCutoff(saccade ? 0.9 : 0.1)
    this.x.setBeta(saccade ? 0.28 : 0.03)
    this.y.setBeta(saccade ? 0.22 : 0.02)

    this.window.push(raw)
    if (this.window.length > (saccade ? 3 : 8)) this.window.shift()
    const med: Vec2 = [median(this.window.map((p) => p[0])), median(this.window.map((p) => p[1]))]
    let next: Vec2 = [this.x.filter(med[0], timestamp), this.y.filter(med[1], timestamp)]
    if (this.last) {
      const jump = Math.hypot(med[0] - this.last[0], med[1] - this.last[1])
      if (saccade && jump > 0.16) {
        const t = Math.min(1, (jump - 0.16) / 0.22)
        next = [
          next[0] + (med[0] - next[0]) * (0.18 + 0.28 * t),
          next[1] + (med[1] - next[1]) * (0.18 + 0.28 * t),
        ]
      } else if (!saccade && jump < 0.01) {
        next = this.last
      } else if (!saccade && jump < 0.02) {
        next = [this.last[0] + (next[0] - this.last[0]) * 0.22, this.last[1] + (next[1] - this.last[1]) * 0.22]
      }
    }
    this.last = next
    return this.last
  }

  reset(): void {
    this.x.reset()
    this.y.reset()
    this.window = []
    this.last = null
    this.lastAt = -Infinity
  }
}

export class GazeFilter {
  private smoother = new GazeSmoother()
  private lastGood: Vec2 | null = null
  private lastRawAt = -Infinity
  private lostSince: number | null = null
  private blinkUntil = -Infinity

  reset(): void {
    this.smoother.reset()
    this.lastGood = null
    this.lastRawAt = -Infinity
    this.lostSince = null
    this.blinkUntil = -Infinity
  }

  update(
    raw: Vec2 | null,
    timestamp: number,
    opts: { quality: number; blinking: boolean; faceFound: boolean },
  ): Vec2 | null {
    if (!opts.faceFound) {
      if (this.lostSince === null) this.lostSince = timestamp
      if (timestamp - this.lostSince > 500) {
        this.smoother.reset()
        this.lastGood = null
        return null
      }
      return this.lastGood
    }

    if (opts.blinking) {
      this.blinkUntil = timestamp + 220
      this.lostSince = null
      return this.lastGood
    }

    if (!raw) {
      if (timestamp - this.lastRawAt > 220) return this.lastGood
      return this.lastGood
    }

    if (timestamp < this.blinkUntil && this.lastGood) return this.lastGood

    this.lostSince = null
    const jump = this.lastGood ? Math.hypot(raw[0] - this.lastGood[0], raw[1] - this.lastGood[1]) : 0
    const saccadeCut = opts.quality < 0.55 ? 0.2 : 0.17
    const next = this.smoother.update(raw, timestamp, false, jump > saccadeCut)
    this.lastGood = next
    this.lastRawAt = timestamp
    return next
  }
}
