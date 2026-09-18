import './style.css'
import { BlinkDetector } from './blink'
import {
  CalibrationSession,
  loadCalibration,
  saveCalibration,
  targetRadiusFromError,
} from './calibration'
import { computeMetrics, type DiagRecord } from './diagnostics'
import { GazeFilter } from './filter'
import { RidgeGazeEstimator } from './gaze'
import { Game } from './game'
import { captureGeometry, geometryMatches, requestFullscreen } from './geometry'
import { LookLogger } from './log'
import { PoseCorrector } from './pose'
import {
  drawCalibration,
  drawCheck,
  drawDiagnoseResults,
  drawGame,
  drawGeomWarn,
  drawIdle,
  resizeCanvas,
} from './render'
import { FaceTracker } from './tracker'
import type { DiagnosticMetrics, FireMode, Point, ScreenGeometry, ScreenId, TrackerFrame } from './types'

const canvas = document.querySelector<HTMLCanvasElement>('#game')!
const video = document.querySelector<HTMLVideoElement>('#camera')!
const overlay = document.querySelector<HTMLDivElement>('#overlay')!

const panels: Record<string, HTMLElement> = {
  start: document.querySelector('#panel-start')!,
  loading: document.querySelector('#panel-loading')!,
  ready: document.querySelector('#panel-ready')!,
  results: document.querySelector('#panel-results')!,
  error: document.querySelector('#panel-error')!,
}

const btnCalibrate = document.querySelector<HTMLButtonElement>('#btn-calibrate')!
const btnSaved = document.querySelector<HTMLButtonElement>('#btn-saved')!
const btnStartRound = document.querySelector<HTMLButtonElement>('#btn-start-round')!
const btnRecalibrate = document.querySelector<HTMLButtonElement>('#btn-recalibrate')!
const btnReplay = document.querySelector<HTMLButtonElement>('#btn-replay')!
const btnRecalibrate2 = document.querySelector<HTMLButtonElement>('#btn-recalibrate-2')!
const btnRetry = document.querySelector<HTMLButtonElement>('#btn-retry')!
const resultsHits = document.querySelector<HTMLHeadingElement>('#results-hits')!
const resultsStats = document.querySelector<HTMLDListElement>('#results-stats')!
const errorText = document.querySelector<HTMLParagraphElement>('#error-text')!

const tracker = new FaceTracker(video)
const blink = new BlinkDetector()
const filter = new GazeFilter()
const logger = new LookLogger()
const game = new Game()

let screen: ScreenId = 'start'
let estimator = new RidgeGazeEstimator()
let poseCorrector = new PoseCorrector()
let session: CalibrationSession | null = null
let fireMode: FireMode = 'blink'
let meanErrorPx = 90
let gazePx: Point | null = null
let lastFeatures: number[] | null = null
let lastPredictedNorm: Point | null = null
let lastRawNorm: Point | null = null
let lastCorrectedNorm: Point | null = null
let starting = false
let trackerReady = false
let aimUsable = false
let lastProcessedAt = -Infinity
let lastAimAt = -Infinity
let calibGeometry: ScreenGeometry | null = null
let geomMismatch = false
let diagRows: DiagRecord[] = []
let diagMetrics: DiagnosticMetrics | null = null

function cssSize(): { width: number; height: number } {
  return { width: window.innerWidth, height: window.innerHeight }
}

function emptyFrame(now: number): TrackerFrame {
  return {
    features: null,
    pose: null,
    quality: 0,
    blinkL: 0,
    blinkR: 0,
    faceFound: false,
    timestamp: now,
    cameraWidth: 0,
    cameraHeight: 0,
  }
}

function showPanel(id: keyof typeof panels | null): void {
  for (const panel of Object.values(panels)) panel.classList.add('hidden')
  if (id) {
    panels[id].classList.remove('hidden')
    overlay.classList.add('open')
    overlay.classList.remove('hidden')
  } else {
    overlay.classList.remove('open')
  }
}

function setScreen(next: ScreenId): void {
  screen = next
  if (next === 'start') showPanel('start')
  else if (next === 'loading') showPanel('loading')
  else if (next === 'ready') showPanel('ready')
  else if (next === 'results') showPanel('results')
  else if (next === 'error') showPanel('error')
  else showPanel(null)

  video.classList.toggle('peek', trackerReady && (next === 'start' || next === 'results'))
}

