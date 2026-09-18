# VisionLoop web app

The React frontend for VisionLoop includes the Patient Board, Gaze Phrases, and Aim Trainer.

## Run

Use Node.js 22.12 or newer and npm. From this directory:

```bash
npm install
npm run dev
```

Open the URL printed by Vite. Gaze input requires a webcam and camera permission on localhost or HTTPS. Internet access is needed for the MediaPipe runtime and model. No API key or environment file is required by the current app.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Type-check and create `dist/` |
| `npm run preview` | Preview a completed production build |
| `npm run lint` | Run Oxlint |

This app has no configured test script. The repository-root tests cover the separate standalone trainer.

See the [main VisionLoop README](../README.md) for features, calibration, controls, data handling, troubleshooting, and instructions for the standalone trainer and Python demo.
