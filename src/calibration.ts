import type { Point, ScreenGeometry, TrackerFrame } from './types'
import type { GazeEstimator } from './gaze'
import type { PoseCorrector } from './pose'

export const SETTLE_MS = 1000
export const HEAD_SETTLE_MS = 800
export const COLLECT_TARGET = 24
export const HEAD_COLLECT = 16
export const COLLECT_TIMEOUT_MS = 3500
export const GAP_MS = 300
const STORAGE_KEY = 'gaze-shot-calibration-v8'

export type SessionKind = 'calibrate' | 'calibrate-head' | 'validate' | 'diagnose' | 'diagnose-head'
export type CalibPhase = 'settle' | 'collect' | 'gap' | 'done'

export type CalibrationProgress = {
  kind: SessionKind
  index: number
  total: number
  phase: CalibPhase
  collected: number
  needed: number
  dot: Point | null
  settleT: number
  hint: string
}

export type SavedCalibration = {
  estimator: string
  poseCorrector: string
  meanErrorNorm: number
  geometry: ScreenGeometry
  savedAt: number
}

export type HeadAnchor = {
  x: number
  y: number
  hint: string
}

export function gridPoints(cols: number, rows: number, margin = 0.1): Point[] {
  const pts: Point[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = cols === 1 ? 0.5 : margin + (c / (cols - 1)) * (1 - 2 * margin)
      const y = rows === 1 ? 0.5 : margin + (r / (rows - 1)) * (1 - 2 * margin)
      pts.push({ x, y })
    }
  }
  return pts
}

function shuffle<T>(items: T[]): T[] {
  const arr = items.slice()
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = arr[i]
    arr[i] = arr[j]
    arr[j] = tmp
  }
  return arr
}

export function calibrationLayout(): Point[] {
  const pts = gridPoints(3, 4, 0.04)
  const isCorner = (p: Point) =>
    (p.x <= 0.08 || p.x >= 0.92) && (p.y <= 0.08 || p.y >= 0.92)
  const isVertExtreme = (p: Point) => p.y <= 0.08 || p.y >= 0.92
  const corners = pts.filter(isCorner)
  const vert = pts.filter((p) => isVertExtreme(p) && !isCorner(p))
  const rest = pts.filter((p) => !isCorner(p) && !isVertExtreme(p))
  return [...corners, ...vert, ...shuffle(rest)]
}

export function headCalibrationLayout(): HeadAnchor[] {
  const anchors: Point[] = [
    { x: 0.08, y: 0.08 },
    { x: 0.92, y: 0.08 },
    { x: 0.5, y: 0.5 },
    { x: 0.08, y: 0.92 },
    { x: 0.92, y: 0.92 },
  ]
  const poses = [
    'Turn your head slightly left — keep looking at the dot',
    'Turn your head slightly right — keep looking at the dot',
    'Move a little closer or farther — keep looking at the dot',
  ]
  const out: HeadAnchor[] = []
  for (const a of anchors) {
    for (const hint of poses) out.push({ x: a.x, y: a.y, hint })
  }
  return out
}

export function validationPoints(): Point[] {
  return [
    { x: 0.3, y: 0.3 },
    { x: 0.7, y: 0.3 },
    { x: 0.3, y: 0.7 },
    { x: 0.7, y: 0.7 },
  ]
}

export function diagnosePoints(): Point[] {
  return [
    { x: 0.2, y: 0.5 },
    { x: 0.8, y: 0.5 },
    { x: 0.5, y: 0.2 },
    { x: 0.5, y: 0.8 },
    { x: 0.35, y: 0.65 },
    { x: 0.65, y: 0.35 },
  ]
}

export function diagnoseHeadPoints(): HeadAnchor[] {
  return [
    { x: 0.5, y: 0.5, hint: 'Look at the center and turn your head slightly left' },
    { x: 0.5, y: 0.5, hint: 'Look at the center and turn your head slightly right' },
    { x: 0.5, y: 0.5, hint: 'Look at the center and move a little closer, then back' },
  ]
}

export function targetRadiusFromError(meanErrorPx: number): number {
  return Math.min(140, Math.max(60, 1.2 * meanErrorPx))
}

export function saveCalibration(data: SavedCalibration): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export function loadCalibration(): SavedCalibration | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as SavedCalibration
    return typeof data.estimator === 'string' && Number.isFinite(data.meanErrorNorm) &&
      data.meanErrorNorm >= 0 && data.geometry ? data : null
  } catch {
    return null
  }
}

export function clearCalibration(): void {
  localStorage.removeItem(STORAGE_KEY)
}

export class CalibrationSession {
  readonly kind: SessionKind
  readonly points: Point[]
  readonly hints: string[]
  index = 0
  phase: CalibPhase = 'settle'
  collected = 0
  pixelErrors: number[] = []
  private phaseAt: number
  private gapUntil = 0
  private lastSampleAt = -Infinity
  private samples: number[][] = []
  private hint = ''
  private poseCorrector: PoseCorrector | null

