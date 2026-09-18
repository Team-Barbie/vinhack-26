import type { ReactNode } from 'react'
import './Legal.css'

const UPDATED = '18 September 2026'

function LegalPage({ title, onExit, children }: { title: string; onExit: () => void; children: ReactNode }) {
  return (
    <main className="legal">
      <button type="button" className="legal-back" onClick={onExit}>
        Home
      </button>
      <h1>{title}</h1>
      <p className="legal-updated">Last updated {UPDATED}</p>
      {children}
    </main>
  )
}

export function Privacy({ onExit }: { onExit: () => void }) {
  return (
    <LegalPage title="Privacy" onExit={onExit}>
      <h2>Camera</h2>
      <p>
        GazeBridge asks for your camera only when you open the Patient Board or the Aim Trainer. Video frames are
        analysed in your browser to find your face and eyes. Frames are never recorded, saved, or sent anywhere.
        The camera turns off when you leave those screens.
      </p>

      <h2>What is stored</h2>
      <p>
        Your gaze calibration is kept in your browser's session storage so you don't have to recalibrate after a
        refresh. It is a handful of numbers, not an image, and it is deleted when you close the tab. Nothing else
        is stored. There are no accounts, cookies, or analytics.
      </p>

      <h2>Network requests</h2>
      <p>To run, the app downloads files from these services, which can see your IP address:</p>
      <ul>
        <li>Google Fonts, for the Manrope and JetBrains Mono typefaces.</li>
        <li>jsDelivr, for the MediaPipe face-tracking runtime.</li>
        <li>Google Cloud Storage, for the MediaPipe face landmark model.</li>
      </ul>

      <h2>Speech</h2>
      <p>
        Spoken phrases use prerecorded clips or your browser's text-to-speech. Some browsers, including Chrome
        with its Google voices, send the text to an online speech service to generate audio.
      </p>

      <h2>Contact</h2>
      <p>
        Questions go to the team through the{' '}
        <a href="https://github.com/Team-Barbie/vinhack-26/issues" target="_blank" rel="noreferrer">
          project's GitHub issues
        </a>
        .
      </p>
    </LegalPage>
  )
}

export function Terms({ onExit }: { onExit: () => void }) {
  return (
    <LegalPage title="Terms" onExit={onExit}>
      <h2>What this is</h2>
      <p>
        GazeBridge is a hackathon prototype built by Team Barbie for VinHack 2026. It is offered free, as is,
        without warranty of any kind.
      </p>

      <h2>Not a medical device</h2>
      <p>
        GazeBridge is not a certified medical device and does not diagnose, monitor, or treat any condition. The
        Call Nurse and Emergency buttons play audio and show a message on this screen only. They do not contact
        anyone. Never rely on GazeBridge in place of a hospital's nurse-call or emergency system.
      </p>

      <h2>Accuracy</h2>
      <p>
        Webcam eye tracking is approximate. Lighting, glasses, head movement, and camera quality all affect it, and
        it can select the wrong option. Keep a caregiver involved and use touch as a backup.
      </p>

      <h2>Liability</h2>
      <p>
        To the extent the law allows, the team is not liable for any harm, loss, or missed communication arising
        from use of the app.
      </p>
    </LegalPage>
  )
}
