import type { Point, TrackerFrame } from './types'

function lidScore(frame: TrackerFrame): number {
  return Math.max(frame.blinkL, frame.blinkR)
}

// Freeze the cursor as soon as lids start closing. Fire on reopen at the pre-blink aim.
export class BlinkDetector {
  private frozen = false
  private armed = true
  private closingAt = 0
  private holdUntil = 0
  private lastAt = -Infinity
  private lastFireAt = -Infinity
  private lastScore = -1
  private peak = 0
  private aim: Point | null = null
  private buffer: { t: number; point: Point }[] = []

  reset(): void {
    this.frozen = false
    this.armed = true
    this.closingAt = 0
    this.holdUntil = 0
    this.lastAt = -Infinity
    this.lastFireAt = -Infinity
    this.lastScore = -1
    this.peak = 0
    this.aim = null
    this.buffer = []
  }

  pushGaze(point: Point | null, timestamp: number): void {
    if (!point || this.isFrozen(timestamp)) return
    if (timestamp <= (this.buffer.at(-1)?.t ?? -Infinity)) return
    this.buffer.push({ t: timestamp, point: { ...point } })
    this.buffer = this.buffer.filter((s) => timestamp - s.t <= 360)
  }

  isHolding(now: number): boolean { return this.isFrozen(now) }
  isFrozen(now: number): boolean {
    return this.frozen || now < this.holdUntil
  }

  private snapshot(timestamp: number): Point | null {
    const aged = this.buffer.filter((s) => s.t <= timestamp - 40 && timestamp - s.t <= 280)
    if (aged.length > 0) return { ...aged.at(-1)!.point }
    const any = this.buffer.filter((s) => s.t <= timestamp - 16)
    return any.length > 0 ? { ...any.at(-1)!.point } : this.aim
  }

  private freeze(now: number, score: number): void {
    if (this.frozen) {
      this.peak = Math.max(this.peak, score)
      return
    }
    this.frozen = true
    this.closingAt = now
    this.peak = score
    this.aim = this.snapshot(now)
    this.armed = false
  }

  update(frame: TrackerFrame): Point | null {
    const now = frame.timestamp
    if (now <= this.lastAt) return null
    this.lastAt = now

    if (!frame.faceFound) {
      if (this.frozen) this.peak = Math.max(this.peak, 0.7)
      return null
    }

    const score = lidScore(frame)
    if (this.lastScore < 0) {
      this.lastScore = score
      return null
    }
    const ds = score - this.lastScore
    this.lastScore = score

    const closing = (ds > 0.1 && score > 0.2) || score > 0.55
    const opened = this.frozen && ((this.peak - score >= 0.14 && ds <= 0.02) || (score < 0.18 && ds < 0.03))

    if (!this.frozen) {
      if (this.armed && closing) this.freeze(now, score)
      else if (score < 0.22 && ds < 0.04) this.armed = true
      return null
    }

    this.peak = Math.max(this.peak, score)
    if (!opened) return null

    const duration = now - this.closingAt
    const shotAim = this.aim ?? this.buffer.at(-1)?.point ?? null
    this.frozen = false
    this.armed = true
    this.holdUntil = now + 240
    this.aim = null
    const blinked = this.peak >= 0.26 && duration >= 28 && duration <= 700
    const shot = blinked && now - this.lastFireAt >= 220 ? shotAim : null
    this.peak = 0
    if (shot) this.lastFireAt = now
    return shot
  }
}
