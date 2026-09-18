"""OpenCV HUD for iris, gaze, and head-pose tracking."""

from __future__ import annotations

from collections import deque

import cv2
import numpy as np

from eye_tracking.tracker import EyeSample, EyeTracker, TrackingState

SIDEBAR_W = 360
CYAN = (255, 210, 40)
MAGENTA = (220, 60, 255)
GREEN = (80, 220, 120)
WHITE = (240, 240, 240)
MUTED = (170, 176, 188)
RED = (70, 70, 255)
BG = (22, 20, 18)
PANEL = (36, 32, 28)


def _px(norm: tuple[float, float], w: int, h: int) -> tuple[int, int]:
    return int(norm[0] * w), int(norm[1] * h)


def _put(img, text: str, xy: tuple[int, int], color=WHITE, scale=0.52, thick=1) -> None:
    cv2.putText(img, text, xy, cv2.FONT_HERSHEY_SIMPLEX, scale, color, thick, cv2.LINE_AA)


def _filled_poly(img, points, color, alpha=0.25) -> None:
    overlay = img.copy()
    cv2.fillPoly(overlay, [np.array(points, dtype=np.int32)], color)
    cv2.addWeighted(overlay, alpha, img, 1 - alpha, 0, img)


def _draw_eye(frame, eye: EyeSample, color, w: int, h: int) -> None:
    contour = [_px(p, w, h) for p in eye.contour]
    if len(contour) >= 3:
        _filled_poly(frame, contour, color, 0.12)
        cv2.polylines(frame, [np.array(contour, dtype=np.int32)], True, color, 1, cv2.LINE_AA)

    ring = [_px(p, w, h) for p in eye.iris_ring]
    if len(ring) >= 3:
        cv2.polylines(frame, [np.array(ring, dtype=np.int32)], True, color, 2, cv2.LINE_AA)

    center = _px(eye.iris_center, w, h)
    radius = max(3, int(eye.iris_radius * w))
    cv2.circle(frame, center, radius, color, 2, cv2.LINE_AA)
    cv2.circle(frame, center, 3, WHITE, -1, cv2.LINE_AA)

    inner = _px(eye.inner, w, h)
    outer = _px(eye.outer, w, h)
    mid = ((inner[0] + outer[0]) // 2, (inner[1] + outer[1]) // 2)
    gaze_tip = (
        int(mid[0] + (eye.gaze[0] - 0.5) * 90),
        int(mid[1] + (eye.gaze[1] - 0.5) * 70),
    )
    cv2.arrowedLine(frame, mid, gaze_tip, GREEN, 2, cv2.LINE_AA, tipLength=0.25)

    label = f"{eye.name[0].upper()} {'closed' if eye.closed else 'open'}"
    _put(frame, label, (center[0] - 28, center[1] - radius - 10), color, 0.45)


def _eye_crop(frame, eye: EyeSample, w: int, h: int, size=140) -> np.ndarray:
    xs = [p[0] for p in eye.contour] + [eye.iris_center[0]]
    ys = [p[1] for p in eye.contour] + [eye.iris_center[1]]
    pad = 0.035
    x1 = max(0, int((min(xs) - pad) * w))
    y1 = max(0, int((min(ys) - pad) * h))
    x2 = min(w, int((max(xs) + pad) * w))
    y2 = min(h, int((max(ys) + pad) * h))
    if x2 <= x1 or y2 <= y1:
        return np.zeros((size, size, 3), dtype=np.uint8)
    crop = frame[y1:y2, x1:x2]
    if crop.size == 0:
        return np.zeros((size, size, 3), dtype=np.uint8)
    return cv2.resize(crop, (size, size), interpolation=cv2.INTER_CUBIC)


class Overlay:
    def __init__(self) -> None:
        self.trail: deque[tuple[float, float]] = deque(maxlen=40)
        self.show_mesh = False

    def render(self, frame: np.ndarray, state: TrackingState, tracker: EyeTracker) -> np.ndarray:
        h, w = frame.shape[:2]
        canvas = np.full((h, w + SIDEBAR_W, 3), BG, dtype=np.uint8)
        view = frame.copy()

        if state.face_found and state.left and state.right:
            _draw_eye(view, state.left, CYAN, w, h)
            _draw_eye(view, state.right, MAGENTA, w, h)
            if self.show_mesh and state.landmarks is not None:
                self._draw_sparse_mesh(view, state.landmarks, w, h)

        self._draw_status(view, state, tracker)
        if tracker.calibrator.active:
            self._draw_calibration(view, tracker)

        canvas[:, :w] = view
        self._draw_sidebar(canvas, view, state, tracker, w, h)
        return canvas

    def _draw_sparse_mesh(self, frame, landmarks, w: int, h: int) -> None:
        for lm in landmarks[::4]:
            cv2.circle(frame, (int(lm.x * w), int(lm.y * h)), 1, (90, 90, 90), -1)

    def _draw_status(self, frame, state: TrackingState, tracker: EyeTracker) -> None:
        h, w = frame.shape[:2]
        cv2.rectangle(frame, (12, 12), (320, 86), (0, 0, 0), -1)
        cv2.rectangle(frame, (12, 12), (320, 86), (60, 54, 48), 1)
        status = "TRACKING" if state.face_found else "NO FACE"
        color = GREEN if state.face_found else RED
        _put(frame, f"MediaPipe iris tracker  {state.fps:.0f} fps", (22, 40), MUTED, 0.48)
        _put(frame, status, (22, 70), color, 0.7, 2)

        hint = "Q quit  |  C calibrate  |  SPACE capture  |  R reset  |  M mesh"
        _put(frame, hint, (14, h - 18), MUTED, 0.42)

        if tracker.calibrator.ready:
            _put(frame, "calibrated", (w - 140, 36), GREEN, 0.5)

    def _draw_calibration(self, frame, tracker: EyeTracker) -> None:
        h, w = frame.shape[:2]
        target = tracker.calibrator.current_target
        if target is None:
            return
        dim = frame.copy()
        cv2.addWeighted(dim, 0.35, frame, 0.65, 0, frame)
        cx, cy = int(target[0] * w), int(target[1] * h)
        cv2.circle(frame, (cx, cy), 22, GREEN, 2, cv2.LINE_AA)
        cv2.circle(frame, (cx, cy), 6, WHITE, -1, cv2.LINE_AA)
        step = tracker.calibrator.index + 1
        total = len(tracker.calibrator.targets)
        _put(frame, f"Look at the dot  ({step}/{total})  then press SPACE", (40, h // 2), WHITE, 0.7, 2)

    def _draw_sidebar(
        self,
        canvas: np.ndarray,
        frame: np.ndarray,
        state: TrackingState,
        tracker: EyeTracker,
        w: int,
        h: int,
    ) -> None:
        x0 = w
        cv2.rectangle(canvas, (x0, 0), (x0 + SIDEBAR_W, h), PANEL, -1)
        _put(canvas, "EYE TRACKING", (x0 + 20, 36), WHITE, 0.72, 2)
        _put(canvas, "Iris  ·  Gaze  ·  Blink  ·  Pose", (x0 + 20, 58), MUTED, 0.42)

        y = 92
        distance = f"{state.distance_cm:.0f} cm" if state.distance_cm else "—"
        rows = [
            ("Gaze", state.direction),
            ("Attention", state.attention),
            ("Blinks", str(state.blink_count)),
            ("EAR", f"{state.ear:.2f}"),
            ("Pitch / Yaw / Roll", f"{state.pitch:.0f} / {state.yaw:.0f} / {state.roll:.0f}"),
            ("Distance", distance),
            ("Iris diameter", f"{state.iris_diameter_px:.1f} px"),
        ]
        if state.left and state.right:
            rows.insert(1, ("L / R iris", f"{state.left.gaze[0]:.2f},{state.left.gaze[1]:.2f}  {state.right.gaze[0]:.2f},{state.right.gaze[1]:.2f}"))

        for label, value in rows:
            _put(canvas, label.upper(), (x0 + 20, y), MUTED, 0.40)
            _put(canvas, value, (x0 + 20, y + 22), WHITE, 0.58)
            y += 48

        radar_top = y + 8
        self._draw_radar(canvas, state, x0, radar_top)

        crop_y = min(h - 170, radar_top + 250)
        if state.left and state.right and crop_y + 160 <= h:
            left_crop = _eye_crop(frame, state.left, w, h)
            right_crop = _eye_crop(frame, state.right, w, h)
            canvas[crop_y:crop_y + 140, x0 + 24:x0 + 164] = left_crop
            canvas[crop_y:crop_y + 140, x0 + 180:x0 + 320] = right_crop
            cv2.rectangle(canvas, (x0 + 24, crop_y), (x0 + 164, crop_y + 140), CYAN, 1)
            cv2.rectangle(canvas, (x0 + 180, crop_y), (x0 + 320, crop_y + 140), MAGENTA, 1)
            _put(canvas, "LEFT IRIS", (x0 + 44, crop_y + 158), CYAN, 0.42)
            _put(canvas, "RIGHT IRIS", (x0 + 198, crop_y + 158), MAGENTA, 0.42)

    def _draw_radar(self, canvas: np.ndarray, state: TrackingState, x0: int, y0: int) -> None:
        box = 220
        x1, y1 = x0 + 70, y0
        x2, y2 = x1 + box, y1 + box
        cv2.rectangle(canvas, (x1, y1), (x2, y2), (48, 44, 40), 1)
        cv2.line(canvas, (x1 + box // 2, y1), (x1 + box // 2, y2), (48, 44, 40), 1)
        cv2.line(canvas, (x1, y1 + box // 2), (x2, y1 + box // 2), (48, 44, 40), 1)
        _put(canvas, "GAZE MAP", (x0 + 20, y0 - 8), MUTED, 0.40)

        point = state.screen_gaze or state.gaze
        self.trail.append(point)
        for i, (gx, gy) in enumerate(self.trail):
            px = int(x1 + gx * box)
            py = int(y1 + gy * box)
            radius = 2 if i < len(self.trail) - 1 else 7
            color = GREEN if i == len(self.trail) - 1 else (40, 90, 50)
            cv2.circle(canvas, (px, py), radius, color, -1, cv2.LINE_AA)
