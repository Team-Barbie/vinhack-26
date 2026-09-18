import './style.css'
import { BlinkDetector } from './blink'
import {
  CalibrationSession,
  loadCalibration,
  saveCalibration,
  targetRadiusFromError,
} from './calibration'
import { GazeSmoother, RidgeGazeEstimator } from './gaze'
import { Game } from './game'
import { LookLogger } from './log'
import { drawCalibration, drawCheck, drawGame, drawIdle, resizeCanvas } from './render'
import { FaceTracker } from './tracker'
import type { FireMode, Point, ScreenId } from './types'

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
const smoother = new GazeSmoother()
const logger = new LookLogger()
const game = new Game()

let screen: ScreenId = 'start'
let estimator = new RidgeGazeEstimator()
let session: CalibrationSession | null = null
let fireMode: FireMode = 'blink'
let meanErrorPx = 90
let gazePx: Point | null = null
let lastFeatures: number[] | null = null
let lastPredictedNorm: Point | null = null
let starting = false
let trackerReady = false

function cssSize(): { width: number; height: number } {
  return { width: window.innerWidth, height: window.innerHeight }
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

function beginCalibration(): void {
  estimator = new RidgeGazeEstimator()
  session = new CalibrationSession('calibrate', performance.now())
  logger.clear()
  smoother.reset()
  gazePx = null
  lastFeatures = null
  lastPredictedNorm = null
  setScreen('calibrate')
}

function beginCheck(): void {
  smoother.setPlayMode(false)
  setScreen('check')
}

function persistCalibration(): void {
  const { width, height } = cssSize()
  const meanErrorNorm = meanErrorPx / Math.hypot(width, height)
  try {
    saveCalibration({
      estimator: estimator.toJSON(),
      meanErrorNorm,
      savedAt: Date.now(),
    })
    refreshSavedButton()
  } catch {
    /* ignore quota */
  }
}

function correctGaze(clientX: number, clientY: number): void {
  if (!lastFeatures || !lastPredictedNorm || !estimator.isReady()) return
  const { width, height } = cssSize()
  logger.record(lastFeatures, lastPredictedNorm, { x: clientX / width, y: clientY / height })
}

function startRound(): void {
  const { width, height } = cssSize()
  game.config.fireMode = fireMode
  game.config.radius = radiusNow()
  game.start(performance.now(), width, height)
  smoother.setPlayMode(true)
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
  if (!saved) {
    beginCalibration()
    return
  }
  try {
    estimator = RidgeGazeEstimator.fromJSON(saved.estimator)
  } catch {
    beginCalibration()
    return
  }
  const { width, height } = cssSize()
  meanErrorPx = saved.meanErrorNorm * Math.hypot(width, height)
  beginCheck()
}

async function bootAnd(action: 'calibrate' | 'saved'): Promise<void> {
  if (starting) return
  starting = true
  fireMode = selectedFireMode()
  try {
    await ensureTracker()
    if (action === 'saved') useSavedCalibration()
    else beginCalibration()
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
    if (screen === 'play' && gazePx) {
      game.fire(gazePx, performance.now())
    }
  }
  if (event.code === 'Enter' && screen === 'check') {
    startRound()
  }
  if (event.code === 'KeyR' && (screen === 'results' || screen === 'play')) {
    startRound()
  }
  if (event.code === 'KeyC' && (screen === 'results' || screen === 'ready' || screen === 'play' || screen === 'check')) {
    void bootAnd('calibrate')
  }
})

canvas.addEventListener('click', (event) => {
  if (screen === 'check' || screen === 'play') {
    correctGaze(event.clientX, event.clientY)
  }
})

function loop(now: number): void {
  resizeCanvas(canvas)
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    requestAnimationFrame(loop)
    return
  }

  const { width, height } = cssSize()
  const frame = trackerReady ? tracker.update(now) : {
    features: null,
    blinkL: 0,
    blinkR: 0,
    faceFound: false,
    timestamp: now,
  }

  if (frame.faceFound && frame.features) lastFeatures = frame.features

  const blinkShot = fireMode === 'blink' ? blink.update(frame) : blink.update({
    ...frame,
    blinkL: 0,
    blinkR: 0,
  })
  const eyesUnreliable = !frame.faceFound || blink.isHolding(now)
  if (frame.features && estimator.isReady() && !eyesUnreliable) {
    const predicted = estimator.predict(frame.features)
    lastPredictedNorm = predicted
    const warped = predicted ? logger.apply(frame.features, predicted) : null
    gazePx = toPixels(smoother.update(warped, now, false))
  } else {
    gazePx = toPixels(smoother.update(null, now, true))
  }

  blink.pushGaze(gazePx, now)

  if (screen === 'calibrate' && session) {
    const done = session.tick(frame, now, { width, height }, estimator, blink.isClosed())
    drawCalibration(ctx, width, height, session.progress(), frame.faceFound)
    if (done) {
      try {
        estimator.fit()
        meanErrorPx = 90
        persistCalibration()
        beginCheck()
      } catch (err) {
        errorText.textContent = err instanceof Error ? err.message : 'Calibration failed. Try again in better light.'
        setScreen('error')
      }
    }
  } else if (screen === 'validate' && session) {
    const done = session.tick(frame, now, { width, height }, estimator, blink.isClosed())
    drawCalibration(ctx, width, height, session.progress(), frame.faceFound)
    if (done) beginCheck()
  } else if (screen === 'check') {
    drawCheck(ctx, width, height, gazePx, frame.faceFound, logger.entries())
  } else if (screen === 'play') {
    if (blinkShot) game.fire(blinkShot, now)
    game.update(now, gazePx)
    drawGame(ctx, width, height, game, gazePx, now, frame.faceFound, logger.count())
    if (game.ended) showResults()
  } else {
    drawIdle(ctx, width, height, estimator.isReady() ? gazePx : null, frame.faceFound)
  }

  requestAnimationFrame(loop)
}

refreshSavedButton()
setScreen('start')
resizeCanvas(canvas)
requestAnimationFrame(loop)
