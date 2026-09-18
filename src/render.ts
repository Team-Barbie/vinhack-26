import type { CalibrationProgress } from './calibration'
import type { Game } from './game'
import type { LookLog } from './log'
import type { Point } from './types'

function css(w: number, h: number): { w: number; h: number } {
  return { w: w || 1, h: h || 1 }
}

export function resizeCanvas(canvas: HTMLCanvasElement): void {
  const dpr = Math.max(1, window.devicePixelRatio || 1)
  const w = window.innerWidth
  const h = window.innerHeight
  if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
    canvas.width = Math.floor(w * dpr)
    canvas.height = Math.floor(h * dpr)
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
  }
  const ctx = canvas.getContext('2d')
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}

export function drawBackdrop(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const { w: width, h: height } = css(w, h)
  const g = ctx.createRadialGradient(width / 2, height / 2, 40, width / 2, height / 2, Math.max(width, height) * 0.7)
  g.addColorStop(0, '#152033')
  g.addColorStop(1, '#0b1018')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, width, height)
}

export function drawCalibration(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  progress: CalibrationProgress,
  faceFound: boolean,
): void {
  drawBackdrop(ctx, w, h)
  const { w: width, h: height } = css(w, h)
  const dot = progress.dot
  if (dot) {
    const x = dot.x * width
    const y = dot.y * height
    const collecting = progress.phase === 'collect'
    const radius = collecting ? 16 : 18
    ctx.beginPath()
    ctx.arc(x, y, 46, 0, Math.PI * 2)
    ctx.strokeStyle = collecting ? 'rgba(62, 224, 197, 0.85)' : 'rgba(255,255,255,0.28)'
    ctx.lineWidth = 3
    ctx.stroke()

    if (progress.phase === 'settle') {
      ctx.beginPath()
      ctx.arc(x, y, 46, -Math.PI / 2, -Math.PI / 2 + progress.settleT * Math.PI * 2)
      ctx.strokeStyle = '#3ee0c5'
      ctx.lineWidth = 4
      ctx.stroke()
    }

    if (collecting) {
      const t = progress.collected / progress.needed
      ctx.beginPath()
      ctx.arc(x, y, 46, -Math.PI / 2, -Math.PI / 2 + Math.min(1, t) * Math.PI * 2)
      ctx.strokeStyle = '#ffb23e'
      ctx.lineWidth = 4
      ctx.stroke()
    }

    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fillStyle = collecting ? '#ffb23e' : '#f4fbff'
    ctx.fill()

    ctx.font = '700 14px system-ui, sans-serif'
    ctx.fillStyle = '#f4fbff'
    ctx.textAlign = 'center'
    ctx.fillText('LOOK', x, y - 58)
  }

  ctx.fillStyle = 'rgba(244,251,255,0.86)'
  ctx.font = '500 22px system-ui, sans-serif'
  ctx.textAlign = 'center'
  const label =
    progress.kind === 'calibrate' ? 'Look at the glowing dot — eyes only, head still'
    : progress.kind === 'calibrate-head' ? 'Same dots, now move your head a little'
    : progress.kind === 'diagnose-head' ? 'Head-movement accuracy trial'
    : progress.kind === 'diagnose' ? 'Accuracy test — unseen positions'
    : 'Keep looking — measuring accuracy'
  ctx.fillText(label, width / 2, 48)
  ctx.font = '16px system-ui, sans-serif'
  ctx.fillStyle = 'rgba(244,251,255,0.55)'
  ctx.fillText(`${Math.min(progress.index + 1, progress.total)} / ${progress.total}`, width / 2, 76)
  if (progress.hint) ctx.fillText(progress.hint, width / 2, height - 28)

  if (!faceFound) drawFaceLost(ctx, width, height)
}

