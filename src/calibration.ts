import type { Point, TrackerFrame } from './types'
import type { GazeEstimator } from './gaze'

export const SETTLE_MS = 1000
export const COLLECT_TARGET = 24
export const COLLECT_TIMEOUT_MS = 3500
export const GAP_MS = 300
const STORAGE_KEY = 'gaze-shot-calibration-v6'

export type SessionKind = 'calibrate' | 'validate'
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
}

export type SavedCalibration = {
  estimator: string
  meanErrorNorm: number
  savedAt: number
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

export function validationPoints(): Point[] {
  return [
    { x: 0.3, y: 0.3 },
    { x: 0.7, y: 0.3 },
    { x: 0.3, y: 0.7 },
    { x: 0.7, y: 0.7 },
  ]
}

export function targetRadiusFromError(meanErrorPx: number): number {
  return Math.min(140, Math.max(60, 1.2 * meanErrorPx))
}

export function saveCalibration(data: SavedCalibration): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export function loadCalibration(): SavedCalibration | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as SavedCalibration
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
  index = 0
  phase: CalibPhase = 'settle'
  collected = 0
  pixelErrors: number[] = []
  private phaseAt: number
  private gapUntil = 0

  constructor(kind: SessionKind, now: number) {
    this.kind = kind
    this.points = kind === 'calibrate' ? calibrationLayout() : validationPoints()
    this.phaseAt = now
  }

  currentDot(): Point | null {
    if (this.phase === 'done' || this.phase === 'gap') return null
    return this.points[this.index] ?? null
  }

  progress(): CalibrationProgress {
    const settleT =
      this.phase === 'settle' ? Math.min(1, (performance.now() - this.phaseAt) / SETTLE_MS) : 1
    return {
      kind: this.kind,
      index: this.index,
      total: this.points.length,
      phase: this.phase,
      collected: this.collected,
      needed: COLLECT_TARGET,
      dot: this.currentDot(),
      settleT,
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
    const blinkingNow = blinking || (frame.blinkL > 0.78 && frame.blinkR > 0.78)
    const usable = Boolean(frame.faceFound && frame.features && !blinkingNow)

    if (this.phase === 'settle') {
      if (now - this.phaseAt >= SETTLE_MS) {
        this.phase = 'collect'
        this.phaseAt = now
        this.collected = 0
      }
      return false
    }

    if (usable && frame.features) {
      if (this.kind === 'calibrate') {
        estimator.addSample(frame.features, target)
      } else if (estimator.isReady()) {
        const predicted = estimator.predict(frame.features)
        if (predicted) {
          const err = Math.hypot(
            (predicted.x - target.x) * canvas.width,
            (predicted.y - target.y) * canvas.height,
          )
          this.pixelErrors.push(err)
        }
      }
      this.collected += 1
    }

    const timedOut = now - this.phaseAt >= COLLECT_TIMEOUT_MS
    const enough = this.collected >= COLLECT_TARGET
    if (enough || timedOut) {
      this.index += 1
      this.phase = 'gap'
      this.gapUntil = now + GAP_MS
      if (this.index >= this.points.length) {
        this.phase = 'done'
        return true
      }
    }

    return false
  }
}