function selectedFireMode(): FireMode {
  const checked = document.querySelector<HTMLInputElement>('input[name="fire-mode"]:checked')
  return checked?.value === 'dwell' ? 'dwell' : 'blink'
}

function radiusNow(): number {
  return targetRadiusFromError(meanErrorPx)
}

function toPixels(norm: Point | null): Point | null {
  if (!norm) return null
  const { width, height } = cssSize()
  return { x: norm.x * width, y: norm.y * height }
}

function refreshGeometry(): void {
  const live = captureGeometry(video)
  const active =
    screen === 'check' || screen === 'play' || screen === 'diagnose' ||
    screen === 'diagnose-head' || screen === 'diagnose-results'
  geomMismatch = Boolean(active && calibGeometry && !geometryMatches(calibGeometry, live))
}

function predictFull(features: number[], pose: TrackerFrame['pose']): Point | null {
  const raw = estimator.predict(features)
  lastRawNorm = raw
  if (!raw) return null
  return poseCorrector.apply(raw, pose)
}

function refreshSavedButton(): void {
  const saved = loadCalibration()
  btnSaved.classList.toggle('hidden', !saved)
}

async function ensureTracker(): Promise<void> {
  if (trackerReady) return
  setScreen('loading')
  await tracker.start()
  video.classList.add('live')
  trackerReady = true
}

async function beginCalibration(): Promise<void> {
  await requestFullscreen()
  estimator = new RidgeGazeEstimator()
  poseCorrector = new PoseCorrector()
  session = new CalibrationSession('calibrate', performance.now(), poseCorrector)
  logger.clear()
  filter.reset()
  blink.reset()
  aimUsable = false
  gazePx = null
  lastFeatures = null
  lastPredictedNorm = null
  calibGeometry = captureGeometry(video)
  geomMismatch = false
  setScreen('calibrate')
}

function beginHeadCalibration(): void {
  session = new CalibrationSession('calibrate-head', performance.now(), poseCorrector)
  filter.reset()
  blink.reset()
  setScreen('calibrate-head')
}

function beginCheck(): void {
  setScreen('check')
}

function beginValidation(): void {
  session = new CalibrationSession('validate', performance.now(), poseCorrector)
  filter.reset()
  blink.reset()
  setScreen('validate')
}

function beginDiagnose(): void {
  if (!estimator.isReady()) return
  diagRows = []
  diagMetrics = null
  session = new CalibrationSession('diagnose', performance.now(), poseCorrector)
  filter.reset()
  blink.reset()
  setScreen('diagnose')
}

function persistCalibration(): void {
  const { width, height } = cssSize()
  const meanErrorNorm = meanErrorPx / Math.hypot(width, height)
  calibGeometry = captureGeometry(video)
  try {
    saveCalibration({
      estimator: estimator.toJSON(),
      poseCorrector: poseCorrector.toJSON(),
      meanErrorNorm,
      geometry: calibGeometry,
      savedAt: Date.now(),
    })
    refreshSavedButton()
  } catch {
    /* ignore quota */
  }
}

function correctGaze(clientX: number, clientY: number): void {
  if (!aimUsable || geomMismatch || performance.now() - lastAimAt > 200 || !lastFeatures || !lastPredictedNorm || !estimator.isReady()) return
  const { width, height } = cssSize()
  logger.record(lastFeatures, lastPredictedNorm, { x: clientX / width, y: clientY / height })
}

function startRound(): void {
  if (!estimator.isReady() || geomMismatch) return
  const { width, height } = cssSize()
  game.config.fireMode = fireMode
  game.config.radius = radiusNow()
  game.start(performance.now(), width, height)
  blink.reset()
  persistCalibration()
  setScreen('play')
}

