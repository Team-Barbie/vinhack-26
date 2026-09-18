# vinhack-26

Real-time **iris and eye tracking** with MediaPipe Face Landmarker. The webcam feed is processed on-device and overlaid with iris contours, per-eye gaze, blinks, head pose, and an estimated camera distance.

## What it tracks

- Left / right **iris center, ring, and diameter**
- Eye contours and **eye aspect ratio**
- **Gaze direction** from iris position fused with ARKit-style look blendshapes
- **Blinks** (blendshapes + EAR, with a running count)
- **Head pose** (pitch / yaw / roll) from the facial transform matrix
- **Distance to camera** from iris size (11.7 mm average diameter)
- Optional **9-point gaze calibration** mapped onto the window

## Setup

Use Python **3.11** (MediaPipe wheels are reliable there; 3.14 may not install).

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

The Face Landmarker model (`models/face_landmarker.task`) downloads automatically on first run.

## Run

```powershell
python main.py
```

Useful flags:

```powershell
python main.py --camera 1 --width 1280 --height 720
python main.py --no-mirror
```

## Controls

| Key | Action |
| --- | --- |
| `Q` / `Esc` | Quit |
| `C` | Start or cancel 9-point calibration |
| `Space` | Capture the current calibration target |
| `R` | Reset blink count and calibration |
| `M` | Toggle sparse face-mesh points |

Keep your face lit and about 40–80 cm from the camera. Calibration is more stable if you hold still on each dot, then press Space.
