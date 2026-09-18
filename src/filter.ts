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
  private blinkUntil = -Infinity
  private status: FilterStatus = 'lost'

  reset(): void {
    this.smoother.reset()
    this.lastGood = null
    this.lastRawAt = -Infinity
    this.lostSince = null
    this.blinkUntil = -Infinity
    this.status = 'lost'
  }

  update(
    raw: Point | null,
    timestamp: number,
    opts: { quality: number; blinking: boolean; faceFound: boolean },
  ): FilterResult {
    if (!opts.faceFound) {
      if (this.lostSince === null) this.lostSince = timestamp
      this.status = this.lastGood ? 'blink' : 'lost'
      if (timestamp - this.lostSince > 500) {
        this.smoother.reset()
        this.lastGood = null
        return { point: null, available: false, status: 'lost', filtered: null }
      }
      return {
        point: this.lastGood,
        available: Boolean(this.lastGood),
        status: this.status,
        filtered: this.lastGood,
      }
    }

    if (opts.blinking) {
      this.status = 'blink'
      this.blinkUntil = timestamp + 220
      this.lostSince = null
      return {
        point: this.lastGood,
        available: Boolean(this.lastGood),
        status: 'blink',
        filtered: this.lastGood,
      }
    }

    if (!raw) {
      const stale = timestamp - this.lastRawAt > 220
      if (stale) {
        this.status = 'lost'
        return { point: this.lastGood, available: false, status: 'lost', filtered: this.lastGood }
      }
      return { point: this.lastGood, available: Boolean(this.lastGood), status: this.status, filtered: this.lastGood }
    }

    const recovering = timestamp < this.blinkUntil
    if (recovering && this.lastGood) {
      this.status = 'blink'
      return {
        point: this.lastGood,
        available: true,
        status: 'blink',
        filtered: this.lastGood,
      }
    }

    this.lostSince = null

    const jump = this.lastGood ? Math.hypot(raw.x - this.lastGood.x, raw.y - this.lastGood.y) : 0
    const saccadeCut = opts.quality < 0.55 ? 0.2 : 0.17
    this.status = jump > saccadeCut ? 'saccade' : 'fixation'
    const next = this.smoother.update(raw, timestamp, false, this.status === 'saccade')
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
