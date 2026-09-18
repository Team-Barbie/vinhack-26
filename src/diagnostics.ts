import type { DiagnosticMetrics, FilterStatus, HeadPose, Point } from './types'

export type DiagRecord = {
  t: number
  target: Point
  raw: Point | null
  corrected: Point | null
  filtered: Point | null
  pose: HeadPose | null
  status: FilterStatus
  headTrial: boolean
}

export function computeMetrics(rows: DiagRecord[], css: { width: number; height: number }): DiagnosticMetrics {
  const hypotPx = (a: Point, b: Point) =>
    Math.hypot((a.x - b.x) * css.width, (a.y - b.y) * css.height)
  const hypotN = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

  const usable = rows.filter((r) => r.filtered && r.corrected)
  const pos = usable.map((r) => hypotN(r.filtered!, r.target))
  const posPx = usable.map((r) => hypotPx(r.filtered!, r.target))
  const unseen = usable.filter((r) => !r.headTrial)
  const head = usable.filter((r) => r.headTrial)

  const jitter: number[] = []
  const byTarget = new Map<string, Point[]>()
  for (const r of unseen) {
    if (!r.filtered) continue
    const key = `${r.target.x.toFixed(2)},${r.target.y.toFixed(2)}`
    const list = byTarget.get(key) ?? []
    list.push(r.filtered)
    byTarget.set(key, list)
  }
  for (const pts of byTarget.values()) {
    if (pts.length < 8) continue
    const settled = pts.slice(Math.floor(pts.length * 0.4))
    const mx = settled.reduce((s, p) => s + p.x, 0) / settled.length
    const my = settled.reduce((s, p) => s + p.y, 0) / settled.length
    const sd = Math.sqrt(
      settled.reduce((s, p) => s + (p.x - mx) ** 2 + (p.y - my) ** 2, 0) / settled.length,
    )
    jitter.push(sd)
  }

  let delayAcc = 0
  let delayN = 0
  let lastTarget = ''
  let changedAt = 0
  let hit = false
  for (const r of unseen) {
    const key = `${r.target.x.toFixed(2)},${r.target.y.toFixed(2)}`
    if (key !== lastTarget) {
      lastTarget = key
      changedAt = r.t
      hit = false
    }
    if (!hit && r.filtered && hypotN(r.filtered, r.target) < 0.08) {
      delayAcc += r.t - changedAt
      delayN += 1
      hit = true
    }
  }

  const drifts: number[] = []
  for (const pts of byTarget.values()) {
    if (pts.length < 10) continue
    const settled = pts.slice(Math.floor(pts.length * 0.35))
    const mid = Math.floor(settled.length / 2)
    const a = settled.slice(0, mid)
    const b = settled.slice(mid)
    const ma = { x: a.reduce((s, p) => s + p.x, 0) / a.length, y: a.reduce((s, p) => s + p.y, 0) / a.length }
    const mb = { x: b.reduce((s, p) => s + p.x, 0) / b.length, y: b.reduce((s, p) => s + p.y, 0) / b.length }
    drifts.push(Math.hypot(mb.x - ma.x, mb.y - ma.y))
  }

  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

  return {
    positionErrorPx: avg(posPx),
    positionErrorNorm: avg(pos),
    jitterNorm: avg(jitter),
    delayMs: delayN ? delayAcc / delayN : 0,
    driftNorm: avg(drifts),
    unseenErrorPx: avg(unseen.map((r) => hypotPx(r.filtered!, r.target))),
    headMoveErrorPx: avg(head.map((r) => hypotPx(r.filtered!, r.target))),
    samples: usable.length,
  }
}
