import type { ScreenGeometry } from './types'

export function captureGeometry(video?: HTMLVideoElement | null): ScreenGeometry {
  const vv = window.visualViewport
  return {
    cssWidth: window.innerWidth,
    cssHeight: window.innerHeight,
    dpr: window.devicePixelRatio || 1,
    fullscreen: Boolean(document.fullscreenElement),
    cameraWidth: video?.videoWidth || 0,
    cameraHeight: video?.videoHeight || 0,
    scale: vv?.scale ?? 1,
  }
}

export function geometryMatches(a: ScreenGeometry | null | undefined, b: ScreenGeometry): boolean {
  if (!a) return false
  const sizeOk =
    Math.abs(a.cssWidth - b.cssWidth) / Math.max(a.cssWidth, 1) < 0.04 &&
    Math.abs(a.cssHeight - b.cssHeight) / Math.max(a.cssHeight, 1) < 0.04
  const dprOk = Math.abs(a.dpr - b.dpr) < 0.08
  const scaleOk = Math.abs(a.scale - b.scale) < 0.08
  const fullOk = a.fullscreen === b.fullscreen
  return sizeOk && dprOk && scaleOk && fullOk
}

export async function requestFullscreen(): Promise<boolean> {
  const el = document.documentElement
  if (document.fullscreenElement) return true
  try {
    await el.requestFullscreen()
    return true
  } catch {
    return false
  }
}
