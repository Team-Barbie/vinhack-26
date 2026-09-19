import type { Point } from './types'

export type GazeEstimator = {
  addSample(features: number[], screenXY: Point, singleton?: boolean): void
  fit(): void
  predict(features: number[]): Point | null
  isReady(): boolean
  sampleCount(): number
  toJSON(): string
}

type Sample = { features: number[]; target: Point; singleton?: boolean }
type Cluster = { features: number[]; target: Point }

type SerializedEstimator = {
  version: 7
  samples: Sample[]
}

type Knot = { f: number; t: number }
type LocalKnot = { gx: number; gy: number; dx: number; dy: number }

const EPS = 1e-6

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}

function clampShift(v: number): number {
  return Math.min(0.05, Math.max(-0.05, v))
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = values.slice().sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = b.length
  const M = A.map((row, i) => {
    const copy = row.slice()
    copy.push(b[i])
    return copy
  })

  for (let i = 0; i < n; i++) {
    let maxRow = i
    for (let r = i + 1; r < n; r++) {
      if (Math.abs(M[r][i]) > Math.abs(M[maxRow][i])) maxRow = r
    }
    const swap = M[i]
    M[i] = M[maxRow]
    M[maxRow] = swap
    const pivot = M[i][i]
    if (Math.abs(pivot) < 1e-12) continue
    const inv = 1 / pivot
    for (let j = i; j <= n; j++) M[i][j] *= inv
    for (let r = 0; r < n; r++) {
      if (r === i) continue
      const factor = M[r][i]
      if (factor === 0) continue
      for (let j = i; j <= n; j++) M[r][j] -= factor * M[i][j]
    }
  }
  return M.map((row) => row[n])
}

function ridgeFit(X: number[][], y: number[], lambda: number): number[] {
  const m = X.length
  const p = X[0].length
  const XtX: number[][] = Array.from({ length: p }, () => Array(p).fill(0))
  const Xty = Array(p).fill(0)
  for (let i = 0; i < m; i++) {
    const row = X[i]
    const yi = y[i]
    for (let a = 0; a < p; a++) {
      Xty[a] += row[a] * yi
      const ra = row[a]
      const dest = XtX[a]
      for (let b = a; b < p; b++) dest[b] += ra * row[b]
    }
  }
  for (let a = 0; a < p; a++) {
    for (let b = 0; b < a; b++) XtX[a][b] = XtX[b][a]
    XtX[a][a] += a === 0 ? EPS : lambda
  }
  const weights = solveLinearSystem(XtX, Xty)
  if (weights.some((w) => !Number.isFinite(w))) {
    throw new Error('Could not fit gaze model')
  }
  return weights
}

function dot(a: number[], b: number[]): number {
  let s = 0
  for (let i = 0; i < a.length && i < b.length; i++) s += a[i] * b[i]
  return s
}

function clusterSamples(samples: Sample[]): Cluster[] {
  const groups = new Map<string, Sample[]>()
  const extra: Cluster[] = []
  for (const s of samples) {
    if (s.singleton) {
      extra.push({ features: s.features.slice(), target: s.target })
      continue
    }
    const key = `${s.target.x.toFixed(3)},${s.target.y.toFixed(3)}`
    const list = groups.get(key)
    if (list) list.push(s)
    else groups.set(key, [s])
  }
  const clusters: Cluster[] = [...extra]
  for (const group of groups.values()) {
    const dim = group[0].features.length
    const features = Array(dim).fill(0)
    for (let i = 0; i < dim; i++) features[i] = median(group.map((g) => g.features[i]))
    clusters.push({ features, target: group[0].target })
  }
  return clusters
}

function zscore(features: number[], means: number[], stds: number[]): number[] {
  return features.map((v, i) => (v - means[i]) / stds[i])
}

function designX(features: number[], means: number[], stds: number[]): number[] {
  const z = zscore(features, means, stds)
  const gx = (z[0] + z[2]) / 2
  return [1, gx, z[0], z[2]]
}

function gyOf(features: number[]): number {
  return (features[1] + features[3]) / 2
}

function interp1d(knots: Knot[], q: number): number {
  if (knots.length === 0) return 0.5
  if (knots.length === 1) return knots[0].t
  const xs = knots.map((k) => k.f)
  const ys = knots.map((k) => k.t)
  const last = xs.length - 1
  const lerp = (i: number, x: number) => {
    const dx = xs[i + 1] - xs[i]
    if (Math.abs(dx) < 1e-12) return ys[i]
    return ys[i] + ((x - xs[i]) / dx) * (ys[i + 1] - ys[i])
  }
  if (q <= xs[0]) return lerp(0, q)
  if (q >= xs[last]) return lerp(last - 1, q)
  for (let i = 0; i < last; i++) {
    if (q <= xs[i + 1]) return lerp(i, q)
  }
  return ys[last]
}