export function drawGame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  game: Game,
  gaze: Point | null,
  now: number,
  faceFound: boolean,
  lookLogs = 0,
): void {
  drawBackdrop(ctx, w, h)
  const { w: width, h: height } = css(w, h)

  for (const t of game.targets) {
    const pulse = 1 + Math.sin(now / 180 + t.id) * 0.04
    const r = t.radius * pulse
    const grd = ctx.createRadialGradient(t.x - r * 0.25, t.y - r * 0.3, r * 0.1, t.x, t.y, r)
    grd.addColorStop(0, '#ffd7b0')
    grd.addColorStop(0.35, '#ff6b3d')
    grd.addColorStop(1, '#9c1f1f')
    ctx.beginPath()
    ctx.arc(t.x, t.y, r, 0, Math.PI * 2)
    ctx.fillStyle = grd
    ctx.fill()
    ctx.lineWidth = 2
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'
    ctx.stroke()

    if (game.config.fireMode === 'dwell' && t.dwellMs > 0) {
      const p = Math.min(1, t.dwellMs / game.config.dwellMs)
      ctx.beginPath()
      ctx.arc(t.x, t.y, r + 8, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2)
      ctx.strokeStyle = '#3ee0c5'
      ctx.lineWidth = 4
      ctx.stroke()
    }
  }

  if (game.lastShot && now - game.lastShot.at < 180) {
    ctx.beginPath()
    ctx.arc(game.lastShot.point.x, game.lastShot.point.y, 22, 0, Math.PI * 2)
    ctx.strokeStyle = game.lastShot.hit ? 'rgba(62,224,197,0.9)' : 'rgba(255,80,80,0.9)'
    ctx.lineWidth = 3
    ctx.stroke()
  }

  if (gaze) drawCrosshair(ctx, gaze.x, gaze.y, faceFound)

  const remaining = game.remainingMs(now)
  const secs = Math.ceil(remaining / 1000)
  ctx.textAlign = 'left'
  ctx.font = '700 28px system-ui, sans-serif'
  ctx.fillStyle = '#f4fbff'
  ctx.fillText(`${game.hits}`, 28, 44)
  ctx.font = '14px system-ui, sans-serif'
  ctx.fillStyle = 'rgba(244,251,255,0.55)'
  ctx.fillText('HITS', 28, 64)

  ctx.textAlign = 'right'
  ctx.font = '700 28px system-ui, sans-serif'
  ctx.fillStyle = secs <= 10 ? '#ff6b3d' : '#f4fbff'
  ctx.fillText(`${secs}s`, width - 28, 44)

  ctx.textAlign = 'center'
  ctx.font = '14px system-ui, sans-serif'
  ctx.fillStyle = 'rgba(244,251,255,0.45)'
  const mode = game.config.fireMode === 'blink' ? 'Blink to shoot  ·  Space also fires' : 'Dwell on a target to shoot  ·  Space also fires'
  ctx.fillText(`${mode}  ·  Click where you are actually looking if it is off`, width / 2, height - 24)
  if (lookLogs > 0) {
    ctx.fillStyle = '#3ee0c5'
    ctx.fillText(`${lookLogs} look log${lookLogs === 1 ? '' : 's'} steering the cursor`, width / 2, height - 46)
  }

  if (!faceFound) drawFaceLost(ctx, width, height)
}

export function drawIdle(ctx: CanvasRenderingContext2D, w: number, h: number, gaze: Point | null, faceFound: boolean): void {
  drawBackdrop(ctx, w, h)
  if (gaze) drawCrosshair(ctx, gaze.x, gaze.y, faceFound)
  if (!faceFound) {
    const { w: width, h: height } = css(w, h)
    drawFaceLost(ctx, width, height)
  }
}

