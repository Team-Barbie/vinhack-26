import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import { extractHeadPose, poseQuality } from './pose'
import type { TrackerFrame } from './types'

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'

const WASM_URLS = [
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm',
  'https://unpkg.com/@mediapipe/tasks-vision@1.0.1/wasm',
]

const LM = {
  rightOuter: 33,
  rightInner: 133,
  rightUpper: 159,
  rightLower: 145,
  leftOuter: 263,
  leftInner: 362,
  leftUpper: 386,
  leftLower: 374,
}

const RIGHT_IRIS = [468, 469, 470, 471, 472]
const LEFT_IRIS = [473, 474, 475, 476, 477]

type Landmark = { x: number; y: number; z?: number }
type Vec = { x: number; y: number }

function toPx(lm: Landmark, vw: number, vh: number): Vec {
  return { x: lm.x * vw, y: lm.y * vh }
}

function avgIris(landmarks: Landmark[], idxs: number[], vw: number, vh: number): Vec {
  let x = 0
  let y = 0
  let n = 0
  for (const i of idxs) {
    const p = landmarks[i]
    if (!p) continue
    x += p.x * vw
    y += p.y * vh
    n += 1
  }
  return { x: x / (n || 1), y: y / (n || 1) }
}

export function irisInEye(
  landmarks: Landmark[],
  irisIdxs: number[],
  inner: number,
  outer: number,
  vw: number,
  vh: number,
): [number, number] {
  const iris = avgIris(landmarks, irisIdxs, vw, vh)
  const innerP = toPx(landmarks[inner], vw, vh)
  const outerP = toPx(landmarks[outer], vw, vh)
  // Canthi stay put when you look up/down. Eyelids do not — using them as the
  // Y origin/scale cancels vertical gaze (the old "left/right works" bug).
  const origin = {
    x: (innerP.x + outerP.x) / 2,
    y: (innerP.y + outerP.y) / 2,
  }

  let axisX = { x: innerP.x - outerP.x, y: innerP.y - outerP.y }
  const eyeW = Math.hypot(axisX.x, axisX.y) || 1
  axisX = { x: axisX.x / eyeW, y: axisX.y / eyeW }
  // Both eyes must use the same image-space direction before averaging.
  if (axisX.x < 0) axisX = { x: -axisX.x, y: -axisX.y }

  let axisY = { x: -axisX.y, y: axisX.x }
  if (axisY.y < 0) {
    axisY = { x: -axisY.x, y: -axisY.y }
  }

  const v = { x: iris.x - origin.x, y: iris.y - origin.y }
  return [
    (v.x * axisX.x + v.y * axisX.y) / eyeW,
    (v.x * axisY.x + v.y * axisY.y) / eyeW,
  ]
}

function dist(a: Landmark, b: Landmark, vw: number, vh: number): number {
  return Math.hypot((a.x - b.x) * vw, (a.y - b.y) * vh)
}

function eyeAspectRatio(
  landmarks: Landmark[],
  upper: number,
  lower: number,
  inner: number,
  outer: number,
  vw: number,
  vh: number,
): number {
  return (
    dist(landmarks[upper], landmarks[lower], vw, vh) /
    (dist(landmarks[inner], landmarks[outer], vw, vh) || 1e-6)
  )
}

function earToBlink(ear: number): number {
  const open = 0.28
  const closed = 0.12
  return Math.min(1, Math.max(0, (open - ear) / (open - closed)))
}

function blendScore(
  categories: { categoryName: string; score: number }[] | undefined,
  name: string,
): number | null {
  if (!categories) return null
  const want = name.toLowerCase()
  const hit = categories.find((c) => c.categoryName.toLowerCase() === want)
  return hit ? hit.score : null
}

function extractFeatures(landmarks: Landmark[], vw: number, vh: number): number[] | null {
  if (landmarks.length < 478) return null
  const [rnx, rny] = irisInEye(landmarks, RIGHT_IRIS, LM.rightInner, LM.rightOuter, vw, vh)
  const [lnx, lny] = irisInEye(landmarks, LEFT_IRIS, LM.leftInner, LM.leftOuter, vw, vh)
  return [lnx, lny, rnx, rny]
}

export class FaceTracker {
  private landmarker: FaceLandmarker | null = null
  private lastTimestamp = -1
  private lastVideoTime = -1
  private stream: MediaStream | null = null
  private video: HTMLVideoElement
  private lastFrame: TrackerFrame = emptyFrame(0)

