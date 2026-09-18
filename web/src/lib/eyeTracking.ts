import type { FaceLandmarkerResult, NormalizedLandmark } from '@mediapipe/tasks-vision'

export type Vec2 = [number, number]

export const CALIBRATION_TARGETS: Vec2[] = [
  [0.08, 0.1],
  [0.5, 0.1],
  [0.92, 0.1],
  [0.08, 0.38],
  [0.5, 0.38],
  [0.92, 0.38],
  [0.08, 0.66],
  [0.5, 0.66],
  [0.92, 0.66],
  [0.08, 0.9],
  [0.5, 0.9],
  [0.92, 0.9],
]

const LEFT_EYE = {
  outer: 263,
  inner: 362,
  upper: 386,
  lower: 374,
  iris: [473, 474, 475, 476, 477],
  blinkBlendshape: 'eyeBlinkLeft',
}

const RIGHT_EYE = {
  outer: 33,
  inner: 133,
  upper: 159,
  lower: 145,
  iris: [468, 469, 470, 471, 472],
  blinkBlendshape: 'eyeBlinkRight',
}

const EPS = 1e-6
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const clampShift = (v: number) => Math.min(0.05, Math.max(-0.05, v))

function lmPx(landmarks: NormalizedLandmark[], index: number, vw: number, vh: number): Vec2 {
  const p = landmarks[index]
  return [p.x * vw, p.y * vh]
}

function avgIris(landmarks: NormalizedLandmark[], idxs: number[], vw: number, vh: number): Vec2 {
  let x = 0
  let y = 0
  let n = 0
  for (const i of idxs) {
    const p = landmarks[i]
    if (!p) continue
    x += p.x * vw
    y += p.y * vh
    n += 1
  }
  return [x / (n || 1), y / (n || 1)]
}

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1])
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const s = values.slice().sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

// Canthi stay put when you look up/down. Eyelids do not, so using them as the
// Y origin/scale cancels vertical gaze.
function irisInEye(landmarks: NormalizedLandmark[], spec: typeof LEFT_EYE, vw: number, vh: number): Vec2 {
  const iris = avgIris(landmarks, spec.iris, vw, vh)
  const inner = lmPx(landmarks, spec.inner, vw, vh)
  const outer = lmPx(landmarks, spec.outer, vw, vh)
  const origin: Vec2 = [(inner[0] + outer[0]) / 2, (inner[1] + outer[1]) / 2]
  let axisX: Vec2 = [inner[0] - outer[0], inner[1] - outer[1]]
  const eyeW = Math.hypot(axisX[0], axisX[1]) || 1
  axisX = [axisX[0] / eyeW, axisX[1] / eyeW]
  if (axisX[0] < 0) axisX = [-axisX[0], -axisX[1]]
  let axisY: Vec2 = [-axisX[1], axisX[0]]
  if (axisY[1] < 0) axisY = [-axisY[0], -axisY[1]]
  const v: Vec2 = [iris[0] - origin[0], iris[1] - origin[1]]
  return [
    (v[0] * axisX[0] + v[1] * axisX[1]) / eyeW,
    (v[0] * axisY[0] + v[1] * axisY[1]) / eyeW,
  ]
}

function earOf(landmarks: NormalizedLandmark[], spec: typeof LEFT_EYE, vw: number, vh: number): number {
  const upper = lmPx(landmarks, spec.upper, vw, vh)
  const lower = lmPx(landmarks, spec.lower, vw, vh)
  const inner = lmPx(landmarks, spec.inner, vw, vh)
  const outer = lmPx(landmarks, spec.outer, vw, vh)
  return dist(upper, lower) / (dist(inner, outer) || 1e-6)
}

function earToBlink(ear: number): number {
  const open = 0.28
  const closed = 0.12
  return Math.min(1, Math.max(0, (open - ear) / (open - closed)))
}

// Blendshapes are the blink signal. EAR only helps once a close is already
// underway — taking max(blend, EAR) marks naturally narrow open eyes as shut.
function lidScore(blend: number, earBlink: number): number {
  if (blend < 0.04 && earBlink > 0.55) return earBlink
  if (blend >= 0.2) return Math.max(blend, blend * 0.7 + earBlink * 0.3)
  return blend
}

