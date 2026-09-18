"""Webcam loop for MediaPipe iris and eye tracking."""

from __future__ import annotations

import argparse
import sys
import time

import cv2
import mediapipe as mp
import numpy as np

from eye_tracking.model import ensure_model
from eye_tracking.overlay import Overlay
from eye_tracking.tracker import EyeTracker


def _open_camera(camera_id: int, width: int, height: int) -> cv2.VideoCapture:
    backends = []
    if sys.platform.startswith("win"):
        backends.append(cv2.CAP_DSHOW)
    backends.append(cv2.CAP_ANY)

    for backend in backends:
        cap = cv2.VideoCapture(camera_id, backend)
        if not cap.isOpened():
            cap.release()
            continue
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        ok, _ = cap.read()
        if ok:
            return cap
        cap.release()

    raise RuntimeError(
        f"Could not open camera {camera_id}. Close other apps using the webcam and try again."
    )


def _create_landmarker(model_path: str):
    options = mp.tasks.vision.FaceLandmarkerOptions(
        base_options=mp.tasks.BaseOptions(model_asset_path=model_path),
        running_mode=mp.tasks.vision.RunningMode.VIDEO,
        num_faces=1,
        min_face_detection_confidence=0.5,
        min_face_presence_confidence=0.5,
        min_tracking_confidence=0.5,
        output_face_blendshapes=True,
        output_facial_transformation_matrixes=True,
    )
    return mp.tasks.vision.FaceLandmarker.create_from_options(options)


def run(camera_id: int, width: int, height: int, mirror: bool) -> None:
    model_path = ensure_model()
    cap = _open_camera(camera_id, width, height)
    overlay = Overlay()
    tracker: EyeTracker | None = None
    fps_ema = 0.0
    last_ts = -1
    prev = time.perf_counter()

    print("Eye tracking started. Look at the camera window.")
    print("Keys: Q quit | C calibrate | SPACE capture | R reset | M mesh")

    with _create_landmarker(model_path) as landmarker:
        while True:
            ok, frame = cap.read()
            if not ok:
                print("Failed to read from webcam.")
                break

            if mirror:
                frame = cv2.flip(frame, 1)

            h, w = frame.shape[:2]
            if tracker is None:
                tracker = EyeTracker(w, h)
            else:
                tracker.frame_width = w
                tracker.frame_height = h

            rgb = np.ascontiguousarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            timestamp_ms = time.time_ns() // 1_000_000
            if timestamp_ms <= last_ts:
                timestamp_ms = last_ts + 1
            last_ts = timestamp_ms

            result = landmarker.detect_for_video(mp_image, timestamp_ms)

            now = time.perf_counter()
            inst_fps = 1.0 / max(now - prev, 1e-6)
            prev = now
            fps_ema = inst_fps if fps_ema == 0 else 0.15 * inst_fps + 0.85 * fps_ema

            state = tracker.update(result, fps=fps_ema)
            canvas = overlay.render(frame, state, tracker)
            cv2.imshow("MediaPipe Eye Tracking", canvas)

            key = cv2.waitKey(1) & 0xFF
            if key in (ord("q"), 27):
                break
            if key == ord("m"):
                overlay.show_mesh = not overlay.show_mesh
            if key == ord("r"):
                tracker.reset()
                overlay.trail.clear()
            if key == ord("c"):
                if tracker.calibrator.active:
                    tracker.calibrator.cancel()
                else:
                    tracker.calibrator.start()
            if key == 32 and tracker.calibrator.active:
                tracker.calibrator.capture()

    cap.release()
    cv2.destroyAllWindows()


def main() -> None:
    parser = argparse.ArgumentParser(description="MediaPipe iris and eye tracking")
    parser.add_argument("--camera", type=int, default=0, help="Webcam device index")
    parser.add_argument("--width", type=int, default=1280, help="Capture width")
    parser.add_argument("--height", type=int, default=720, help="Capture height")
    parser.add_argument("--no-mirror", action="store_true", help="Disable selfie mirroring")
    args = parser.parse_args()
    run(args.camera, args.width, args.height, mirror=not args.no_mirror)


if __name__ == "__main__":
    main()
