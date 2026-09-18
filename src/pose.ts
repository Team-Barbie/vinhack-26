import type { HeadPose, Point } from './types'

type Landmark = { x: number; y: number; z?: number }

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

export function extractHeadPose(
  landmarks: Landmark[],
  matrix: { rows: number; columns: number; data: number[] } | undefined,
  vw: number,
  vh: number,
): HeadPose {
  const fromLm = poseFromLandmarks(landmarks, vw, vh)
  if (!matrix || matrix.data.length < 16) return fromLm
  const m = matrix.data
  const r00 = m[0]
  const r10 = m[1]
  const r20 = m[2]
  const r01 = m[4]
  const r11 = m[5]
  const r21 = m[6]
  const r22 = m[10]
  if (![r00, r10, r20, r01, r11, r21, r22].every(Number.isFinite)) return fromLm
  const pitch = Math.asin(clamp(-r21, -1, 1))
  const yaw = Math.atan2(r20, r22)
  const roll = Math.atan2(r01, r11)
  if (![yaw, pitch, roll].every(Number.isFinite)) return fromLm
  return {
    yaw,
    pitch,
    roll,
    dist: fromLm.dist,
    faceX: fromLm.faceX,
    faceY: fromLm.faceY,
  }
}

function poseFromLandmarks(landmarks: Landmark[], vw: number, vh: number): HeadPose {
  const l = landmarks[33]
  const r = landmarks[263]
  const nose = landmarks[1]
  const mid = {
    x: ((l?.x ?? 0.5) + (r?.x ?? 0.5)) / 2,
    y: ((l?.y ?? 0.5) + (r?.y ?? 0.5)) / 2,
  }
  const dx = ((r?.x ?? 0.5) - (l?.x ?? 0.5)) * vw
  const dy = ((r?.y ?? 0.5) - (l?.y ?? 0.5)) * vh
  const iod = Math.hypot(dx, dy) || 1
  const roll = Math.atan2(dy, dx)
  const yaw = ((nose?.x ?? mid.x) - mid.x) * 6
  const pitch = ((nose?.y ?? mid.y) - mid.y) * 8
  return {
    yaw,
    pitch,
    roll,
    dist: iod / Math.min(vw, vh),
    faceX: mid.x,
    faceY: mid.y,
  }
}

export function poseQuality(pose: HeadPose, blinking: number, iodOk: boolean): number {
  if (!iodOk) return 0.35
  const frontal = Math.exp(-(pose.yaw * pose.yaw + pose.pitch * pose.pitch) / 1.2)
  const blink = 1 - Math.min(1, blinking)
  return clamp(0.45 + 0.35 * frontal + 0.2 * blink, 0.25, 1)
}

type PoseSample = { predicted: Point; target: Point; pose: HeadPose }

type SerializedPose = {
  version: 1
  wx: number[]
  wy: number[]
  distMean: number
}

function poseRow(pose: HeadPose, distMean: number): number[] {
  return [1, pose.yaw, pose.pitch, pose.dist - distMean, pose.faceX - 0.5, pose.faceY - 0.5]
}

function solve(A: number[][], b: number[]): number[] {
  const n = b.length
  const M = A.map((row, i) => [...row, b[i]])
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
      const f = M[r][i]
      for (let j = i; j <= n; j++) M[r][j] -= f * M[i][j]
    }
  }
  return M.map((row) => row[n])
}

function ridge(X: number[][], y: number[], lambda: number): number[] {
  const p = X[0].length
  const XtX = Array.from({ length: p }, () => Array(p).fill(0))
  const Xty = Array(p).fill(0)
  for (let i = 0; i < X.length; i++) {
    for (let a = 0; a < p; a++) {
      Xty[a] += X[i][a] * y[i]
      for (let b = a; b < p; b++) XtX[a][b] += X[i][a] * X[i][b]
    }
  }
  for (let a = 0; a < p; a++) {
    for (let b = 0; b < a; b++) XtX[a][b] = XtX[b][a]
    XtX[a][a] += a === 0 ? 1e-6 : lambda
  }
  return solve(XtX, Xty)
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}

