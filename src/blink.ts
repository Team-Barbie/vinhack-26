import type { Point, TrackerFrame } from './types'

// Confirm a blink on reopening, using only pre-closure gaze.
export class BlinkDetector {
  private closed = false
  private armed = false
  private closedAt = 0
  private holdUntil = 0
  private lastAt = -Infinity
  private lastFireAt = -Infinity
  private aim: Point | null = null
  private buffer: { t: number; point: Point }[] = []

  reset(): void {
    this.closed = false
    this.armed = false
    this.holdUntil = 0
    this.lastAt = -Infinity
    this.lastFireAt = -Infinity
    this.aim = null
    this.buffer = []
  }

  pushGaze(point: Point | null, timestamp: number): void {
    if (!point || this.isHolding(timestamp)) return
    if (timestamp <= (this.buffer.at(-1)?.t ?? -Infinity)) return
    this.buffer.push({ t: timestamp, point: { ...point } })
    this.buffer = this.buffer.filter((s) => timestamp - s.t <= 250)
  }

  isClosed(): boolean { return this.closed }
  isHolding(now: number): boolean { return this.closed || now < this.holdUntil }

  gazeBeforeBlink(timestamp: number): Point | null {
    const samples = this.buffer.filter((s) => s.t <= timestamp - 35 && timestamp - s.t <= 200)
    return samples.at(-1)?.point ?? null
  }

  update(frame: TrackerFrame): Point | null {
    if (!frame.faceFound) { this.reset(); return null }
    const now = frame.timestamp
    if (now <= this.lastAt) return null
    if (now - this.lastAt > 200) this.reset()
    this.lastAt = now
    const open = Math.max(frame.blinkL, frame.blinkR) < 0.3
    const shut = Math.min(frame.blinkL, frame.blinkR) > 0.55
    if (!this.closed) {
      if (open) this.armed = true
      if (shut) {
        this.closed = true
        this.closedAt = now
        this.aim = this.armed ? this.gazeBeforeBlink(now) : null
        this.armed = false
      }
      return null
    }
    if (!open) return null
    const duration = now - this.closedAt
    this.closed = false
    this.armed = true
    this.holdUntil = now + 80
    const shot = duration >= 30 && duration <= 400 && now - this.lastFireAt >= 300 ? this.aim : null
    this.aim = null
    if (shot) this.lastFireAt = now
    return shot
  }
}
