"""Iris, gaze, blink, and head-pose tracking from MediaPipe Face Landmarker."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np

from eye_tracking.constants import (
    BLINK_OFF,
    BLINK_ON,
    CALIBRATION_TARGETS,
    DEFAULT_CAMERA_FOV_DEG,
    EAR_CLOSED,
    EAR_OPEN,
    GAZE_BLENDSHAPES,
    IRIS_DIAMETER_MM,
    LEFT_EYE,
    RIGHT_EYE,
)


def _pt(landmarks, index: int) -> np.ndarray:
    lm = landmarks[index]
    return np.array([lm.x, lm.y, lm.z], dtype=np.float32)


def _dist(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.linalg.norm(a[:2] - b[:2]))


def _eye_aspect_ratio(landmarks, spec: dict) -> float:
    vertical = sum(_dist(_pt(landmarks, a), _pt(landmarks, b)) for a, b in spec["ear_vertical"])
    horizontal = _dist(_pt(landmarks, spec["ear_horizontal"][0]), _pt(landmarks, spec["ear_horizontal"][1]))
    if horizontal < 1e-6:
        return 0.0
    return vertical / (2.0 * horizontal)


def _blendshape_map(categories) -> dict[str, float]:
    if not categories:
        return {}
    return {item.category_name: float(item.score) for item in categories}


def _rotation_to_euler(matrix_4x4: np.ndarray) -> tuple[float, float, float]:
    r = matrix_4x4[:3, :3]
    pitch = float(np.degrees(np.arcsin(np.clip(-r[2, 0], -1.0, 1.0))))
    yaw = float(np.degrees(np.arctan2(r[1, 0], r[0, 0])))
    roll = float(np.degrees(np.arctan2(r[2, 1], r[2, 2])))
    return pitch, yaw, roll


def _poly_features(gx: float, gy: float) -> np.ndarray:
    return np.array([1.0, gx, gy, gx * gy, gx * gx, gy * gy], dtype=np.float64)


@dataclass
class EyeSample:
    name: str
    iris_center: tuple[float, float]
    iris_radius: float
    iris_ring: list[tuple[float, float]]
    contour: list[tuple[float, float]]
    inner: tuple[float, float]
    outer: tuple[float, float]
    upper: tuple[float, float]
    lower: tuple[float, float]
    gaze: tuple[float, float]
    ear: float
    blink: float
    closed: bool


@dataclass
class TrackingState:
    face_found: bool = False
    landmarks: Any = None
    left: EyeSample | None = None
    right: EyeSample | None = None
    gaze: tuple[float, float] = (0.5, 0.5)
    screen_gaze: tuple[float, float] | None = None
    direction: str = "—"
    blink_left: bool = False
    blink_right: bool = False
    blink_count: int = 0
    both_closed: bool = False
    ear: float = 0.0
    pitch: float = 0.0
    yaw: float = 0.0
    roll: float = 0.0
    distance_cm: float | None = None
    iris_diameter_px: float = 0.0
    attention: str = "unknown"
    fps: float = 0.0


class GazeCalibrator:
    """Maps normalized iris gaze to window coordinates with a 9-point polynomial."""

    def __init__(self) -> None:
        self.targets = list(CALIBRATION_TARGETS)
        self.index = 0
        self.active = False
        self.samples: list[tuple[tuple[float, float], tuple[float, float]]] = []
        self.weights_x: np.ndarray | None = None
        self.weights_y: np.ndarray | None = None
        self._buffer: list[tuple[float, float]] = []

    @property
    def ready(self) -> bool:
        return self.weights_x is not None and self.weights_y is not None

    @property
    def current_target(self) -> tuple[float, float] | None:
        if not self.active or self.index >= len(self.targets):
            return None
        return self.targets[self.index]

    def start(self) -> None:
        self.active = True
        self.index = 0
        self.samples.clear()
        self.weights_x = None
        self.weights_y = None
        self._buffer.clear()

    def cancel(self) -> None:
        self.active = False
        self._buffer.clear()

    def observe(self, gaze: tuple[float, float]) -> None:
        if self.active:
            self._buffer.append(gaze)
            if len(self._buffer) > 20:
                self._buffer.pop(0)

    def capture(self) -> bool:
        if not self.active or self.current_target is None or len(self._buffer) < 5:
            return False
        mean = np.mean(self._buffer, axis=0)
        self.samples.append(((float(mean[0]), float(mean[1])), self.current_target))
        self._buffer.clear()
        self.index += 1
        if self.index >= len(self.targets):
            self._fit()
            self.active = False
            return True
        return False

    def map(self, gaze: tuple[float, float]) -> tuple[float, float] | None:
        if not self.ready:
            return None
        feats = _poly_features(*gaze)
        x = float(np.clip(feats @ self.weights_x, 0.0, 1.0))
        y = float(np.clip(feats @ self.weights_y, 0.0, 1.0))
        return x, y

    def _fit(self) -> None:
        if len(self.samples) < 6:
            return
        features = np.vstack([_poly_features(*g) for g, _ in self.samples])
        sx = np.array([t[0] for _, t in self.samples], dtype=np.float64)
        sy = np.array([t[1] for _, t in self.samples], dtype=np.float64)
        self.weights_x = np.linalg.lstsq(features, sx, rcond=None)[0]
        self.weights_y = np.linalg.lstsq(features, sy, rcond=None)[0]


class EyeTracker:
    def __init__(self, frame_width: int, frame_height: int, fov_deg: float = DEFAULT_CAMERA_FOV_DEG) -> None:
        self.frame_width = frame_width
        self.frame_height = frame_height
        self.fov_deg = fov_deg
        self.calibrator = GazeCalibrator()
        self.blink_count = 0
        self._eyes_closed = False
        self._gaze_ema: np.ndarray | None = None
        self.state = TrackingState()

    def reset(self) -> None:
        self.blink_count = 0
        self._eyes_closed = False
        self._gaze_ema = None
        self.calibrator.cancel()
        self.calibrator.weights_x = None
        self.calibrator.weights_y = None
        self.calibrator.samples.clear()
        self.state = TrackingState()

    def update(self, result, fps: float = 0.0) -> TrackingState:
        state = TrackingState(fps=fps, blink_count=self.blink_count)
        if not result or not result.face_landmarks:
            self.state = state
            return state

        landmarks = result.face_landmarks[0]
        blends = _blendshape_map(result.face_blendshapes[0] if result.face_blendshapes else [])
        state.face_found = True
        state.landmarks = landmarks

        state.left = self._sample_eye(landmarks, blends, LEFT_EYE)
        state.right = self._sample_eye(landmarks, blends, RIGHT_EYE)
        state.blink_left = state.left.closed
        state.blink_right = state.right.closed
        state.both_closed = state.blink_left and state.blink_right
        state.ear = (state.left.ear + state.right.ear) / 2.0

        if state.both_closed and not self._eyes_closed:
            self.blink_count += 1
            self._eyes_closed = True
        elif not state.both_closed and (
            (state.left.blink + state.right.blink) / 2.0 < BLINK_OFF and state.ear > EAR_OPEN
        ):
            self._eyes_closed = False
        state.blink_count = self.blink_count

        iris_gaze = self._iris_gaze(state.left, state.right)
        blend_gaze = self._blendshape_gaze(blends)
        raw_gaze = (
            0.65 * iris_gaze[0] + 0.35 * blend_gaze[0],
            0.65 * iris_gaze[1] + 0.35 * blend_gaze[1],
        )
        if state.both_closed and self._gaze_ema is not None:
            raw_gaze = (float(self._gaze_ema[0]), float(self._gaze_ema[1]))

        if self._gaze_ema is None:
            self._gaze_ema = np.array(raw_gaze, dtype=np.float32)
        else:
            self._gaze_ema = 0.35 * np.array(raw_gaze, dtype=np.float32) + 0.65 * self._gaze_ema
        state.gaze = (float(self._gaze_ema[0]), float(self._gaze_ema[1]))
        self.calibrator.observe(state.gaze)
        state.screen_gaze = self.calibrator.map(state.gaze)
        state.direction = self._direction(state.gaze)

        if result.facial_transformation_matrixes:
            raw = result.facial_transformation_matrixes[0]
            matrix = np.array(getattr(raw, "data", raw), dtype=np.float32).reshape(4, 4)
            state.pitch, state.yaw, state.roll = _rotation_to_euler(matrix)

        diameters = []
        for eye in (state.left, state.right):
            if eye.iris_radius > 0:
                diameters.append(eye.iris_radius * 2.0 * self.frame_width)
        if diameters:
            state.iris_diameter_px = float(np.mean(diameters))
            state.distance_cm = self._distance_cm(state.iris_diameter_px)

        looking_center = state.direction == "CENTER" and abs(state.yaw) < 18 and abs(state.pitch) < 15
        state.attention = "on-camera" if looking_center else "looking-away"
        self.state = state
        return state

    def _sample_eye(self, landmarks, blends: dict[str, float], spec: dict) -> EyeSample:
        iris = _pt(landmarks, spec["iris_center"])
        ring = [_pt(landmarks, i) for i in spec["iris_ring"]]
        radius = float(np.mean([_dist(iris, p) for p in ring])) if ring else 0.0
        inner = _pt(landmarks, spec["inner"])
        outer = _pt(landmarks, spec["outer"])
        upper = _pt(landmarks, spec["upper"])
        lower = _pt(landmarks, spec["lower"])

        left_x = min(inner[0], outer[0])
        right_x = max(inner[0], outer[0])
        top_y = min(upper[1], lower[1])
        bot_y = max(upper[1], lower[1])
        gx = float(np.clip((iris[0] - left_x) / (right_x - left_x + 1e-6), 0.0, 1.0))
        gy = float(np.clip((iris[1] - top_y) / (bot_y - top_y + 1e-6), 0.0, 1.0))

        ear = _eye_aspect_ratio(landmarks, spec)
        blink = blends.get(spec["blink_blendshape"], 0.0)
        closed = blink >= BLINK_ON or ear <= EAR_CLOSED

        return EyeSample(
            name=spec["name"],
            iris_center=(float(iris[0]), float(iris[1])),
            iris_radius=radius,
            iris_ring=[(float(p[0]), float(p[1])) for p in ring],
            contour=[(float(landmarks[i].x), float(landmarks[i].y)) for i in spec["contour"]],
            inner=(float(inner[0]), float(inner[1])),
            outer=(float(outer[0]), float(outer[1])),
            upper=(float(upper[0]), float(upper[1])),
            lower=(float(lower[0]), float(lower[1])),
            gaze=(gx, gy),
            ear=ear,
            blink=blink,
            closed=closed,
        )

    @staticmethod
    def _iris_gaze(left: EyeSample, right: EyeSample) -> tuple[float, float]:
        return (
            (left.gaze[0] + right.gaze[0]) / 2.0,
            (left.gaze[1] + right.gaze[1]) / 2.0,
        )

    @staticmethod
    def _blendshape_gaze(blends: dict[str, float]) -> tuple[float, float]:
        look_left = (
            blends.get(GAZE_BLENDSHAPES["look_in_left"], 0.0)
            + blends.get(GAZE_BLENDSHAPES["look_out_right"], 0.0)
        ) / 2.0
        look_right = (
            blends.get(GAZE_BLENDSHAPES["look_out_left"], 0.0)
            + blends.get(GAZE_BLENDSHAPES["look_in_right"], 0.0)
        ) / 2.0
        look_up = (
            blends.get(GAZE_BLENDSHAPES["look_up_left"], 0.0)
            + blends.get(GAZE_BLENDSHAPES["look_up_right"], 0.0)
        ) / 2.0
        look_down = (
            blends.get(GAZE_BLENDSHAPES["look_down_left"], 0.0)
            + blends.get(GAZE_BLENDSHAPES["look_down_right"], 0.0)
        ) / 2.0
        gx = float(np.clip(0.5 + 0.55 * (look_right - look_left), 0.0, 1.0))
        gy = float(np.clip(0.5 + 0.55 * (look_down - look_up), 0.0, 1.0))
        return gx, gy

    @staticmethod
    def _direction(gaze: tuple[float, float]) -> str:
        dx, dy = gaze[0] - 0.5, gaze[1] - 0.5
        if abs(dx) < 0.10 and abs(dy) < 0.10:
            return "CENTER"
        if abs(dx) >= abs(dy):
            return "RIGHT" if dx > 0 else "LEFT"
        return "DOWN" if dy > 0 else "UP"

    def _distance_cm(self, iris_diameter_px: float) -> float | None:
        if iris_diameter_px <= 1:
            return None
        focal_px = (self.frame_width / 2.0) / np.tan(np.radians(self.fov_deg / 2.0))
        distance_mm = (IRIS_DIAMETER_MM * focal_px) / iris_diameter_px
        return float(distance_mm / 10.0)