export class PoseCorrector {
  private samples: PoseSample[] = []
  private wx: number[] | null = null
  private wy: number[] | null = null
  private distMean = 0.12
  private poseEma: HeadPose | null = null
  private lastPoseAt: number | null = null

  addSample(predicted: Point, target: Point, pose: HeadPose): void {
    this.samples.push({ predicted: { ...predicted }, target: { ...target }, pose: { ...pose } })
    this.wx = null
    this.wy = null
  }

  sampleCount(): number {
    return this.samples.length
  }

  isReady(): boolean {
    return Boolean(this.wx && this.wy && this.wx.length >= 6 && this.wy.length >= 6)
  }

  fit(): boolean {
    if (this.samples.length < 8) return false
    const yawSpan = Math.max(...this.samples.map((s) => s.pose.yaw)) - Math.min(...this.samples.map((s) => s.pose.yaw))
    const distSpan = Math.max(...this.samples.map((s) => s.pose.dist)) - Math.min(...this.samples.map((s) => s.pose.dist))
    if (yawSpan < 0.04 && distSpan < 0.01) return false
    this.distMean = this.samples.reduce((s, p) => s + p.pose.dist, 0) / this.samples.length
    const X = this.samples.map((s) => poseRow(s.pose, this.distMean))
    const rx = this.samples.map((s) => s.target.x - s.predicted.x)
    const ry = this.samples.map((s) => s.target.y - s.predicted.y)
    const wx = ridge(X, rx, 0.55)
    const wy = ridge(X, ry, 0.55)
    if (!wx.every(Number.isFinite) || !wy.every(Number.isFinite)) return false
    this.wx = wx
    this.wy = wy
    return true
  }

  apply(predicted: Point, pose: HeadPose | null): Point {
    if (!this.wx || !this.wy || !pose) return predicted
    const now = typeof performance !== 'undefined' ? performance.now() : 0
    const dt = this.lastPoseAt === null ? 0.05 : Math.min(0.2, Math.max(0.008, (now - this.lastPoseAt) / 1000))
    this.lastPoseAt = now
    const a = 1 - Math.exp(-dt / 0.28)
    this.poseEma = this.poseEma
      ? {
          yaw: a * pose.yaw + (1 - a) * this.poseEma.yaw,
          pitch: a * pose.pitch + (1 - a) * this.poseEma.pitch,
          roll: a * pose.roll + (1 - a) * this.poseEma.roll,
          dist: a * pose.dist + (1 - a) * this.poseEma.dist,
          faceX: a * pose.faceX + (1 - a) * this.poseEma.faceX,
          faceY: a * pose.faceY + (1 - a) * this.poseEma.faceY,
        }
      : { ...pose }
    const row = poseRow(this.poseEma, this.distMean)
    row[4] *= 0.35
    row[5] *= 0.35
    let dx = 0
    let dy = 0
    for (let i = 0; i < this.wx.length; i++) {
      dx += this.wx[i] * row[i]
      dy += this.wy[i] * row[i]
    }
    return {
      x: clamp01(predicted.x + clamp(dx, -0.035, 0.035)),
      y: clamp01(predicted.y + clamp(dy, -0.035, 0.035)),
    }
  }

  toJSON(): string {
    return JSON.stringify({
      version: 1,
      wx: this.wx ?? [],
      wy: this.wy ?? [],
      distMean: this.distMean,
    } satisfies SerializedPose)
  }

  static fromJSON(raw: string): PoseCorrector {
    const data = JSON.parse(raw) as SerializedPose
    const c = new PoseCorrector()
    if (data.version === 1 && Array.isArray(data.wx) && data.wx.length >= 6 && Array.isArray(data.wy) && data.wy.length >= 6) {
      c.wx = data.wx
      c.wy = data.wy
      c.distMean = data.distMean
    }
    return c
  }
}