function verticalKnots(clusters: Cluster[]): Knot[] {
  const groups = new Map<number, number[]>()
  for (const c of clusters) {
    const y = Math.round(c.target.y * 1000) / 1000
    const list = groups.get(y)
    const gy = gyOf(c.features)
    if (list) list.push(gy)
    else groups.set(y, [gy])
  }
  const knots: Knot[] = []
  for (const [t, values] of groups) {
    knots.push({ f: median(values), t })
  }
  knots.sort((a, b) => a.f - b.f)
  return knots
}

function monotonicTargets(knots: Knot[]): boolean {
  let up = 0
  let down = 0
  for (let i = 1; i < knots.length; i++) {
    if (knots[i].t > knots[i - 1].t) up += 1
    if (knots[i].t < knots[i - 1].t) down += 1
  }
  return up === 0 || down === 0
}

function linearYKnots(clusters: Cluster[]): Knot[] {
  const xs = clusters.map((c) => gyOf(c.features))
  const ys = clusters.map((c) => c.target.y)
  const n = xs.length
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my)
    den += (xs[i] - mx) * (xs[i] - mx)
  }
  const b = den < 1e-12 ? 0 : num / den
  const a = my - b * mx
  const lo = Math.min(...xs)
  const hi = Math.max(...xs)
  return [
    { f: lo, t: a + b * lo },
    { f: hi, t: a + b * hi },
  ]
}

export class RidgeGazeEstimator implements GazeEstimator {
  private samples: Sample[] = []
  private weightsX: number[] | null = null
  private yKnots: Knot[] = []
  private locals: LocalKnot[] = []
  private means: number[] = []
  private stds: number[] = []
  private ready = false

  addSample(features: number[], screenXY: Point, singleton = false): void {
    this.samples.push({
      features: features.slice(),
      target: { x: screenXY.x, y: screenXY.y },
      singleton,
    })
    this.ready = false
  }

  sampleCount(): number {
    return this.samples.length
  }

  isReady(): boolean {
    return this.ready
  }

  fit(): void {
    if (this.samples.length < 12) {
      throw new Error('Need more calibration samples')
    }
    const clusters = clusterSamples(this.samples)
    if (clusters.length < 6) {
      throw new Error('Calibration did not cover enough screen positions')
    }

    const dim = clusters[0].features.length
    this.means = Array(dim).fill(0)
    for (const c of clusters) {
      for (let i = 0; i < dim; i++) this.means[i] += c.features[i]
    }
    for (let i = 0; i < dim; i++) this.means[i] /= clusters.length

    this.stds = Array(dim).fill(1)
    for (let i = 0; i < dim; i++) {
      const variance = clusters.reduce((a, c) => {
        const d = c.features[i] - this.means[i]
        return a + d * d
      }, 0) / clusters.length
      this.stds[i] = Math.max(Math.sqrt(variance), 1e-4)
    }

    const gx = clusters.map((c) => (c.features[0] + c.features[2]) / 2)
    const gy = clusters.map((c) => gyOf(c.features))
    const rangeX = Math.max(...gx) - Math.min(...gx)
    const rangeY = Math.max(...gy) - Math.min(...gy)
    if (rangeX < 0.008) {
      throw new Error(
        'The tracker could not see your eyes move left/right. Sit closer, add light on your face, and look with your eyes — keep your head still.',
      )
    }
    if (rangeY < 0.004) {
      throw new Error(
        'The tracker could not see you look up and down. Keep your head still and move only your eyes to the top and bottom dots.',
      )
    }

    const X = clusters.map((c) => designX(c.features, this.means, this.stds))
    const yx = clusters.map((c) => c.target.x)
    this.weightsX = ridgeFit(X, yx, 0.12)
    this.yKnots = verticalKnots(clusters)
    if (this.yKnots.length < 2) {
      throw new Error('Need a fresh calibration with top and bottom dots')
    }
    if (!monotonicTargets(this.yKnots)) {
      this.yKnots = linearYKnots(clusters)
    }
    this.locals = clusters.map((c) => {
      const pred = {
        x: clamp01(dot(this.weightsX!, designX(c.features, this.means, this.stds))),
        y: clamp01(interp1d(this.yKnots, gyOf(c.features))),
      }
      return {
        gx: (c.features[0] + c.features[2]) / 2,
        gy: gyOf(c.features),
        dx: c.target.x - pred.x,
        dy: c.target.y - pred.y,
      }
    })
    this.ready = true
  }

