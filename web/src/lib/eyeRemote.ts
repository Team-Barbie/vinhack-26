export type Direction = 'center' | 'left' | 'right' | 'up' | 'down'
export const DIRECTIONS: Direction[] = ['center', 'left', 'right', 'up', 'down']
export type RemoteProfile = Record<Direction, number[]>

export function medianFeatures(samples: number[][]): number[] {
  return [0, 1, 2, 3].map((i) => samples.map((s) => s[i]).sort((a, b) => a - b)[Math.floor(samples.length / 2)])
}

export function profileValid(p: RemoteProfile): boolean {
  return DIRECTIONS.every((d) => p[d]?.length === 4 && p[d].every(Number.isFinite)) &&
    DIRECTIONS.slice(1).every((d) => Math.hypot(...p[d].map((v, i) => v - p.center[i])) > 0.008)
}

// Measure progress along each learned direction, not proximity to its endpoint.
export function directionSignal(p: RemoteProfile, f: number[]): { direction: Direction; strength: number } {
  if (f.length !== 4 || !f.every(Number.isFinite)) return { direction: 'center', strength: 0 }
  const scales = p.center.map((_, i) => Math.max(0.008,
    Math.max(...DIRECTIONS.map((d) => p[d][i])) - Math.min(...DIRECTIONS.map((d) => p[d][i]))))
  const delta = f.map((v, i) => (v - p.center[i]) / scales[i])
  const ranked = DIRECTIONS.slice(1).map((d) => {
    const axis = p[d].map((v, i) => (v - p.center[i]) / scales[i])
    const length = axis.reduce((s, v) => s + v * v, 0)
    const strength = delta.reduce((s, v, i) => s + v * axis[i], 0) / Math.max(length, 1e-6)
    const residual = Math.sqrt(delta.reduce((s, v, i) => s + (v - strength * axis[i]) ** 2, 0))
    return { d, strength, residual, score: strength - residual * 0.5 }
  }).sort((a, b) => b.score - a.score)
  const best = ranked[0]
  const valid = best.strength >= 0.3 && best.strength <= 2.5 && best.residual < 0.65 && best.score - ranked[1].score >= 0.12
  return { direction: valid ? best.d : 'center', strength: Math.max(0, best.strength) }
}

export function classifyDirection(p: RemoteProfile, f: number[]): Direction {
  return directionSignal(p, f).direction
}

export class RemoteRepeater {
  private direction: Direction = 'center'
  private since = 0
  private nextAt = 0
  private neutralAt: number | null = null
  reset(): void { this.direction = 'center'; this.since = 0; this.nextAt = 0; this.neutralAt = null }
  update(direction: Direction, now: number): Direction | null {
    if (direction === 'center') {
      this.neutralAt ??= now
      if (now - this.neutralAt >= 100) this.reset()
      return null
    }
    if (this.neutralAt !== null && now - this.neutralAt >= 100) this.reset()
    this.neutralAt = null
    if (direction !== this.direction) {
      this.direction = direction
      this.since = now
      this.nextAt = now + 220
    }
    if (now < this.nextAt) return null
    this.nextAt = now + (now - this.since < 800 ? 700 : 480)
    return direction
  }
}

export type RemoteItem = { id: string; x: number; y: number; width: number; height: number }
export function nextRemoteItem(items: RemoteItem[], current: string, direction: Direction): string {
  const from = items.find((i) => i.id === current)
  if (!from || direction === 'center') return current
  const horizontal = direction === 'left' || direction === 'right'
  const sign = direction === 'left' || direction === 'up' ? -1 : 1
  const candidates = items.map((item) => {
    const primary = (horizontal ? item.x - from.x : item.y - from.y) * sign
    const cross = Math.abs(horizontal ? item.y - from.y : item.x - from.x)
    const overlap = horizontal ? (from.height + item.height) / 2 : (from.width + item.width) / 2
    return { item, primary, sameRow: cross < overlap * 0.8, score: primary + cross * 2 + (cross > overlap * 0.8 ? 10000 : 0) }
  }).filter((c) => c.item.id !== current && c.primary > 8 && (!horizontal || c.sameRow))
  candidates.sort((a, b) => a.score - b.score)
  return candidates[0]?.item.id ?? current
}

export class RemoteBlink {
  private openAt = 0
  private closedAt: number | null = null
  private armed = false
  private selected = ''
  reset(): void { this.closedAt = null; this.armed = false; this.openAt = 0; this.selected = '' }
  update(left: number, right: number, now: number, selected: string): string | null {
    if (Math.max(left, right) < 0.3) {
      if (this.closedAt !== null) {
        const duration = now - this.closedAt
        const hit = this.armed && duration >= 280 && duration <= 1000 && selected === this.selected ? selected : null
        this.reset()
        this.openAt = now
        return hit
      }
      if (!this.openAt) this.openAt = now
      if (now - this.openAt >= 350) this.armed = true
    } else if (Math.min(left, right) > 0.55 && this.closedAt === null) {
      this.closedAt = now
      this.selected = selected
    }
    return null
  }
}
