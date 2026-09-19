import GazeDotField from './GazeDotField'
import './RemoteIntro.css'

export default function RemoteIntro({ onCalibrate }: { onCalibrate: () => void }) {
  return (
    <main className="remote-intro">
      <GazeDotField />
      <div className="intro-content">
        <svg className="intro-mark" viewBox="6 16 52 32" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M32 32C26 22 12 22 12 32C12 42 26 42 32 32C38 22 52 22 52 32C52 42 38 42 32 32Z" />
        </svg>

        <h1 className="intro-wordmark" aria-label="VisionLoop">
          <span>VISION</span>
          <span className="intro-wordmark-soft">LOOP</span>
        </h1>
        <p className="intro-tagline">Communicate with your eyes.</p>

        <button type="button" className="remote-intro-action" onClick={onCalibrate}>
          Calibrate remote
        </button>
        <p className="intro-note">One-time setup, about 15 seconds. Your video stays on this device.</p>
      </div>
    </main>
  )
}
