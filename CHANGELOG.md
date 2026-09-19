# Changelog

## 1.0.0 - 2026-09-20

VisionLoop's first stable release.

### Highlights

- Webcam-based patient communication board with gaze and blink controls.
- Five-point calibration with saved browser profiles and touch fallback.
- Spoken needs, emergency requests, yes/no answers, and a hierarchical phrase board.
- Standalone gaze trainer with blink and dwell modes, diagnostics, and correction logging.
- Python tracking demo with calibration and landmark overlays.

### Reliability

- Rejects ambiguous diagonal gaze samples and accidental short glances.
- Requires deliberate bilateral blinks and cancels selection when face tracking is lost.
- Responds quickly to genuine gaze jumps while smoothing fixation noise.
- Includes 23 synthetic regression tests for navigation, calibration, tracking, and phrases.
