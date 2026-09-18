export type Point = {
  x: number
  y: number
}

export type HeadPose = {
  yaw: number
  pitch: number
  roll: number
  dist: number
  faceX: number
  faceY: number
}

export type ScreenGeometry = {
  cssWidth: number
  cssHeight: number
  dpr: number
  fullscreen: boolean
  cameraWidth: number
  cameraHeight: number
  scale: number
}

export type TrackerFrame = {
  features: number[] | null
  pose: HeadPose | null
  quality: number
  blinkL: number
  blinkR: number
  faceFound: boolean
  timestamp: number
  cameraWidth: number
  cameraHeight: number
}

export type FireMode = 'blink' | 'dwell'

export type ScreenId =
  | 'start'
  | 'loading'
  | 'calibrate'
  | 'calibrate-head'
  | 'validate'
  | 'check'
  | 'ready'
  | 'play'
  | 'results'
  | 'error'
  | 'diagnose'
  | 'diagnose-head'
  | 'diagnose-results'

export type FilterStatus = 'fixation' | 'saccade' | 'blink' | 'lost' | 'reacquire'

export type RoundResults = {
  hits: number
  misses: number
  accuracy: number
  avgTtkMs: number
  durationMs: number
}

export type DiagnosticMetrics = {
  positionErrorPx: number
  positionErrorNorm: number
  jitterNorm: number
  delayMs: number
  driftNorm: number
  unseenErrorPx: number
  headMoveErrorPx: number
  samples: number
}
