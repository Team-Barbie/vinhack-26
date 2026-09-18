// One Euro filter (Casiez et al.): heavy smoothing when the gaze is still,
// low lag when it moves fast. Better than a moving average for noisy gaze.
class LowPass {
  private y: number | null = null

  filter(x: number, alpha: number): number {
    this.y = this.y === null ? x : alpha * x + (1 - alpha) * this.y
    return this.y
  }

  get last() {
    return this.y
  }

  reset() {
    this.y = null
  }
}

const alphaFor = (cutoff: number, dt: number) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt))

class OneEuro {
  private x = new LowPass()
  private dx = new LowPass()
  private lastT: number | null = null
  private minCutoff: number
  private beta: number
  private dCutoff: number

  constructor(minCutoff: number, beta: number, dCutoff = 1) {
    this.minCutoff = minCutoff
    this.beta = beta
    this.dCutoff = dCutoff
  }

  filter(value: number, tMs: number): number {
    const dt = this.lastT === null ? 1 / 60 : Math.max((tMs - this.lastT) / 1000, 1e-3)
    this.lastT = tMs
    const prev = this.x.last
    const deriv = prev === null ? 0 : (value - prev) / dt
    const edx = this.dx.filter(deriv, alphaFor(this.dCutoff, dt))
    const cutoff = this.minCutoff + this.beta * Math.abs(edx)
    return this.x.filter(value, alphaFor(cutoff, dt))
  }

  reset() {
    this.x.reset()
    this.dx.reset()
    this.lastT = null
  }
}

export class OneEuro2D {
  private fx: OneEuro
  private fy: OneEuro

  constructor(minCutoff = 1.1, beta = 0.35) {
    this.fx = new OneEuro(minCutoff, beta)
    this.fy = new OneEuro(minCutoff, beta)
  }

  filter(x: number, y: number, tMs: number): [number, number] {
    return [this.fx.filter(x, tMs), this.fy.filter(y, tMs)]
  }

  reset() {
    this.fx.reset()
    this.fy.reset()
  }
}
