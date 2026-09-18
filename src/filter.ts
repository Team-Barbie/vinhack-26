import { GazeSmoother } from './gaze'
import type { FilterStatus, Point } from './types'

export type FilterResult = {
  point: Point | null
  available: boolean
  status: FilterStatus
  filtered: Point | null
}

export class GazeFilter {
  private smoother = new GazeSmoother()
  private lastGood: Point | null = null
  private lastRawAt = -Infinity
  private lostSince: number | null = null
  private status: FilterStatus = 'lost'

  reset(): void {
    this.smoother.reset()
    this.lastGood = null
    this.lastRawAt = -Infinity
    this.lostSince = null
    this.status = 'lost'
  }

  update(
    raw: Point | null,
    timestamp: number,
    opts: { quality: number; blinking: boolean; faceFound: boolean },
  ): FilterResult {
    if (!opts.faceFound) {
      if (this.lostSince === null) this.lostSince = timestamp
      this.status = 'lost'
      if (timestamp - this.lostSince > 180) {
        this.smoother.reset()
        this.lastGood = null
        return { point: null, available: false, status: 'lost', filtered: null }
      }
      return { point: this.lastGood, available: false, status: 'lost', filtered: this.lastGood }
    }

    if (opts.blinking) {
      this.status = 'blink'
      return { point: this.lastGood, available: false, status: 'blink', filtered: this.lastGood }
    }

    if (!raw) {
      const stale = timestamp - this.lastRawAt > 180
      if (stale) {
        this.status = 'lost'
        return { point: this.lastGood, available: false, status: 'lost', filtered: this.lastGood }
      }
      return { point: this.lastGood, available: true, status: this.status, filtered: this.lastGood }
    }

    const returning = this.lostSince !== null && timestamp - this.lostSince > 80
    this.lostSince = null
    if (returning) this.smoother.reset()

    const jump = this.lastGood ? Math.hypot(raw.x - this.lastGood.x, raw.y - this.lastGood.y) : 0
    this.status = returning ? 'reacquire' : jump > 0.12 ? 'saccade' : 'fixation'
    const next = this.smoother.update(raw, timestamp, false)
    this.lastGood = next
    this.lastRawAt = timestamp
    return {
      point: next,
      available: Boolean(next),
      status: this.status,
      filtered: next,
    }
  }
}
