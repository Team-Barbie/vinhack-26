import './Home.css'

export type Destination = 'board' | 'game'

export default function Home({ onSelect }: { onSelect: (destination: Destination) => void }) {
  return (
    <main className="home">
      <header className="home-header">
        <span className="home-eyebrow">GazeBridge</span>
        <h1 className="home-title">Communicate with your eyes.</h1>
        <p className="home-lede">Webcam eye tracking, processed on this device. Choose where to go.</p>
      </header>

      <div className="home-choices">
        <button type="button" className="home-choice is-primary" onClick={() => onSelect('board')}>
          <span className="home-choice-icon" aria-hidden="true">
            💬
          </span>
          <span className="home-choice-body">
            <span className="home-choice-title">Patient Board</span>
            <span className="home-choice-desc">Request help, answer yes or no, and build sentences.</span>
          </span>
          <span className="home-choice-arrow" aria-hidden="true">
            →
          </span>
        </button>

        <button type="button" className="home-choice" onClick={() => onSelect('game')}>
          <span className="home-choice-icon" aria-hidden="true">
            🎯
          </span>
          <span className="home-choice-body">
            <span className="home-choice-title">Aim Trainer</span>
            <span className="home-choice-desc">Calibrate your gaze, then aim with your eyes and blink to shoot.</span>
          </span>
          <span className="home-choice-arrow" aria-hidden="true">
            →
          </span>
        </button>
      </div>

      <p className="home-footnote">
        GazeBridge supplements — never replaces — a hospital's certified nurse-call or emergency system.
      </p>
    </main>
  )
}
