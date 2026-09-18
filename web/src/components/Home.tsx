import './Home.css'

export type Destination = 'board' | 'game' | 'privacy' | 'terms'

export default function Home({ onSelect }: { onSelect: (destination: Destination) => void }) {
  return (
    <main className="home">
      <header className="home-header">
        <span className="home-eyebrow">GazeBridge</span>
        <h1 className="home-title">Communicate with your eyes.</h1>
        <p className="home-lede">
          For hospital patients who can't speak or reach a call button. Look toward a request, blink to confirm,
          and the laptop says it out loud.
        </p>
      </header>

      <div className="home-choices">
        <button type="button" className="home-choice is-primary" onClick={() => onSelect('board')}>
          <span className="home-choice-kicker">For patients</span>
          <span className="home-choice-body">
            <span className="home-choice-title">Patient Board</span>
            <span className="home-choice-desc">
              Ask for water, a nurse, or a change of position. Answer yes or no.
            </span>
          </span>
        </button>

        <button type="button" className="home-choice" onClick={() => onSelect('game')}>
          <span className="home-choice-kicker">Practice</span>
          <span className="home-choice-body">
            <span className="home-choice-title">Aim Trainer</span>
            <span className="home-choice-desc">
              Calibrate your gaze, then aim with your eyes and blink to shoot.
            </span>
          </span>
        </button>
      </div>

      <footer className="home-footer">
        <p>GazeBridge is a prototype. It does not replace a hospital's nurse-call or emergency system.</p>
        <nav className="home-links" aria-label="Legal">
          <button type="button" onClick={() => onSelect('privacy')}>
            Privacy
          </button>
          <button type="button" onClick={() => onSelect('terms')}>
            Terms
          </button>
        </nav>
      </footer>
    </main>
  )
}