  constructor(kind: SessionKind, now: number, poseCorrector: PoseCorrector | null = null) {
    this.kind = kind
    this.poseCorrector = poseCorrector
    if (kind === 'calibrate-head') {
      const layout = headCalibrationLayout()
      this.points = layout.map((p) => ({ x: p.x, y: p.y }))
      this.hints = layout.map((p) => p.hint)
    } else if (kind === 'diagnose') {
      this.points = diagnosePoints()
      this.hints = this.points.map(() => 'Look at the glowing dot — unseen positions')
    } else if (kind === 'diagnose-head') {
      const layout = diagnoseHeadPoints()
      this.points = layout.map((p) => ({ x: p.x, y: p.y }))
      this.hints = layout.map((p) => p.hint)
    } else if (kind === 'validate') {
      this.points = validationPoints()
      this.hints = this.points.map(() => 'Keep looking — measuring accuracy')
    } else {
      this.points = calibrationLayout()
      this.hints = this.points.map(() => 'Look at the glowing dot — eyes only, head still')
    }
    this.phaseAt = now
  }

  currentDot(): Point | null {
    if (this.phase === 'done' || this.phase === 'gap') return null
    return this.points[this.index] ?? null
  }

  progress(): CalibrationProgress {
    const settleMs = this.kind.includes('head') ? HEAD_SETTLE_MS : SETTLE_MS
    const settleT =
      this.phase === 'settle' ? Math.min(1, (performance.now() - this.phaseAt) / settleMs) : 1
    return {
      kind: this.kind,
      index: this.index,
      total: this.points.length,
      phase: this.phase,
      collected: this.collected,
      needed: this.kind.includes('head') || this.kind.startsWith('diagnose') ? HEAD_COLLECT : COLLECT_TARGET,
      dot: this.currentDot(),
      settleT,
      hint: this.hint || this.hints[this.index] || '',
    }
  }

  meanErrorPx(): number {
    if (this.pixelErrors.length === 0) return 120
    return this.pixelErrors.reduce((a, b) => a + b, 0) / this.pixelErrors.length
  }

  tick(
    frame: TrackerFrame,
    now: number,
    canvas: { width: number; height: number },
    estimator: GazeEstimator,
    blinking: boolean,
    predictFull?: (features: number[]) => Point | null,
  ): boolean {
    if (this.phase === 'done') return true

    if (this.phase === 'gap') {
      if (now >= this.gapUntil) {
        if (this.index >= this.points.length) {
          this.phase = 'done'
          return true
        }
        this.phase = 'settle'
        this.phaseAt = now
        this.collected = 0
      }
      return false
    }

    const target = this.points[this.index]
    const blinkingNow = blinking || Math.max(frame.blinkL, frame.blinkR) > 0.3
    const usable = Boolean(frame.faceFound && frame.features?.every(Number.isFinite) && !blinkingNow)
    if (!usable) {
      this.hint = 'Keep your eyes open and your face in view'
      this.samples = []
      this.collected = 0
      this.phase = 'settle'
      this.phaseAt = now
      return false
    }

    const settleMs = this.kind.includes('head') ? HEAD_SETTLE_MS : SETTLE_MS
    if (this.phase === 'settle') {
      if (now - this.phaseAt >= settleMs) {
        this.phase = 'collect'
        this.phaseAt = now
        this.collected = 0
        this.hint = this.hints[this.index] || ''
      }
      return false
    }

    if (usable && frame.features && frame.timestamp > this.lastSampleAt) {
      this.lastSampleAt = frame.timestamp
      this.samples.push(frame.features.slice())
      this.collected = this.samples.length
      if (this.kind === 'calibrate-head' && this.poseCorrector && frame.pose && estimator.isReady()) {
        const predicted = estimator.predict(frame.features)
        if (predicted) this.poseCorrector.addSample(predicted, target, frame.pose)
      }
    }

    const needed = this.progress().needed
    const timedOut = now - this.phaseAt >= COLLECT_TIMEOUT_MS
    const enough = this.collected >= needed
    if (enough) {
      const headish = this.kind.includes('head')
      const stable = headish || this.samples[0].every((_, dim) => {
        const values = this.samples.map((s) => s[dim])
        const mean = values.reduce((a, b) => a + b, 0) / values.length
        const sd = Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length)
        return sd <= 0.015
      })
      if (!stable) {
        this.samples = []
        this.collected = 0
        this.phase = 'settle'
        this.phaseAt = now
        this.hint = 'Hold still and keep looking at this dot'
        return false
      }
      for (const features of this.samples) {
        if (this.kind === 'calibrate') {
          estimator.addSample(features, target)
          continue
        }
        if (this.kind === 'calibrate-head') {
          continue
        }
        const predicted = predictFull ? predictFull(features) : estimator.predict(features)
        if (predicted) {
          const err = Math.hypot(
            (predicted.x - target.x) * canvas.width,
            (predicted.y - target.y) * canvas.height,
          )
          this.pixelErrors.push(err)
        }
      }
      this.samples = []
      this.index += 1
      this.phase = 'gap'
      this.gapUntil = now + GAP_MS
      if (this.index >= this.points.length) {
        this.phase = 'done'
        return true
      }
    }
    if (timedOut && !enough) this.hint = 'Waiting for clear camera samples — keep looking at the dot'

    return false
  }
}