function blendScore(blends: Map<string, number>, name: string): number {
  return blends.get(name) ?? 0
}

export interface GazeFrame {
  faceFound: boolean
  gaze: Vec2 | null
  features: number[] | null
  bothClosed: boolean
  eyesOpen: boolean
  blinkL: number
  blinkR: number
  quality: number
}

export class GazeTracker {
  update(result: FaceLandmarkerResult | null, faceIndex = 0, vw = 1280, vh = 720): GazeFrame {
    const landmarks = result?.faceLandmarks?.[faceIndex]
    if (!result || !landmarks || landmarks.length < 478) {
      return {
        faceFound: false,
        gaze: null,
        features: null,
        bothClosed: false,
        eyesOpen: false,
        blinkL: 0,
        blinkR: 0,
        quality: 0,
      }
    }

    const blends = new Map<string, number>()
    for (const c of result.faceBlendshapes?.[faceIndex]?.categories ?? []) blends.set(c.categoryName, c.score)

    const left = irisInEye(landmarks, LEFT_EYE, vw, vh)
    const right = irisInEye(landmarks, RIGHT_EYE, vw, vh)
    const features = [left[0], left[1], right[0], right[1]]
    if (!features.every(Number.isFinite)) {
      return {
        faceFound: false,
        gaze: null,
        features: null,
        bothClosed: false,
        eyesOpen: false,
        blinkL: 0,
        blinkR: 0,
        quality: 0,
      }
    }

    const earL = earToBlink(earOf(landmarks, LEFT_EYE, vw, vh))
    const earR = earToBlink(earOf(landmarks, RIGHT_EYE, vw, vh))
    const blinkL = lidScore(blendScore(blends, LEFT_EYE.blinkBlendshape), earL)
    const blinkR = lidScore(blendScore(blends, RIGHT_EYE.blinkBlendshape), earR)
    const lid = Math.max(blinkL, blinkR)
    const bothClosed = lid >= 0.4
    const eyesOpen = lid < 0.22

    return {
      faceFound: true,
      gaze: [(left[0] + right[0]) / 2, (left[1] + right[1]) / 2],
      features,
      bothClosed,
      eyesOpen,
      blinkL,
      blinkR,
      quality: Math.max(0.25, 1 - Math.min(1, lid)),
    }
  }
}

export interface CalibrationSample {
  features: number[]
  target: Vec2
}

type Knot = { f: number; t: number }
type Local = { gx: number; gy: number; dx: number; dy: number }

export interface CalibrationModel {
  version: 3
  wx: number[]
  yKnots: Knot[]
  locals: Local[]
  means: number[]
  stds: number[]
  error: number
}

function gyOf(features: number[]): number {
  return (features[1] + features[3]) / 2
}

function gxOf(features: number[]): number {
  return (features[0] + features[2]) / 2
}

function zscore(features: number[], means: number[], stds: number[]): number[] {
  return features.map((v, i) => (v - means[i]) / stds[i])
}

function designX(features: number[], means: number[], stds: number[]): number[] {
  const z = zscore(features, means, stds)
  const gx = (z[0] + z[2]) / 2
  return [1, gx, z[0], z[2]]
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
    ;[M[i], M[maxRow]] = [M[maxRow], M[i]]
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
  if (weights.some((w) => !Number.isFinite(w))) throw new Error('Could not fit gaze model')
  return weights
}

const dot = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * b[i], 0)

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

function clusterSamples(samples: CalibrationSample[]): CalibrationSample[] {
  const groups = new Map<string, CalibrationSample[]>()
  for (const s of samples) {
    const key = `${s.target[0].toFixed(3)},${s.target[1].toFixed(3)}`
    const list = groups.get(key)
    if (list) list.push(s)
    else groups.set(key, [s])
  }
  const clusters: CalibrationSample[] = []
  for (const group of groups.values()) {
    const dim = group[0].features.length
    const features = Array(dim).fill(0)
    for (let i = 0; i < dim; i++) features[i] = median(group.map((g) => g.features[i]))
    clusters.push({ features, target: group[0].target })
  }
  return clusters
}