function showResults(): void {
  const r = game.results()
  resultsHits.textContent = String(r.hits)
  resultsStats.innerHTML = `
    <div><dt>Misses</dt><dd>${r.misses}</dd></div>
    <div><dt>Accuracy</dt><dd>${Math.round(r.accuracy * 100)}%</dd></div>
    <div><dt>Avg time to hit</dt><dd>${r.hits ? `${(r.avgTtkMs / 1000).toFixed(2)}s` : '—'}</dd></div>
    <div><dt>Fire mode</dt><dd>${fireMode}</dd></div>
  `
  setScreen('results')
}

function useSavedCalibration(): void {
  const saved = loadCalibration()
  const live = captureGeometry(video)
  if (!saved || !geometryMatches(saved.geometry, live)) {
    void beginCalibration()
    return
  }
  try {
    estimator = RidgeGazeEstimator.fromJSON(saved.estimator)
    poseCorrector = saved.poseCorrector ? PoseCorrector.fromJSON(saved.poseCorrector) : new PoseCorrector()
  } catch {
    void beginCalibration()
    return
  }
  const { width, height } = cssSize()
  meanErrorPx = saved.meanErrorNorm * Math.hypot(width, height)
  calibGeometry = saved.geometry
  logger.clear()
  beginValidation()
}

async function bootAnd(action: 'calibrate' | 'saved'): Promise<void> {
  if (starting) return
  starting = true
  fireMode = selectedFireMode()
  try {
    await ensureTracker()
    if (action === 'saved') useSavedCalibration()
    else await beginCalibration()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const denied = message.toLowerCase().includes('permission') || message.toLowerCase().includes('denied')
    errorText.textContent = denied
      ? 'Camera permission was blocked. Allow the webcam for this site and try again.'
      : `Could not start the eye tracker: ${message}`
    setScreen('error')
  } finally {
    starting = false
  }
}

btnCalibrate.addEventListener('click', () => {
  void bootAnd('calibrate')
})
btnSaved.addEventListener('click', () => {
  void bootAnd('saved')
})
btnStartRound.addEventListener('click', startRound)
btnRecalibrate.addEventListener('click', () => {
  void bootAnd('calibrate')
})
btnRecalibrate2.addEventListener('click', () => {
  void bootAnd('calibrate')
})
btnReplay.addEventListener('click', startRound)
btnRetry.addEventListener('click', () => {
  setScreen('start')
})

window.addEventListener('keydown', (event) => {
  if (event.code === 'Space') {
    event.preventDefault()
    if (!event.repeat && screen === 'play' && gazePx && aimUsable && !geomMismatch && performance.now() - lastAimAt < 200) {
      game.fire(gazePx, performance.now())
    }
  }
  if (event.code === 'Enter' && (screen === 'check' || screen === 'diagnose-results')) {
    startRound()
  }
  if (event.code === 'KeyD' && (screen === 'check' || screen === 'results' || screen === 'ready')) {
    beginDiagnose()
  }
  if (event.code === 'KeyR' && (screen === 'results' || screen === 'play')) {
    startRound()
  }
  if (event.code === 'KeyC' && trackerReady && screen !== 'loading') {
    void bootAnd('calibrate')
  }
})

canvas.addEventListener('click', (event) => {
  if (screen === 'check' || screen === 'play') {
    correctGaze(event.clientX, event.clientY)
  }
})

window.addEventListener('resize', refreshGeometry)
window.visualViewport?.addEventListener('resize', refreshGeometry)
document.addEventListener('fullscreenchange', refreshGeometry)

