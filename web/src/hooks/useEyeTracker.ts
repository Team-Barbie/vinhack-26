import { useCallback, useEffect, useRef, useState } from 'react'
import { FaceLandmarker, FilesetResolver, type NormalizedLandmark } from '@mediapipe/tasks-vision'
import { BlinkDetector } from '../lib/blink'
import { profileValid, type RemoteProfile } from '../lib/eyeRemote'
import { GazeTracker, mapGaze, type CalibrationModel, type Vec2 } from '../lib/eyeTracking'
import { GazeFilter } from '../lib/gazeFilter'

// Pinned to the installed @mediapipe/tasks-vision version; bump both together.
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm'
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
// Calibration is done once and kept across visits, so it lives in localStorage.
const MODEL_KEY = 'gazebridge.calibration.v3'
const REMOTE_KEY = 'gazebridge.remote.v1'

export type TrackerStatus = 'loading' | 'ready' | 'error'

export interface GazeSnapshot {
  blinkL?: number
  blinkR?: number
  detectedFace?: boolean
  faceFound: boolean
  eyesClosed: boolean
  gaze: Vec2 | null
  features: number[] | null
  screen: { x: number; y: number } | null
  at: number
}

let landmarkerPromise: Promise<FaceLandmarker> | null = null

async function createLandmarker(): Promise<FaceLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks(WASM_URL)
  const options = (delegate: 'GPU' | 'CPU') => ({
    baseOptions: { modelAssetPath: MODEL_URL, delegate },
    runningMode: 'VIDEO' as const,
    numFaces: 3,
    outputFaceBlendshapes: true,
  })
  try {
    return await FaceLandmarker.createFromOptions(fileset, options('GPU'))
  } catch {
    return FaceLandmarker.createFromOptions(fileset, options('CPU'))
  }
}

function getLandmarker(): Promise<FaceLandmarker> {
  landmarkerPromise ??= createLandmarker().catch((err) => {
    landmarkerPromise = null
    throw err
  })
  return landmarkerPromise
}

function primaryFaceIndex(faces: readonly NormalizedLandmark[][]): number {
  let bestIndex = 0
  let bestScore = -Infinity
  faces.forEach((landmarks, index) => {
    if (landmarks.length === 0) return
    let minX = 1
    let minY = 1
    let maxX = 0
    let maxY = 0
    for (const point of landmarks) {
      minX = Math.min(minX, point.x)
      minY = Math.min(minY, point.y)
      maxX = Math.max(maxX, point.x)
      maxY = Math.max(maxY, point.y)
    }
    const area = (maxX - minX) * (maxY - minY)
    const centerDistance = Math.hypot((minX + maxX) / 2 - 0.5, (minY + maxY) / 2 - 0.5)
    const score = area - centerDistance * 0.08
    if (score > bestScore) {
      bestScore = score
      bestIndex = index
    }
  })
  return bestIndex
}

function readStored<T>(key: string, valid: (value: T) => boolean): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const value = JSON.parse(raw) as T
    return value && valid(value) ? value : null
  } catch {
    return null
  }
}

function writeStored(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage can be unavailable (private mode); calibration still works until the tab closes.
  }
}

const validModel = (model: CalibrationModel) =>
  model.version === 3 &&
  Array.isArray(model.wx) &&
  Array.isArray(model.yKnots) &&
  Array.isArray(model.means) &&
  Array.isArray(model.stds)

function loadStoredCalibration() {
  return {
    model: readStored<CalibrationModel>(MODEL_KEY, validModel),
    remote: readStored<RemoteProfile>(REMOTE_KEY, profileValid),
  }
}

function describeError(err: unknown): string {
  if (err instanceof DOMException) {
    if (err.name === 'NotAllowedError') return 'Camera permission was denied. Allow camera access and reload.'
    if (err.name === 'NotFoundError') return 'No camera was found on this device.'
    if (err.name === 'NotReadableError') return 'The camera is in use by another app. Close it and reload.'
  }
  return `Eye tracking could not start: ${err instanceof Error ? err.message : String(err)}`
}

function toPixels(norm: Vec2 | null): { x: number; y: number } | null {
  if (!norm) return null
  return { x: norm[0] * window.innerWidth, y: norm[1] * window.innerHeight }
}

