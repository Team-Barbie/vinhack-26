import type { FaceLandmarkerResult, NormalizedLandmark } from '@mediapipe/tasks-vision'

// Browser port of eye_tracking/tracker.py + constants.py — keep the two in sync.

export type Vec2 = [number, number]

export const CALIBRATION_TARGETS: Vec2[] = [
  [0.12, 0.12],
  [0.5, 0.12],
  [0.88, 0.12],
  [0.12, 0.5],
  [0.5, 0.5],
  [0.88, 0.5],
  [0.12, 0.88],
  [0.5, 0.88],
  [0.88, 0.88],
]

const BLINK_ON = 0.45
const BLINK_OFF = 0.28
const EAR_CLOSED = 0.18
const EAR_OPEN = 0.22

interface EyeSpec {
  outer: number
  inner: number
  upper: number
  lower: number
  irisCenter: number
  irisRing: number[]
  earVertical: [number, number][]
  earHorizontal: [number, number]
  blinkBlendshape: string
}

const LEFT_EYE: EyeSpec = {
  outer: 263,
  inner: 362,
  upper: 386,
  lower: 374,
  irisCenter: 473,
  irisRing: [474, 475, 476, 477],
  earVertical: [
    [386, 374],
    [385, 380],
  ],
  earHorizontal: [263, 362],
  blinkBlendshape: 'eyeBlinkLeft',
}

const RIGHT_EYE: EyeSpec = {
  outer: 33,
  inner: 133,
  upper: 159,
  lower: 145,
  irisCenter: 468,
  irisRing: [469, 470, 471, 472],
  earVertical: [
    [159, 145],
    [158, 153],
  ],
  earHorizontal: [33, 133],
  blinkBlendshape: 'eyeBlinkRight',
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

// The Python tracker runs on a selfie-mirrored frame; mirroring x here keeps
// the iris and blendshape gaze terms agreeing in sign exactly as they do there.
function pt(landmarks: NormalizedLandmark[], index: number): Vec2 {
  const lm = landmarks[index]
  return [1 - lm.x, lm.y]
}

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1])
}

interface EyeSample {
  gaze: Vec2
  ear: number
  blink: number
  closed: boolean
}

function sampleEye(landmarks: NormalizedLandmark[], blends: Map<string, number>, spec: EyeSpec): EyeSample {
  const iris = pt(landmarks, spec.irisCenter)
  const inner = pt(landmarks, spec.inner)
  const outer = pt(landmarks, spec.outer)
  const upper = pt(landmarks, spec.upper)
  const lower = pt(landmarks, spec.lower)

  const leftX = Math.min(inner[0], outer[0])
  const rightX = Math.max(inner[0], outer[0])
  const topY = Math.min(upper[1], lower[1])
  const botY = Math.max(upper[1], lower[1])
  const gx = clamp01((iris[0] - leftX) / (rightX - leftX + 1e-6))
  const gy = clamp01((iris[1] - topY) / (botY - topY + 1e-6))

  const vertical = spec.earVertical.reduce(
    (sum, [a, b]) => sum + dist(pt(landmarks, a), pt(landmarks, b)),
    0,
  )
  const horizontal = dist(pt(landmarks, spec.earHorizontal[0]), pt(landmarks, spec.earHorizontal[1]))
  const ear = horizontal < 1e-6 ? 0 : vertical / (2 * horizontal)
  const blink = blends.get(spec.blinkBlendshape) ?? 0

  return { gaze: [gx, gy], ear, blink, closed: blink >= BLINK_ON || ear <= EAR_CLOSED }
}

function blendshapeGaze(blends: Map<string, number>): Vec2 {
  const b = (name: string) => blends.get(name) ?? 0
  const lookLeft = (b('eyeLookInLeft') + b('eyeLookOutRight')) / 2
  const lookRight = (b('eyeLookOutLeft') + b('eyeLookInRight')) / 2
  const lookUp = (b('eyeLookUpLeft') + b('eyeLookUpRight')) / 2
  const lookDown = (b('eyeLookDownLeft') + b('eyeLookDownRight')) / 2
  return [clamp01(0.5 + 0.55 * (lookRight - lookLeft)), clamp01(0.5 + 0.55 * (lookDown - lookUp))]
}

export interface GazeFrame {
  faceFound: boolean
  gaze: Vec2 | null
  bothClosed: boolean
  eyesOpen: boolean
}

export class GazeTracker {
  private ema: Vec2 | null = null

  reset() {
    this.ema = null
  }