function verticalKnots(clusters: CalibrationSample[]): Knot[] {
  const groups = new Map<number, number[]>()
  for (const c of clusters) {
    const y = Math.round(c.target[1] * 1000) / 1000
    const list = groups.get(y)
    if (list) list.push(gyOf(c.features))
    else groups.set(y, [gyOf(c.features)])
  }
  const knots: Knot[] = []
  for (const [t, values] of groups) knots.push({ f: median(values), t })
  knots.sort((a, b) => a.f - b.f)
  return knots
}

function monotonic(knots: Knot[]): boolean {
  let up = 0
  let down = 0
  for (let i = 1; i < knots.length; i++) {
    if (knots[i].t > knots[i - 1].t) up += 1
    if (knots[i].t < knots[i - 1].t) down += 1
  }
  return up === 0 || down === 0
}

function linearY(clusters: CalibrationSample[]): Knot[] {
  const xs = clusters.map((c) => gyOf(c.features))
  const ys = clusters.map((c) => c.target[1])
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

function predictBase(model: Pick<CalibrationModel, 'wx' | 'yKnots' | 'means' | 'stds'>, features: number[]): Vec2 {
  return [
    clamp01(dot(model.wx, designX(features, model.means, model.stds))),
    clamp01(interp1d(model.yKnots, gyOf(features))),
  ]
}

export function fitCalibration(samples: CalibrationSample[]): CalibrationModel | null {
  if (samples.length < 12) return null
  const clusters = clusterSamples(samples)
  if (clusters.length < 6) return null
  if (clusters.some((c) => c.features.length !== 4 || !c.features.every(Number.isFinite))) return null

  const dim = 4
  const means = Array(dim).fill(0)
  for (const c of clusters) {
    for (let i = 0; i < dim; i++) means[i] += c.features[i]
  }
  for (let i = 0; i < dim; i++) means[i] /= clusters.length

  const stds = Array(dim).fill(1)
  for (let i = 0; i < dim; i++) {
    const variance =
      clusters.reduce((a, c) => {
        const d = c.features[i] - means[i]
        return a + d * d
      }, 0) / clusters.length
    stds[i] = Math.max(Math.sqrt(variance), 1e-4)
  }

  const gx = clusters.map((c) => gxOf(c.features))
  const gy = clusters.map((c) => gyOf(c.features))
  if (Math.max(...gx) - Math.min(...gx) < 0.008) return null
  if (Math.max(...gy) - Math.min(...gy) < 0.004) return null

  let wx: number[]
  try {
    wx = ridgeFit(
      clusters.map((c) => designX(c.features, means, stds)),
      clusters.map((c) => c.target[0]),
      0.12,
    )
  } catch {
    return null
  }
  if (wx.some((w) => !Number.isFinite(w))) return null

  let yKnots = verticalKnots(clusters)
  if (yKnots.length < 2 || !monotonic(yKnots)) yKnots = linearY(clusters)

  const locals = clusters.map((c) => {
    const pred = predictBase({ wx, yKnots, means, stds }, c.features)
    return {
      gx: gxOf(c.features),
      gy: gyOf(c.features),
      dx: c.target[0] - pred[0],
      dy: c.target[1] - pred[1],
    }
  })

  const error =
    clusters.reduce((sum, s) => {
      const [x, y] = predictBase({ wx, yKnots, means, stds }, s.features)
      return sum + Math.hypot(x - s.target[0], y - s.target[1])
    }, 0) / clusters.length

  return { version: 3, wx, yKnots, locals, means, stds, error }
}

export function mapGaze(model: CalibrationModel, features: number[]): Vec2 {
  if (
    model.version !== 3 ||
    !model.wx?.length ||
    !model.yKnots?.length ||
    !model.means?.length ||
    features.length !== model.means.length ||
    !features.every(Number.isFinite)
  ) {
    return [0.5, 0.5]
  }
  const base = predictBase(model, features)
  const locals = model.locals ?? []
  if (locals.length < 4) return base
  const qgx = gxOf(features)
  const qgy = gyOf(features)
  const ranked = locals
    .map((k) => ({ k, d: Math.hypot(qgx - k.gx, qgy - k.gy) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 4)
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
  const mix = 0.82 / (1 + (ranked[0].d / bandwidth) ** 2)
  return [
    clamp01(base[0] + mix * clampShift(dx / wsum)),
    clamp01(base[1] + mix * clampShift(dy / wsum)),
  ]
}
