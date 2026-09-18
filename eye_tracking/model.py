"""Download the Face Landmarker model on first run."""

from __future__ import annotations

import shutil
import time
import urllib.request

from eye_tracking.constants import MODEL_DIR, MODEL_PATH, MODEL_URL


def ensure_model() -> str:
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    if MODEL_PATH.exists() and MODEL_PATH.stat().st_size > 1_000_000:
        return str(MODEL_PATH)

    print(f"Downloading Face Landmarker model to {MODEL_PATH} ...")
    tmp_path = MODEL_PATH.with_suffix(".task.part")
    with urllib.request.urlopen(MODEL_URL, timeout=120) as response, open(tmp_path, "wb") as out:
        shutil.copyfileobj(response, out)

    last_error: OSError | None = None
    for _ in range(8):
        try:
            tmp_path.replace(MODEL_PATH)
            last_error = None
            break
        except OSError as exc:
            last_error = exc
            time.sleep(0.25)
    if last_error is not None:
        raise last_error

    print("Model download complete.")
    return str(MODEL_PATH)
