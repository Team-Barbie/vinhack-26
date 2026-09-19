import { useEffect, useRef } from 'react'
import './LogoReveal.css'

const END_AT = 6.3

export default function LogoReveal({ onDone }: { onDone: () => void }) {
  const doneRef = useRef(onDone)
  useEffect(() => {
    doneRef.current = onDone
  }, [onDone])

  useEffect(() => {
    const onKey = () => doneRef.current()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <main className="logo-reveal" onClick={onDone} aria-label="VisionLoop">
      <video
        className="logo-reveal-video"
        src="/visionloop-intro.mp4"
        autoPlay
        muted
        playsInline
        preload="auto"
        onTimeUpdate={(e) => {
          if (e.currentTarget.currentTime >= END_AT) onDone()
        }}
        onEnded={onDone}
        onError={onDone}
      />
    </main>
  )
}