function loop(now: number): void {
  resizeCanvas(canvas)
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    requestAnimationFrame(loop)
    return
  }

  refreshGeometry()
  const { width, height } = cssSize()
  const frame = trackerReady ? tracker.update(now) : emptyFrame(now)

  const fresh = frame.timestamp > lastProcessedAt
  const blinkShot = blink.update(frame)
  const blinking = blink.isHolding(now)

  let warped: Point | null = null
  if (fresh && frame.faceFound && !document.hidden && frame.features && estimator.isReady() && !blinking) {
    const predicted = predictFull(frame.features, frame.pose)
    lastFeatures = frame.features
    lastCorrectedNorm = predicted
    warped = predicted ? logger.apply(frame.features, predicted) : null
    lastPredictedNorm = warped
    lastAimAt = frame.timestamp
  } else if (!blinking && lastPredictedNorm && frame.faceFound) {
    warped = lastPredictedNorm
  }

  const filt = filter.update(warped, frame.timestamp, {
    quality: frame.quality,
    blinking,
    faceFound: frame.faceFound && !document.hidden,
  })

  if (!frame.faceFound || document.hidden) {
    blink.reset()
    gazePx = null
    lastFeatures = null
    lastPredictedNorm = null
    aimUsable = false
  } else {
    gazePx = toPixels(filt.point)
    aimUsable = filt.available && !geomMismatch
  }

  if (fresh && aimUsable) blink.pushGaze(gazePx, frame.timestamp)
  lastProcessedAt = frame.timestamp

  const predictForSession = (features: number[]) => predictFull(features, frame.pose)

  if (screen === 'calibrate' && session) {
    const done = session.tick(frame, now, { width, height }, estimator, blinking)
    drawCalibration(ctx, width, height, session.progress(), frame.faceFound)
    if (done) {
      try {
        estimator.fit()
        beginHeadCalibration()
      } catch (err) {
        errorText.textContent = err instanceof Error ? err.message : 'Calibration failed. Try again in better light.'
        setScreen('error')
      }
    }
  } else if (screen === 'calibrate-head' && session) {
    const done = session.tick(frame, now, { width, height }, estimator, blinking, predictForSession)
    drawCalibration(ctx, width, height, session.progress(), frame.faceFound)
    if (done) {
      poseCorrector.fit()
      beginValidation()
    }
  } else if (screen === 'validate' && session) {
    const done = session.tick(frame, now, { width, height }, estimator, blinking, predictForSession)
    drawCalibration(ctx, width, height, session.progress(), frame.faceFound)
    if (done) {
      meanErrorPx = session.meanErrorPx()
      if (meanErrorPx > Math.min(width, height) * 0.25) {
        errorText.textContent = `Calibration error is ${Math.round(meanErrorPx)} pixels. Keep lighting even and calibrate again.`
        setScreen('error')
      } else {
        persistCalibration()
        beginCheck()
      }
    }
  } else if ((screen === 'diagnose' || screen === 'diagnose-head') && session) {
    const target = session.currentDot()
    if (target) {
      diagRows.push({
        t: now,
        target,
        raw: lastRawNorm,
        corrected: lastCorrectedNorm,
        filtered: filt.filtered,
        pose: frame.pose,
        status: filt.status,
        headTrial: screen === 'diagnose-head',
      })
    }
    const done = session.tick(frame, now, { width, height }, estimator, blinking, predictForSession)
    drawCalibration(ctx, width, height, session.progress(), frame.faceFound)
    if (done && screen === 'diagnose') {
      session = new CalibrationSession('diagnose-head', performance.now(), poseCorrector)
      setScreen('diagnose-head')
    } else if (done) {
      diagMetrics = computeMetrics(diagRows, { width, height })
      setScreen('diagnose-results')
    }
  } else if (screen === 'diagnose-results' && diagMetrics) {
    drawDiagnoseResults(ctx, width, height, diagMetrics)
  } else if (screen === 'check') {
    drawCheck(ctx, width, height, gazePx, frame.faceFound, logger.entries(), meanErrorPx)
  } else if (screen === 'play') {
    if (blinkShot && fireMode === 'blink' && !document.hidden && aimUsable) game.fire(blinkShot, now)
    game.resize(width, height)
    game.update(now, aimUsable ? gazePx : null)
    drawGame(ctx, width, height, game, gazePx, now, frame.faceFound, logger.count())
    if (game.ended) showResults()
  } else {
    drawIdle(ctx, width, height, estimator.isReady() ? gazePx : null, frame.faceFound)
  }

  if (geomMismatch) drawGeomWarn(ctx, width, height)

  requestAnimationFrame(loop)
}

refreshSavedButton()
window.addEventListener('pagehide', () => {
  tracker.stop()
  trackerReady = false
  aimUsable = false
})
window.addEventListener('pageshow', (event) => {
  if (event.persisted) setScreen('start')
})
window.addEventListener('visibilitychange', () => {
  blink.reset()
  filter.reset()
  aimUsable = false
  gazePx = null
})
setScreen('start')
resizeCanvas(canvas)
requestAnimationFrame(loop)
