import type { Point, TrackerFrame } from './types'

const COOLDOWN_MS = 280
const LOOKBACK_MS = 120
const BUFFER_MS = 280
const HOLD_MS = 150
const RISE_WINDOW_MS = 70

type Sample = { t: number; point: Point }
type ScoreSample = { t: number; both: number }

export class BlinkDetector {
  private closed = false
  private closedAt = 0
  private lastFireAt = -Infinity
  private firedThisBlink = false
  private holdUntil = 0
  private baseline = 0.12
  private buffer: Sample[] = []
  private scores: ScoreSample[] = []
  private pending: Point | null = null

  pushGaze(point: Point | null, timestamp: number): void {
    if (!point) return
    this.buffer.push({ t: timestamp, point })
    const cutoff = timestamp - BUFFER_MS
    while (this.buffer.length > 0 && this.buffer[0].t < cutoff) this.buffer.shift()
  }

  isClosed(): boolean {
    return this.closed
  }

  isHolding(now: number): boolean {
    return this.closed || now < this.holdUntil
  }

  gazeBeforeBlink(timestamp: number): Point | null {
    const target = timestamp - LOOKBACK_MS
    let best: Sample | null = null
    for (const s of this.buffer) {
      if (s.t <= target) best = s
    }
    return best?.point ?? this.buffer[0]?.point ?? null
  }

  update(frame: TrackerFrame): Point | null {
    const now = frame.timestamp
    const both = Math.min(frame.blinkL, frame.blinkR)
    this.scores.push({ t: now, both })
    while (this.scores.length > 0 && this.scores[0].t < now - 160) this.scores.shift()

    let past = this.scores[0]?.both ?? both
    for (const s of this.scores) {
      if (s.t <= now - RISE_WINDOW_MS) past = s.both
    }
    const rise = both - past

    if (both < 0.34) {
      this.baseline = this.baseline * 0.92 + both * 0.08
    }

    const onset =
      !this.closed &&
      both > this.baseline + 0.16 &&
      both > 0.28 &&
      rise > 0.1

    if (onset) {
      this.closed = true
      this.closedAt = now
      this.firedThisBlink = false
      this.holdUntil = now + HOLD_MS
    }

    if (this.closed && !this.firedThisBlink && now - this.closedAt >= 25) {
      if (now - this.lastFireAt >= COOLDOWN_MS) {
        this.firedThisBlink = true
        this.lastFireAt = now
        this.pending = this.gazeBeforeBlink(this.closedAt)
      }
    }

    if (this.closed && (both < this.baseline + 0.08 || now - this.closedAt > 420)) {
      this.closed = false
    }

    const shot = this.pending
    this.pending = null
    return shot
  }
}
