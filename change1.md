Track screen geometry explicitly.
Store viewport dimensions, camera resolution, display scaling, fullscreen state, and the configuration used during calibration. Keep gaze coordinates normalized until the final conversion to CSS pixels.
Changing browser size, zoom, or display should trigger a calibration check. Simply stretching an old gaze map to fit a new window is wrong when the window occupies a different physical part of the display. Browser scaling also changes the relationship between CSS and device pixels. MDN documentation
For an explicit 3D gaze-to-screen projection, we additionally need physical display dimensions, camera position relative to the display, and camera calibration. Resolution does not supply those measurements. I’d initially use fullscreen operation and a learned mapping to the calibrated screen, avoiding false precision from guessed geometry.

Normalize the camera image before estimating gaze.
Estimate head rotation, face position, and apparent distance. Use these to align and scale the face/eye crops into the coordinate system expected by the gaze model.
This is where your “AI to normalize” idea becomes useful: provide the model with consistent views while retaining the head-position information needed to map its answer back. Geometric normalization is an established part of appearance-based gaze estimation; ETH-XGaze provides an implementation. Its preprocessing must match the chosen model’s training procedure. ETH-XGaze implementation
MediaPipe’s pose estimate can help, but we shouldn’t treat it as an exact measurement of the camera and screen geometry.

Use a model trained specifically for gaze.
Give a pretrained model the actual eye/face pixels, rather than only iris coordinates. Those pixels contain information our four-number representation discards.
Models such as iTracker demonstrate this approach using eye and face appearance. That supports the direction, but its published mobile-device results do not promise the same accuracy on your laptop webcam. We must benchmark a candidate on your setup before committing to it. GazeCapture research
I’d prototype inference locally in Python, which this repository already supports. The browser would receive timestamped predictions. Once accuracy is established, we can evaluate browser inference against the same recordings.

Calibrate for both your eyes and normal head movement.
First collect screen-wide fixations. Then repeat a few anchors while you move your head slightly left/right and nearer/farther.
Fit a small, regularized personal correction using the model’s predictions and head pose. Keep samples from different head positions separate; averaging them into one sample per target destroys the information needed for compensation.
This matters because adding head pose as an input won’t help if calibration never teaches the system what happens when your head moves.

Filter according to measurement reliability and movement.
Use a temporal estimator with separate behavior for steady fixation, rapid gaze shifts, blinks, and tracking loss:
- During fixation, suppress measurement noise strongly.
- During a supported gaze shift, respond quickly.
- During a blink or poor image, mark the estimate temporarily unavailable.
- After tracking returns, reacquire without dragging the cursor from its old position.
A Kalman-style filter is a candidate, not an accuracy fix by itself. Its measurement uncertainty must be informed by observed quality and validation errors.

Measure accuracy independently of smoothness.
Add a diagnostic screen with known fixation points and record raw predictions, corrected predictions, head pose, and filtered output. Evaluate unseen positions and separate head-movement trials.
Measure position error, stationary jitter, movement delay, and drift independently. Otherwise, a cursor that is smoothly wrong can look like progress.