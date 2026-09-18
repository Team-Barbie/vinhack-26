import { useCallback, useEffect, useRef, useState } from 'react'
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import { BlinkDetector, GazeTracker, mapGaze, type CalibrationModel, type Vec2 } from '../lib/eyeTracking'
import { OneEuro2D } from '../lib/oneEuro'

// Pinned to the installed @mediapipe/tasks-vision version; bump both together.
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm'
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
const STORAGE_KEY = 'gazebridge.calibration'

export type TrackerStatus = 'loading' | 'ready' | 'error'

export interface GazeSnapshot {
  faceFound: boolean
  eyesClosed: boolean
  gaze: Vec2 | null
  screen: { x: number; y: number } | null
}

let landmarkerPromise: Promise<FaceLandmarker> | null = null

async function createLandmarker(): Promise<FaceLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks(WASM_URL)
  const options = (delegate: 'GPU' | 'CPU') => ({
    baseOptions: { modelAssetPath: MODEL_URL, delegate },
    runningMode: 'VIDEO' as const,
    numFaces: 1,
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

function loadStoredModel(): CalibrationModel | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as CalibrationModel) : null
  } catch {
    return null
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

export function useEyeTracker() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [status, setStatus] = useState<TrackerStatus>('loading')
  const [error, setError] = useState('')
  const [faceFound, setFaceFound] = useState(false)
  const snapshotRef = useRef<GazeSnapshot>({ faceFound: false, eyesClosed: false, gaze: null, screen: null })
  const [storedModel] = useState(loadStoredModel)
  const modelRef = useRef<CalibrationModel | null>(storedModel)
  const [calibrated, setCalibrated] = useState(storedModel !== null)
  const smootherRef = useRef(new OneEuro2D())
  const blinkListeners = useRef(new Set<() => void>())

  useEffect(() => {
    let cancelled = false
    let raf = 0
    let stream: MediaStream | null = null
    const tracker = new GazeTracker()
    const blink = new BlinkDetector()

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        })
        if (cancelled) return
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play()
        const landmarker = await getLandmarker()
        if (cancelled) return
        setStatus('ready')

        let lastVideoTime = -1
        let lastFace = false
        const loop = () => {
          raf = requestAnimationFrame(loop)
          if (video.readyState < 2 || video.currentTime === lastVideoTime) return
          lastVideoTime = video.currentTime

          const now = performance.now()
          const frame = tracker.update(landmarker.detectForVideo(video, now))
          if (frame.faceFound !== lastFace) {
            lastFace = frame.faceFound
            setFaceFound(frame.faceFound)
          }

          // Cursor freezes while the face is lost or the eyes are closed, so a
          // blink never drags the crosshair off the target it is confirming.
          let screen = snapshotRef.current.screen
          const model = modelRef.current
          if (frame.faceFound && frame.gaze && model && !frame.bothClosed) {
            const [nx, ny] = mapGaze(model, frame.gaze)
            const [sx, sy] = smootherRef.current.filter(nx * window.innerWidth, ny * window.innerHeight, now)
            screen = { x: sx, y: sy }
          }
          snapshotRef.current = { faceFound: frame.faceFound, eyesClosed: frame.bothClosed, gaze: frame.gaze, screen }

          if (blink.update(frame, now)) blinkListeners.current.forEach((fn) => fn())
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
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  const setCalibration = useCallback((model: CalibrationModel | null) => {
    modelRef.current = model
    smootherRef.current.reset()
    snapshotRef.current = { ...snapshotRef.current, screen: null }
    setCalibrated(model !== null)
    try {
      if (model) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(model))
      else sessionStorage.removeItem(STORAGE_KEY)
    } catch {
      // Storage can be unavailable (private mode); calibration still works for this visit.
    }
  }, [])

  const onBlink = useCallback((fn: () => void) => {
    blinkListeners.current.add(fn)
    return () => {
      blinkListeners.current.delete(fn)
    }
  }, [])

  return { videoRef, status, error, faceFound, calibrated, snapshotRef, modelRef, setCalibration, onBlink }
}

export type EyeTracker = ReturnType<typeof useEyeTracker>
