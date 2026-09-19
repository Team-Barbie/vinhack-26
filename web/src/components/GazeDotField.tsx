import { useEffect, useRef } from 'react'
import { useEye } from '../hooks/EyeTrackerProvider'

const GAP = 18
const REACTION_RADIUS = 210
const RAW_X_GAIN = 5
const RAW_Y_GAIN = 8

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const smoothstep = (value: number) => {
  const t = clamp(value, 0, 1)
  return t * t * (3 - 2 * t)
}

export default function GazeDotField() {
  const eye = useEye()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const context = canvas.getContext('2d')
    if (!context) return

    let raf = 0
    let width = 0
    let height = 0
    let pointerX = window.innerWidth / 2
    let pointerY = window.innerHeight / 2
    let targetX = pointerX
    let targetY = pointerY
    let energy = 0
    let targetEnergy = 0
    let neutralGaze: [number, number] | null = null
    let lastDraw = 0
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const resize = () => {
      width = canvas.clientWidth
      height = canvas.clientHeight
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
    }

    const updateTarget = (now: number) => {
      const snapshot = eye.snapshotRef.current
      const fresh = now - snapshot.at < 350
      const tracking = fresh && snapshot.faceFound && !snapshot.eyesClosed

      if (!tracking) {
        targetEnergy = 0
        return
      }

      if (snapshot.screen) {
        targetX = snapshot.screen.x
        targetY = snapshot.screen.y
        targetEnergy = 1
        return
      }

      if (!snapshot.gaze?.every(Number.isFinite)) {
        targetEnergy = 0
        return
      }

      if (!neutralGaze) neutralGaze = [...snapshot.gaze]
      const [gazeX, gazeY] = snapshot.gaze
      targetX = clamp(width * (0.5 + (gazeX - neutralGaze[0]) * RAW_X_GAIN), width * 0.06, width * 0.94)
      targetY = clamp(height * (0.5 + (gazeY - neutralGaze[1]) * RAW_Y_GAIN), height * 0.06, height * 0.94)
      neutralGaze[0] += (gazeX - neutralGaze[0]) * 0.002
      neutralGaze[1] += (gazeY - neutralGaze[1]) * 0.002
      targetEnergy = 0.82
    }

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw)
      if (now - lastDraw < 1000 / 45) return
      lastDraw = now
      if (canvas.clientWidth !== width || canvas.clientHeight !== height) resize()

      updateTarget(now)
      const positionEase = reducedMotion ? 1 : 0.13
      pointerX += (targetX - pointerX) * positionEase
      pointerY += (targetY - pointerY) * positionEase
      energy += (targetEnergy - energy) * (targetEnergy > energy ? 0.12 : 0.06)

      context.clearRect(0, 0, width, height)
      for (let y = GAP / 2; y < height; y += GAP) {
        for (let x = GAP / 2; x < width; x += GAP) {
          const distance = Math.hypot(x - pointerX, y - pointerY)
          const influence = energy * smoothstep(1 - distance / REACTION_RADIUS)
          const fieldDistance = Math.hypot((x - width / 2) / (width * 0.34), (y - height * 0.46) / (height * 0.38))
          const resting = 0.2 * smoothstep((fieldDistance - 0.38) / 0.8)
          const radius = 1 + influence * 4.2
          const lift = reducedMotion ? 0 : influence * 12

          context.beginPath()
          context.arc(x, y - lift, radius, 0, Math.PI * 2)
          context.fillStyle = `rgba(243, 243, 241, ${Math.min(0.88, resting + influence * 0.72)})`
          context.fill()
        }
      }
    }

    resize()
    raf = requestAnimationFrame(draw)
    window.addEventListener('resize', resize)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [eye.snapshotRef])

  return <canvas ref={canvasRef} className="intro-field" aria-hidden="true" />
}
