# VisionLoop

**Communicate with your eyes.**

VisionLoop is a webcam-based communication prototype with a patient needs board, spoken phrases, and an eye-controlled aim trainer. MediaPipe face and iris tracking turns gaze into on-screen selections without dedicated eye-tracking hardware.

## What's in this repository?

| Application | Location | Purpose |
| --- | --- | --- |
| **VisionLoop** | `web/` | React app with Patient Board, Gaze Phrases, and Aim Trainer |
| **Standalone trainer** | Root (`src/`) | Standalone aim trainer with calibration, diagnostics, and blink or dwell firing |
| **Python tracker** | `main.py`, `eye_tracking/` | Desktop webcam demo with tracking overlays |

## Quick start: VisionLoop

You need Node.js **22.12 or newer**, npm, a webcam, and a browser with camera access. An internet connection is needed to load the MediaPipe runtime and model.

Clone the repository, then start the web app:

```bash
git clone https://github.com/Team-Barbie/vinhack-26.git
cd vinhack-26
cd web
npm install
npm run dev
```

Open the local URL printed by Vite and allow camera access. Browser camera access requires `localhost` or HTTPS.

### Calibrate once

The app opens on a one-time calibration: look at each of 13 dots until it fills in (about 20 seconds). That single calibration drives everything: the Aim Trainer crosshair, Phrases, and the eye remote on the Patient Board. It is saved in the browser, so later visits go straight to the home screen. Use **Calibrate again** on the home screen or the board if you move the laptop or change seats. **Skip, I'll use touch** leaves every screen working by tap, mouse, and keyboard.

If you already have the repository, run only `cd web`, `npm install`, and `npm run dev` from its root. No API key or environment file is required by the current app.

### Patient Board

Choose **Patient Board** on the home screen to access:

- **Needs**: water, food, the bathroom, help moving, and calling a nurse.
- **More** and **Emergency**: comfort requests and urgent health problems.
- **Talk**: one-tap phrases such as "Stop" or "Say that again", plus yes/no answers.
- **Phrases**, which narrows a phrase list using left/right gaze selections. Look toward the group containing your phrase, and blink or dwell for about 1.1 seconds to select. Return your gaze to the center between selections. Look toward the upper screen area and blink or dwell to go back. Once a single phrase is selected, it is spoken and the list resets. Tapping a side works too.

The **eye remote** moves a highlight between cards using the same calibration: look left, right, up, or down to move and close your eyes for about half a second to pick. Every card also works by tapping.

The board uses bundled audio clips and browser speech synthesis. Cards such as "Call a nurse" play a message; they do not connect to a hospital dispatch service. VisionLoop is a communication prototype, not a replacement for a hospital's certified nurse-call or emergency system.

### Aim Trainer

Choose **Aim Trainer** and start a round. With a calibration you aim with your eyes and blink to shoot; without one, or any time you press `M`, you play with the mouse.

| Control | Action in the web Aim Trainer |
| --- | --- |
| Blink | Shoot in gaze mode |
| Click or Space | Shoot during a round |
| `M` | Switch mouse/gaze input; gaze requires calibration |
| Escape | Cancel calibration or quit a round |

Results include score, hits, misses, best combo, and average reaction time. Dwell firing is available in the standalone trainer below; the web Aim Trainer uses blink, click, or Space.

For consistent tracking, use even lighting and position the camera near eye level. Keep your head steady during calibration and recalibrate after changing position.

## Standalone VisionLoop trainer

Run these commands from the **repository root**, rather than `web/`:

```bash
npm ci
npm run dev
```

Open `http://localhost:5173`. Follow the calibration and accuracy-check prompts, then start a round. Choose **Blink** or **Dwell** on the start screen. If the crosshair is offset, click where you are actually looking to record a correction.

