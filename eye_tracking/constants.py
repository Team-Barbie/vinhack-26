"""MediaPipe Face Landmarker indices and model location."""

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODEL_DIR = ROOT / "models"
MODEL_PATH = MODEL_DIR / "face_landmarker.task"
MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/"
    "face_landmarker/face_landmarker/float16/1/face_landmarker.task"
)

# Average adult iris diameter used for camera-distance estimation.
IRIS_DIAMETER_MM = 11.7
DEFAULT_CAMERA_FOV_DEG = 60.0

# Person's left / right (MediaPipe anatomical convention).
LEFT_EYE = {
    "name": "left",
    "outer": 263,
    "inner": 362,
    "upper": 386,
    "lower": 374,
    "iris_center": 473,
    "iris_ring": (474, 475, 476, 477),
    "contour": (
        263, 249, 390, 373, 374, 380, 381, 382, 362,
        398, 384, 385, 386, 387, 388, 466,
    ),
    "ear_vertical": ((386, 374), (385, 380)),
    "ear_horizontal": (263, 362),
    "blink_blendshape": "eyeBlinkLeft",
}

RIGHT_EYE = {
    "name": "right",
    "outer": 33,
    "inner": 133,
    "upper": 159,
    "lower": 145,
    "iris_center": 468,
    "iris_ring": (469, 470, 471, 472),
    "contour": (
        33, 7, 163, 144, 145, 153, 154, 155, 133,
        173, 157, 158, 159, 160, 161, 246,
    ),
    "ear_vertical": ((159, 145), (158, 153)),
    "ear_horizontal": (33, 133),
    "blink_blendshape": "eyeBlinkRight",
}

CALIBRATION_TARGETS = (
    (0.12, 0.12),
    (0.50, 0.12),
    (0.88, 0.12),
    (0.12, 0.50),
    (0.50, 0.50),
    (0.88, 0.50),
    (0.12, 0.88),
    (0.50, 0.88),
    (0.88, 0.88),
)

GAZE_BLENDSHAPES = {
    "look_in_left": "eyeLookInLeft",
    "look_out_left": "eyeLookOutLeft",
    "look_up_left": "eyeLookUpLeft",
    "look_down_left": "eyeLookDownLeft",
    "look_in_right": "eyeLookInRight",
    "look_out_right": "eyeLookOutRight",
    "look_up_right": "eyeLookUpRight",
    "look_down_right": "eyeLookDownRight",
}

BLINK_ON = 0.45
BLINK_OFF = 0.28
EAR_CLOSED = 0.18
EAR_OPEN = 0.22