export function drawCheck(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  gaze: Point | null,
  faceFound: boolean,
  logs: LookLog[] = [],
  meanErrorPx = 0,
): void {
  drawBackdrop(ctx, w, h)
  const { w: width, h: height } = css(w, h)

  for (const log of logs) {
    const ax = log.actual.x * width
    const ay = log.actual.y * height
    const px = log.predicted.x * width
    const py = log.predicted.y * height
    ctx.beginPath()
    ctx.moveTo(px, py)
    ctx.lineTo(ax, ay)
    ctx.strokeStyle = 'rgba(255, 178, 62, 0.35)'
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(ax, ay, 5, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255, 178, 62, 0.8)'
    ctx.fill()
  }

  if (gaze) drawCrosshair(ctx, gaze.x, gaze.y, faceFound)

  ctx.textAlign = 'center'
  ctx.fillStyle = 'rgba(244,251,255,0.9)'
  ctx.font = '600 24px system-ui, sans-serif'
  ctx.fillText('Look around the screen', width / 2, 48)
  ctx.font = '16px system-ui, sans-serif'
  ctx.fillStyle = 'rgba(244,251,255,0.6)'
  ctx.fillText('Click where you are actually looking. Enter starts · D accuracy test.', width / 2, 76)
  ctx.fillText(`Measured accuracy: ${Math.round(meanErrorPx)} px · C recalibrates`, width / 2, 126)
  if (logs.length > 0) {
    ctx.fillStyle = '#3ee0c5'
    ctx.fillText(`${logs.length} look log${logs.length === 1 ? '' : 's'} saved`, width / 2, 102)
    ctx.textAlign = 'left'
    ctx.font = '12px ui-monospace, monospace'
    ctx.fillStyle = 'rgba(255, 178, 62, 0.9)'
    const recent = logs.slice(-8)
    recent.forEach((log, i) => {
      const line = `p ${log.predicted.x.toFixed(2)},${log.predicted.y.toFixed(2)}  →  a ${log.actual.x.toFixed(2)},${log.actual.y.toFixed(2)}`
      ctx.fillText(line, 24, height - 28 - (recent.length - 1 - i) * 16)
    })
  }
  if (!faceFound) drawFaceLost(ctx, width, height)
}

export function drawGeomWarn(ctx: CanvasRenderingContext2D, w: number, _h: number): void {
  ctx.fillStyle = 'rgba(255, 107, 61, 0.92)'
  ctx.fillRect(0, 0, w, 56)
  ctx.fillStyle = '#0b1018'
  ctx.font = '600 16px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('Window, zoom, or display changed — stretching the old map would be wrong. Press C to recalibrate.', w / 2, 36)
}

export function drawDiagnoseResults(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  metrics: {
    positionErrorPx: number
    jitterNorm: number
    delayMs: number
    driftNorm: number
    unseenErrorPx: number
    headMoveErrorPx: number
    samples: number
  },
): void {
  drawBackdrop(ctx, w, h)
  ctx.textAlign = 'center'
  ctx.fillStyle = '#f4fbff'
  ctx.font = '600 28px system-ui, sans-serif'
  ctx.fillText('Accuracy (not smoothness)', w / 2, 64)
  ctx.font = '16px system-ui, sans-serif'
  ctx.fillStyle = 'rgba(244,251,255,0.7)'
  const lines = [
    `Position error: ${Math.round(metrics.positionErrorPx)} px`,
    `Unseen points: ${Math.round(metrics.unseenErrorPx)} px`,
    `Head-movement trials: ${Math.round(metrics.headMoveErrorPx)} px`,
    `Stationary jitter: ${(metrics.jitterNorm * 100).toFixed(2)}% of screen`,
    `Movement delay: ${Math.round(metrics.delayMs)} ms`,
    `Drift during fixation: ${(metrics.driftNorm * 100).toFixed(2)}% of screen`,
    `${metrics.samples} samples · Enter to play · C recalibrates`,
  ]
  lines.forEach((line, i) => ctx.fillText(line, w / 2, 120 + i * 32))
}

function drawCrosshair(ctx: CanvasRenderingContext2D, x: number, y: number, locked: boolean): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.strokeStyle = locked ? '#3ee0c5' : 'rgba(255,255,255,0.35)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(0, 0, 14, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(-22, 0)
  ctx.lineTo(-8, 0)
  ctx.moveTo(8, 0)
  ctx.lineTo(22, 0)
  ctx.moveTo(0, -22)
  ctx.lineTo(0, -8)
  ctx.moveTo(0, 8)
  ctx.lineTo(0, 22)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(0, 0, 2.2, 0, Math.PI * 2)
  ctx.fillStyle = locked ? '#3ee0c5' : '#fff'
  ctx.fill()
  ctx.restore()
}

function drawFaceLost(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = 'rgba(12, 16, 24, 0.45)'
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = 'rgba(255, 180, 80, 0.95)'
  ctx.font = '600 20px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('Face not found — sit in view of the camera', w / 2, h / 2)
}
