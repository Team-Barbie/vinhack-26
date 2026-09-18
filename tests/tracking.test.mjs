import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FaceTracker, irisInEye } from '../src/tracker.ts'
import { GazeSmoother, RidgeGazeEstimator } from '../src/gaze.ts'
import { CalibrationSession } from '../src/calibration.ts'
import { BlinkDetector } from '../src/blink.ts'
import { Game } from '../src/game.ts'
import { LookLogger } from '../src/log.ts'

const frame = (timestamp, score = 0, faceFound = true) => ({
  timestamp, blinkL: score, blinkR: score, faceFound, features: [0.1, 0.1, 0.1, 0.1],
})

test('opposite anatomical eye axes produce matching horizontal features', () => {
  const landmarks = [{ x: 0.4, y: 0.5 }, { x: 0.6, y: 0.5 }, { x: 0.53, y: 0.52 }]
  const right = irisInEye(landmarks, [2], 1, 0, 1280, 720)
  const left = irisInEye(landmarks, [2], 0, 1, 1280, 720)
  assert.deepEqual(left, right)
  assert.ok(left[0] > 0)
})

test('duplicate camera frames keep their timestamp and stalled cameras expire', () => {
  const video = { readyState: 2, currentTime: 1 }
  const tracker = new FaceTracker(video)
  tracker.landmarker = {}
  tracker.lastVideoTime = 1
  tracker.lastFrame = frame(100)
  assert.equal(tracker.update(116).timestamp, 100)
  assert.equal(tracker.update(301).faceFound, false)
  video.currentTime = 2
  assert.equal(tracker.update(320).faceFound, false) // inference failure
})

test('calibration counts unique samples and cannot skip a missing point', () => {
  const session = new CalibrationSession('calibrate', 0)
  const estimator = new RidgeGazeEstimator()
  session.tick(frame(1000), 1000, { width: 1000, height: 800 }, estimator, false)
  for (let i = 0; i < 30; i++) session.tick(frame(1033), 1033 + i, { width: 1000, height: 800 }, estimator, false)
  assert.equal(session.collected, 1)
  session.tick(frame(6000, 0, false), 6000, { width: 1000, height: 800 }, estimator, false)
  assert.equal(session.index, 0)
  assert.equal(session.collected, 0)
  assert.equal(estimator.sampleCount(), 0)
  session.tick(frame(7000), 7000, { width: 1000, height: 800 }, estimator, false)
  for (let i = 1; i <= 24; i++) session.tick(frame(7000 + i * 34), 7000 + i * 34, { width: 1000, height: 800 }, estimator, false)
  assert.equal(session.index, 1)
  assert.equal(estimator.sampleCount(), 24)
})

test('unstable fixations are retried without contaminating the estimator', () => {
  const session = new CalibrationSession('calibrate', 0)
  const estimator = new RidgeGazeEstimator()
  session.tick(frame(1000), 1000, { width: 1000, height: 800 }, estimator, false)
  for (let i = 1; i <= 24; i++) {
    const sample = frame(1000 + i * 34)
    sample.features = Array(4).fill(i % 2 ? 0.1 : -0.1)
    session.tick(sample, sample.timestamp, { width: 1000, height: 800 }, estimator, false)
  }
  assert.equal(session.index, 0)
  assert.equal(session.phase, 'settle')
  assert.equal(estimator.sampleCount(), 0)
})

test('estimator fits held-out positions and rejects incompatible calibration', () => {
  const est = new RidgeGazeEstimator()
  for (const x of [0.04, 0.5, 0.96]) for (const y of [0.04, 0.35, 0.65, 0.96]) {
    for (let i = 0; i < 24; i++) est.addSample([x * 0.1, y * 0.06, x * 0.12, y * 0.07], { x, y })
  }
  est.fit()
  const p = est.predict([0.03, 0.042, 0.036, 0.049])
  assert.ok(Math.abs(p.x - 0.3) < 0.025)
  assert.ok(Math.abs(p.y - 0.7) < 0.025)
  assert.deepEqual(RidgeGazeEstimator.fromJSON(est.toJSON()).predict([0.03, 0.042, 0.036, 0.049]), p)
  assert.throws(() => RidgeGazeEstimator.fromJSON(est.toJSON().replace('"version":7', '"version":6')))
  assert.equal(est.predict([NaN, 0, 0, 0]), null)
})

test('smoothing suppresses fixation noise and follows a gaze jump within 170ms', () => {
  const smoother = new GazeSmoother()
  let rawEnergy = 0, smoothedEnergy = 0
  for (let i = 0; i < 90; i++) {
    const noise = i % 2 ? 0.015 : -0.015
    const p = smoother.update({ x: 0.5 + noise, y: 0.5 }, i * 1000 / 30, false)
    if (i > 15) { rawEnergy += noise ** 2; smoothedEnergy += (p.x - 0.5) ** 2 }
  }
  assert.ok(smoothedEnergy < rawEnergy * 0.4)
  let p
  for (let i = 90; i < 95; i++) p = smoother.update({ x: 0.85, y: 0.5 }, i * 1000 / 30, false)
  assert.ok(p.x > 0.8, `cursor only reached ${p.x}`)
  assert.deepEqual(smoother.update({ x: 0, y: 0 }, 94 * 1000 / 30, false), p)
  assert.deepEqual(smoother.update({ x: 0.2, y: 0.2 }, 4000, false), { x: 0.2, y: 0.2 })
})

function prepareBlink() {
  const blink = new BlinkDetector()
  for (let t = 0; t <= 150; t += 30) {
    blink.update(frame(t))
    blink.pushGaze({ x: 300, y: 200 }, t)
  }
  return blink
}

test('blink fires once on reopening at pre-blink aim', () => {
  const blink = prepareBlink()
  assert.equal(blink.update(frame(180, 0.9)), null)
  blink.pushGaze({ x: 900, y: 900 }, 180)
  assert.equal(blink.update(frame(210, 0.9)), null)
  assert.deepEqual(blink.update(frame(270)), { x: 300, y: 200 })
  assert.equal(blink.update(frame(270)), null)
  assert.equal(blink.update(frame(300)), null)
})

test('long closures and face loss never produce blink shots', () => {
  const blink = prepareBlink()
  for (let t = 180; t <= 780; t += 30) assert.equal(blink.update(frame(t, 0.9)), null)
  assert.equal(blink.update(frame(810)), null)
  blink.update(frame(900, 0.9))
  blink.update(frame(930, 0, false))
  assert.equal(blink.update(frame(960)), null)
})

test('dwell progress resets without usable gaze; expired rounds reject shots', () => {
  const game = new Game({ fireMode: 'dwell', targetCount: 1 })
  game.start(100, 1000, 800)
  const p = { x: game.targets[0].x, y: game.targets[0].y }
  for (let t = 130; t <= 580; t += 30) game.update(t, p)
  assert.ok(game.targets[0].dwellMs > 0)
  game.update(610, null)
  assert.equal(game.targets[0].dwellMs, 0)
  assert.equal(game.fire(p, 60100), false)
  assert.equal(game.hits, 0)
})

test('correction fades continuously to zero near its feature boundary', () => {
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} }
  const logger = new LookLogger()
  logger.record([0, 0, 0, 0], { x: 0.5, y: 0.5 }, { x: 0.58, y: 0.5 })
  const center = logger.apply([0, 0, 0, 0], { x: 0.5, y: 0.5 })
  const edge = logger.apply([0.01799, 0, 0.01799, 0], { x: 0.5, y: 0.5 })
  assert.ok(center.x > 0.57)
  assert.ok(Math.abs(edge.x - 0.5) < 0.0001)
})
