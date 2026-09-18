# Gaze Shot

Browser aim trainer controlled with your eyes. A webcam plus [MediaPipe Face Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker) estimates where you look; a blink shoots.

Nothing is uploaded. Video stays in the browser.

## Run

```bash
npm install
npm run dev
```

Open the local URL (camera access requires `localhost` or HTTPS). Allow the webcam when prompted.

## How to play

1. Sit about an arm’s length from the screen with the camera at eye level.
2. Use even lighting. Avoid a bright window behind you.
3. Keep your head still and look with your eyes, not by turning your face.
4. Stare at each glowing calibration dot until it fills (15 dots, shuffled).
5. A crosshair should start following your eyes. If it is off, **click where you are actually looking**. Press Enter to play.
6. Look at a target and **blink both eyes** to shoot. Spacebar also fires. Press `R` to restart a round, `C` to recalibrate.

If blinks are unreliable (very dry eyes, some glasses), switch **Fire mode** to **Dwell** on the start screen and hold your gaze on a target.

Webcam gaze is typically within about 100–200 pixels after calibration — targets auto-size to the measured error. Recalibrate if you shift in your chair.

## Stack

- Vite + TypeScript
- `@mediapipe/tasks-vision` (Apache-2.0) for 478 face/iris landmarks, blink blendshapes, and head pose
- Per-user interpolation maps iris-in-eye position to screen coordinates
