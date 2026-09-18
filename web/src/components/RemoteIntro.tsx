import './RemoteIntro.css'

export default function RemoteIntro({ onCalibrate }: { onCalibrate: () => void }) {
  return (
    <main className="remote-intro">
      <button type="button" className="remote-intro-action" onClick={onCalibrate}>
        Calibrate remote
      </button>
    </main>
  )
}