  predict(features: number[]): Point | null {
    if (!this.ready || !this.weightsX || this.yKnots.length < 2) return null
    if (features.length !== this.means.length || !features.every(Number.isFinite)) return null
    const base = {
      x: clamp01(dot(this.weightsX, designX(features, this.means, this.stds))),
      y: clamp01(interp1d(this.yKnots, gyOf(features))),
    }
    return this.applyLocal(features, base)
  }

  private applyLocal(features: number[], base: Point): Point {
    if (this.locals.length < 4) return base
    const qgx = (features[0] + features[2]) / 2
    const qgy = gyOf(features)
    const ranked = this.locals
      .map((k) => ({ k, d: Math.hypot(qgx - k.gx, qgy - k.gy) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 4)
    const dmin = ranked[0].d
    const bandwidth = 0.016
    let wsum = 0
    let dx = 0
    let dy = 0
    for (const { k, d } of ranked) {
      const w = Math.exp(-(d * d) / (2 * bandwidth * bandwidth)) / (d * d + 1e-8)
      dx += w * k.dx
      dy += w * k.dy
      wsum += w
    }
    if (wsum <= 0) return base
    const mix = 0.82 / (1 + (dmin / bandwidth) ** 2)
    return {
      x: clamp01(base.x + mix * clampShift(dx / wsum)),
      y: clamp01(base.y + mix * clampShift(dy / wsum)),
    }
  }

  toJSON(): string {
    const payload: SerializedEstimator = { version: 7, samples: this.samples }
    return JSON.stringify(payload)
  }

  static fromJSON(raw: string): RidgeGazeEstimator {
    const data = JSON.parse(raw) as SerializedEstimator
    if (data.version !== 7 || !Array.isArray(data.samples) || data.samples.length < 12 ||
        data.samples.some((s) => !Array.isArray(s.features) || s.features.length !== 4 ||
          !s.features.every(Number.isFinite) || !s.target ||
          !Number.isFinite(s.target.x) || !Number.isFinite(s.target.y))) {
      throw new Error('Need a fresh calibration')
    }
    const est = new RidgeGazeEstimator()
    est.samples = data.samples
    est.fit()
    return est
  }
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

export class GazeSmoother {
  private x: OneEuroFilter1D
  private y: OneEuroFilter1D
  private window: Point[] = []
  private last: Point | null = null
  private lastAt = -Infinity

  constructor() {
    this.x = new OneEuroFilter1D(0.16, 0.04, 1)
    this.y = new OneEuroFilter1D(0.12, 0.03, 1)
  }

  setPlayMode(_on: boolean): void {
    /* mode is chosen per-sample from saccade vs fixation */
  }

  update(raw: Point | null, timestamp: number, hold: boolean, saccade = false): Point | null {
    if (hold || !raw) return this.last
    if (!Number.isFinite(raw.x) || !Number.isFinite(raw.y) || timestamp <= this.lastAt) return this.last
    if (timestamp - this.lastAt > 280) this.reset()
    this.lastAt = timestamp

    // A large raw displacement is a saccade even when the caller has not yet
    // classified it. Drop the fixation window so it does not delay the jump.
    if (!saccade && this.last && Math.hypot(raw.x - this.last.x, raw.y - this.last.y) > 0.12) {
      saccade = true
      this.window = []
      this.x.reset()
      this.y.reset()
    }

    this.x.setMinCutoff(saccade ? 1.1 : 0.14)
    this.y.setMinCutoff(saccade ? 0.9 : 0.1)
    this.x.setBeta(saccade ? 0.28 : 0.03)
    this.y.setBeta(saccade ? 0.22 : 0.02)

    if (saccade) {
      this.window.push(raw)
      if (this.window.length > 3) this.window.shift()
    } else {
      this.window.push(raw)
      if (this.window.length > 8) this.window.shift()
    }
    const med = {
      x: median(this.window.map((p) => p.x)),
      y: median(this.window.map((p) => p.y)),
    }
    let next = {
      x: this.x.filter(med.x, timestamp),
      y: this.y.filter(med.y, timestamp),
    }
    if (this.last) {
      const jump = Math.hypot(med.x - this.last.x, med.y - this.last.y)
      if (saccade && jump > 0.16) {
        const t = Math.min(1, (jump - 0.16) / 0.22)
        next = {
          x: next.x + (med.x - next.x) * (0.18 + 0.28 * t),
          y: next.y + (med.y - next.y) * (0.18 + 0.28 * t),
        }
      } else if (!saccade && jump < 0.01) {
        next = this.last
      } else if (!saccade && jump < 0.02) {
        next = {
          x: this.last.x + (next.x - this.last.x) * 0.22,
          y: this.last.y + (next.y - this.last.y) * 0.22,
        }
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