export function useEyeTracker() {
  const videoElementRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const videoRef = useCallback((node: HTMLVideoElement | null) => {
    videoElementRef.current = node
    if (!node || !streamRef.current) return
    node.srcObject = streamRef.current
    void node.play().catch(() => {
      // The startup path reports camera errors; a transient remount can retry
      // automatically when the next preview element is attached.
    })
  }, [])
  const [status, setStatus] = useState<TrackerStatus>('loading')
  const [error, setError] = useState('')
  const [faceFound, setFaceFound] = useState(false)
  const snapshotRef = useRef<GazeSnapshot>({
    faceFound: false,
    eyesClosed: false,
    gaze: null,
    features: null,
    screen: null,
    at: 0,
  })
  const landmarksRef = useRef<NormalizedLandmark[] | null>(null)
  const [stored] = useState(loadStoredCalibration)
  const modelRef = useRef<CalibrationModel | null>(stored.model)
  const [calibrated, setCalibrated] = useState(stored.model !== null)
  const [remoteProfile, setRemoteProfile] = useState<RemoteProfile | null>(stored.remote)
  const filterRef = useRef(new GazeFilter())
  const blinkRef = useRef(new BlinkDetector())
  const blinkListeners = useRef(new Set<() => void>())

  useEffect(() => {
    let cancelled = false
    let raf = 0
    let stream: MediaStream | null = null
    const tracker = new GazeTracker()
    const blink = blinkRef.current
    blink.reset()

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        })
        if (cancelled) return
        streamRef.current = stream
        const attached = videoElementRef.current
        if (attached) {
          attached.srcObject = stream
          await attached.play().catch(() => undefined)
        }
        const landmarker = await getLandmarker()
        if (cancelled) return
        setStatus('ready')

        let lastVideoTime = -1
        let lastVideo: HTMLVideoElement | null = null
        let lastFace = false
        let lastTimestamp = -1
        const loop = () => {
          raf = requestAnimationFrame(loop)
          const video = videoElementRef.current
          if (!video || video.readyState < 2) return
          if (video !== lastVideo) {
            lastVideo = video
            lastVideoTime = -1
            if (streamRef.current && video.srcObject !== streamRef.current) {
              video.srcObject = streamRef.current
              void video.play().catch(() => undefined)
            }
          }
          if (video.currentTime === lastVideoTime) return
          lastVideoTime = video.currentTime

          const now = performance.now()
          let ts = now
          if (ts <= lastTimestamp) ts = lastTimestamp + 1
          lastTimestamp = ts

          let result
          try {
            result = landmarker.detectForVideo(video, ts)
          } catch {
            return
          }
          const faceIndex = primaryFaceIndex(result.faceLandmarks)
          landmarksRef.current = result.faceLandmarks[faceIndex] ?? null
          const vw = video.videoWidth || 1280
          const vh = video.videoHeight || 720
          const frame = tracker.update(result, faceIndex, vw, vh)
          if (frame.faceFound !== lastFace) {
            lastFace = frame.faceFound
            setFaceFound(frame.faceFound)
          }

          const shot = blink.update(frame, ts)
          const blinking = blink.isFrozen(ts)
          const model = modelRef.current
          let predicted: Vec2 | null = null
          if (frame.faceFound && frame.features && model && !blinking) {
            predicted = mapGaze(model, frame.features)
          }
          const filtered = filterRef.current.update(predicted, ts, {
            quality: frame.quality,
            blinking,
            faceFound: frame.faceFound || blinking,
          })
          if (!blinking && filtered) blink.pushGaze(filtered, ts)
          snapshotRef.current = {
            // The remote uses actual blendshapes when available. Fixed EAR
            // thresholds can label naturally narrow, open eyes as closed.
            blinkL: result.faceBlendshapes?.[faceIndex]?.categories.find((c) => c.categoryName === 'eyeBlinkLeft')?.score ?? frame.blinkL,
            blinkR: result.faceBlendshapes?.[faceIndex]?.categories.find((c) => c.categoryName === 'eyeBlinkRight')?.score ?? frame.blinkR,
            detectedFace: frame.faceFound,
            faceFound: frame.faceFound || blinking,
            eyesClosed: blinking,
            gaze: frame.gaze,
            features: frame.features,
            screen: toPixels(filtered),
            at: ts,
          }

          if (shot) blinkListeners.current.forEach((fn) => fn())
        }
        loop()
      } catch (err) {
        if (cancelled) return
        setStatus('error')
        setError(describeError(err))
      }
    }

    void start()
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      landmarksRef.current = null
      streamRef.current = null
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  const saveCalibration = useCallback((model: CalibrationModel | null, remote: RemoteProfile | null) => {
    modelRef.current = model
    filterRef.current.reset()
    blinkRef.current.reset()
    snapshotRef.current = { ...snapshotRef.current, screen: null }
    setCalibrated(model !== null)
    setRemoteProfile(remote)
    writeStored(MODEL_KEY, model)
    writeStored(REMOTE_KEY, remote)
  }, [])

  const onBlink = useCallback((fn: () => void) => {
    blinkListeners.current.add(fn)
    return () => {
      blinkListeners.current.delete(fn)
    }
  }, [])

  return {
    videoRef,
    status,
    error,
    faceFound,
    calibrated,
    remoteProfile,
    snapshotRef,
    landmarksRef,
    modelRef,
    saveCalibration,
    onBlink,
  }
}

export type EyeTracker = ReturnType<typeof useEyeTracker>