  update(result: FaceLandmarkerResult | null, faceIndex = 0): GazeFrame {
    const landmarks = result?.faceLandmarks?.[faceIndex]
    if (!landmarks) return { faceFound: false, gaze: this.ema, bothClosed: false, eyesOpen: false }

    const blends = new Map<string, number>()
    for (const c of result.faceBlendshapes?.[faceIndex]?.categories ?? []) blends.set(c.categoryName, c.score)

    const left = sampleEye(landmarks, blends, LEFT_EYE)
    const right = sampleEye(landmarks, blends, RIGHT_EYE)
    const bothClosed = left.closed && right.closed
    const ear = (left.ear + right.ear) / 2
    const eyesOpen = !bothClosed && (left.blink + right.blink) / 2 < BLINK_OFF && ear > EAR_OPEN

    const iris: Vec2 = [(left.gaze[0] + right.gaze[0]) / 2, (left.gaze[1] + right.gaze[1]) / 2]
    const blend = blendshapeGaze(blends)
    let raw: Vec2 = [0.65 * iris[0] + 0.35 * blend[0], 0.65 * iris[1] + 0.35 * blend[1]]
    if (bothClosed && this.ema) raw = this.ema

    this.ema = this.ema
      ? [0.35 * raw[0] + 0.65 * this.ema[0], 0.35 * raw[1] + 0.65 * this.ema[1]]
      : raw

    return { faceFound: true, gaze: this.ema, bothClosed, eyesOpen }
  }
}

// Fires once per deliberate blink: eyes must close, then fully reopen within
// maxClosedMs. Long closes (resting eyes) are ignored, and a cooldown stops
// one blink from registering twice.
export class BlinkDetector {
  private closedAt: number | null = null
  private lastFired = -Infinity
  private minClosedMs: number
  private maxClosedMs: number
  private cooldownMs: number

  constructor(minClosedMs = 60, maxClosedMs = 650, cooldownMs = 500) {
    this.minClosedMs = minClosedMs
    this.maxClosedMs = maxClosedMs
    this.cooldownMs = cooldownMs
  }

  update(frame: GazeFrame, now: number): boolean {
    if (!frame.faceFound) {
      this.closedAt = null
      return false
    }
    if (frame.bothClosed) {
      if (this.closedAt === null) this.closedAt = now
      return false
    }
    if (this.closedAt === null || !frame.eyesOpen) return false

    const closedFor = now - this.closedAt
    this.closedAt = null
    if (closedFor < this.minClosedMs || closedFor > this.maxClosedMs) return false
    if (now - this.lastFired < this.cooldownMs) return false
    this.lastFired = now
    return true
  }
}

export interface CalibrationSample {
  gaze: Vec2
  target: Vec2
}

export interface CalibrationModel {
  wx: number[]
  wy: number[]
  error: number
}

const polyFeatures = ([gx, gy]: Vec2) => [1, gx, gy, gx * gy, gx * gx, gy * gy]

// Least squares via normal equations; the tiny ridge keeps it solvable when
// the patient's gaze range is narrow and the features become near-collinear.
function solveLeastSquares(rows: number[][], targets: number[], ridge = 1e-6): number[] {
  const n = rows[0].length
  const a = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => {
      if (j === n) return rows.reduce((s, r, k) => s + r[i] * targets[k], 0)
      return rows.reduce((s, r) => s + r[i] * r[j], 0) + (i === j ? ridge : 0)
    }),
  )
  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let r = col + 1; r < n; r++) if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r
    ;[a[col], a[pivot]] = [a[pivot], a[col]]
    const div = a[col][col] || 1e-12
    for (let j = col; j <= n; j++) a[col][j] /= div
    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const factor = a[r][col]
      for (let j = col; j <= n; j++) a[r][j] -= factor * a[col][j]
    }
  }
  return a.map((row) => row[n])
}

const dot = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * b[i], 0)

export function fitCalibration(samples: CalibrationSample[]): CalibrationModel | null {
  if (samples.length < 6) return null
  const rows = samples.map((s) => polyFeatures(s.gaze))
  const wx = solveLeastSquares(rows, samples.map((s) => s.target[0]))
  const wy = solveLeastSquares(rows, samples.map((s) => s.target[1]))
  const error =
    samples.reduce((sum, s, i) => sum + Math.hypot(dot(rows[i], wx) - s.target[0], dot(rows[i], wy) - s.target[1]), 0) /
    samples.length
  return { wx, wy, error }
}

export function mapGaze(model: CalibrationModel, gaze: Vec2): Vec2 {
  const f = polyFeatures(gaze)
  return [clamp01(dot(f, model.wx)), clamp01(dot(f, model.wy))]
}
