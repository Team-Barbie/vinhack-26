import type { GazeFrame, Vec2 } from './eyeTracking'

function lidScore(frame: GazeFrame): number {
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
  private aim: Vec2 | null = null
  private buffer: { t: number; point: Vec2 }[] = []

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

  pushGaze(point: Vec2 | null, timestamp: number): void {
    if (!point || this.isFrozen(timestamp)) return
    if (timestamp <= (this.buffer.at(-1)?.t ?? -Infinity)) return
    this.buffer.push({ t: timestamp, point: [point[0], point[1]] })
    this.buffer = this.buffer.filter((s) => timestamp - s.t <= 360)
  }

  isFrozen(now: number): boolean {
    return this.frozen || now < this.holdUntil
  }

  private snapshot(timestamp: number): Vec2 | null {
    const aged = this.buffer.filter((s) => s.t <= timestamp - 40 && timestamp - s.t <= 280)
    if (aged.length > 0) return [...aged.at(-1)!.point]
    const any = this.buffer.filter((s) => s.t <= timestamp - 16)
    return any.length > 0 ? [...any.at(-1)!.point] : this.aim
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

  update(frame: GazeFrame, now: number): boolean {
    if (now <= this.lastAt) return false
    this.lastAt = now

    const score = lidScore(frame)

    // Closing lids often drop the face for a few frames. Keep an in-progress
    // blink alive instead of treating that as a lost track.
    if (!frame.faceFound) {
      if (this.frozen) {
        this.peak = Math.max(this.peak, 0.7)
        return false
      }
      if (this.armed && this.lastScore >= 0.42) this.freeze(now, Math.max(this.lastScore, 0.55))
      return false
    }

    if (this.lastScore < 0) {
      this.lastScore = score
      return false
    }
    const ds = score - this.lastScore
    this.lastScore = score

    const closing = (ds > 0.1 && score > 0.28) || score > 0.48
    const opened = this.frozen && ((this.peak - score >= 0.14 && ds <= 0.03) || score < 0.2)

    if (!this.frozen) {
      if (this.armed && closing) this.freeze(now, score)
      else if (score < 0.22 && ds < 0.04) this.armed = true
      return false
    }

    this.peak = Math.max(this.peak, score)
    if (!opened) return false

    const duration = now - this.closingAt
    this.frozen = false
    this.armed = true
    this.holdUntil = now + 220
    this.aim = null
    const blinked = this.peak >= 0.45 && duration >= 260 && duration <= 1000
    const shot = blinked && now - this.lastFireAt >= 320
    this.peak = 0
    if (shot) this.lastFireAt = now
    return shot
  }
}