| Control | Action |
| --- | --- |
| Blink both eyes | Fire in Blink mode, on reopening |
| Hold gaze on a target | Fire in Dwell mode |
| Space | Fire during a round |
| Enter | Start from the gaze-check or diagnostic-results screen |
| `R` | Restart during play or from results |
| `C` | Recalibrate once tracking is running |
| `D` | Run diagnostics from the check, ready, or results screen |

Target size adapts to measured calibration error. Follow recalibration prompts after resizing or changing your setup.

## Python webcam demo

The Python demo runs separately from the browser apps and requires a Python installation compatible with the packages in `requirements.txt`. From the repository root, create a virtual environment:

```bash
python -m venv .venv
```

Activate it in PowerShell:

```powershell
.\.venv\Scripts\Activate.ps1
```

Or on macOS/Linux:

```bash
source .venv/bin/activate
```

Then install dependencies and run:

```bash
python -m pip install -r requirements.txt
python main.py
```

The Face Landmarker model downloads into `models/` on first launch. Dependencies are MediaPipe, OpenCV, and NumPy.

| Key | Action |
| --- | --- |
| `C` | Start or cancel calibration |
| Space | Capture a calibration sample |
| `R` | Reset tracking and the gaze trail |
| `M` | Toggle the face mesh |
| `Q` or Escape | Quit |

To choose another camera or adjust capture settings:

```bash
python main.py --camera 1 --width 1280 --height 720 --no-mirror
```

## Development

The root and `web/` apps have separate npm dependencies. Install dependencies in each directory you intend to use.

| Command | Repository root | `web/` |
| --- | --- | --- |
| `npm run dev` | Start standalone trainer | Start VisionLoop |
| `npm run build` | Type-check and build | Type-check and build |
| `npm run preview` | Preview the production build | Preview the production build |
| `npm test` | Synthetic tracking and gameplay regression checks | Not configured |
| `npm run lint` | Not configured | Run Oxlint |

Build output goes into `dist/` inside the corresponding app directory. Run `npm run build` before `npm run preview`. When running both development servers, use the URL each prints; the standalone trainer reserves port 5173.

The root tests exercise the standalone tracking and gameplay modules with synthetic inputs. They do not validate live webcam accuracy or the React app.

### Technology

- **Web app:** React, TypeScript, Vite, MediaPipe Tasks Vision, and browser speech synthesis.
- **Standalone trainer:** TypeScript, Vite, canvas rendering, and MediaPipe Tasks Vision.
- **Desktop demo:** Python, MediaPipe, OpenCV, and NumPy.

```text
web/
  src/components/      Home, Patient Board, Gaze Phrases, and Aim Trainer
  src/hooks/           React eye-tracking integration
  src/lib/             Tracking and smoothing utilities
  public/audio/        Spoken request recordings
src/                   Standalone tracking, calibration, and gameplay
public/models/         Bundled browser Face Landmarker model
tests/                 Synthetic tracking and gameplay regression tests
eye_tracking/          Python tracking, calibration, and overlays
models/                Python model download location
main.py                Python entry point
```

## Data and troubleshooting

Camera frames are processed on the device. The web app downloads the MediaPipe runtime from jsDelivr and its model from Google-hosted storage. The standalone trainer tries its bundled model first, with a remote fallback, and loads its runtime from a CDN. The browser apps are therefore not configured for fully offline startup.

Saved calibration uses browser local storage. The standalone trainer also stores correction samples locally; in development, it sends diagnostic/correction data to its Vite server, which writes `gaze-look-log.json`. Speech synthesis uses voices provided by the browser or operating system; their availability and network behavior depend on the environment.

- **Camera unavailable:** allow camera permission and close other apps using the webcam. For Python, try another `--camera` index.
- **Model fails to load:** check access to the external MediaPipe asset hosts and retry.
- **Gaze is inaccurate:** improve lighting, keep your face visible, and recalibrate in your current position.
- **No speech:** check audio output and browser speech support. Playback depends on the selected phrase and playback mechanism.
- **Port 5173 is occupied:** stop the other server or choose another port with `npm run dev -- --port 5174`.
