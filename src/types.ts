export type Point = {
  x: number
  y: number
}

export type TrackerFrame = {
  features: number[] | null
  blinkL: number
  blinkR: number
  faceFound: boolean
  timestamp: number
}

export type FireMode = 'blink' | 'dwell'

export type ScreenId =
  | 'start'
  | 'loading'
  | 'calibrate'
  | 'validate'
  | 'check'
  | 'ready'
  | 'play'
  | 'results'
  | 'error'

export type RoundResults = {
  hits: number
  misses: number
  accuracy: number
  avgTtkMs: number
  durationMs: number
}