  constructor(video: HTMLVideoElement) {
    this.video = video
  }

  cameraSize(): { width: number; height: number } {
    return { width: this.video.videoWidth || 0, height: this.video.videoHeight || 0 }
  }

  async start(): Promise<void> {
    this.stop()
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
        },
      })
      this.video.srcObject = this.stream
      this.video.muted = true
      this.video.playsInline = true
      await this.video.play()

      let fileset: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>> | null = null
      let lastError: unknown
      for (const url of WASM_URLS) {
        try {
          fileset = await FilesetResolver.forVisionTasks(url)
          break
        } catch (err) {
          lastError = err
        }
      }
      if (!fileset) {
        throw lastError instanceof Error ? lastError : new Error('Failed to load MediaPipe wasm')
      }

      const options = {
        runningMode: 'VIDEO' as const,
        numFaces: 1,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
        baseOptions: {
          modelAssetPath: `${import.meta.env.BASE_URL}models/face_landmarker.task`,
          delegate: 'GPU' as const,
        },
      }

      try {
        this.landmarker = await FaceLandmarker.createFromOptions(fileset, options)
      } catch {
        try {
          this.landmarker = await FaceLandmarker.createFromOptions(fileset, {
            ...options, baseOptions: { ...options.baseOptions, delegate: 'CPU' },
          })
        } catch {
          this.landmarker = await FaceLandmarker.createFromOptions(fileset, {
            ...options, baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
          })
        }
      }
    } catch (error) {
      this.stop()
      throw error
    }
  }

  update(now: number): TrackerFrame {
    const empty = emptyFrame(now)
    if (!this.landmarker || this.video.readyState < 2) return empty

    if (this.video.currentTime === this.lastVideoTime) {
      return now - this.lastFrame.timestamp > 200 ? empty : this.lastFrame
    }
    this.lastVideoTime = this.video.currentTime

    let ts = now
    if (ts <= this.lastTimestamp) ts = this.lastTimestamp + 1
    this.lastTimestamp = ts

    let result
    try {
      result = this.landmarker.detectForVideo(this.video, ts)
    } catch {
      this.lastFrame = empty
      return empty
    }
    const landmarks = result.faceLandmarks[0]
    if (!landmarks || landmarks.length < 478) {
      this.lastFrame = empty
      return empty
    }

    const vw = this.video.videoWidth || 1280
    const vh = this.video.videoHeight || 720
    const features = extractFeatures(landmarks, vw, vh)
    const pose = extractHeadPose(landmarks, result.facialTransformationMatrixes?.[0], vw, vh)
    const iodOk = pose.dist > 0.035 && pose.dist < 0.35

    const categories = result.faceBlendshapes[0]?.categories
    const earL = earToBlink(
      eyeAspectRatio(landmarks, LM.leftUpper, LM.leftLower, LM.leftInner, LM.leftOuter, vw, vh),
    )
    const earR = earToBlink(
      eyeAspectRatio(landmarks, LM.rightUpper, LM.rightLower, LM.rightInner, LM.rightOuter, vw, vh),
    )
    const blinkL = Math.max(blendScore(categories, 'eyeBlinkLeft') ?? 0, earL)
    const blinkR = Math.max(blendScore(categories, 'eyeBlinkRight') ?? 0, earR)
    const quality = poseQuality(pose, Math.max(blinkL, blinkR), iodOk && Boolean(features?.every(Number.isFinite)))

    this.lastFrame = {
      features,
      pose,
      quality,
      blinkL,
      blinkR,
      faceFound: Boolean(features?.every(Number.isFinite)),
      timestamp: ts,
      cameraWidth: vw,
      cameraHeight: vh,
    }
    return this.lastFrame
  }

  stop(): void {
    this.landmarker?.close()
    this.landmarker = null
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    this.video.srcObject = null
    this.lastTimestamp = -1
    this.lastVideoTime = -1
    this.lastFrame = emptyFrame(0)
  }
}

function emptyFrame(timestamp: number): TrackerFrame {
  return {
    features: null,
    pose: null,
    quality: 0,
    blinkL: 0,
    blinkR: 0,
    faceFound: false,
    timestamp,
    cameraWidth: 0,
    cameraHeight: 0,
  }
}
