# GazeBridge — Project Requirements Document

## 1. Overview

- **Project Name:** GazeBridge
- **Objective:** Build a hands-free hospital communication board for patients who temporarily cannot speak or move easily. Patients use webcam-based gaze tracking and blink confirmation to express essential needs, with nurse and emergency actions routed to an existing pager or simulated alert.

### Problem Statement

Post-operative and mobility-impaired patients may be conscious but unable to speak, reach a call button, or operate a conventional interface. GazeBridge gives them a simple, accessible way to communicate using only their eyes.

GazeBridge is an assistive communication tool. It does not diagnose conditions or replace a hospital's certified nurse-call or emergency system.

## 2. Target Audience

- **Primary Persona:** A conscious hospital patient with limited speech and body movement who can intentionally direct their gaze or blink.
- **Usage Context:** A bedside laptop or tablet with a front-facing camera, positioned approximately 40–80 cm from the patient.

## 3. Core Features (MVP)

### 3.1 Eye-Tracking Setup

- Request camera permission and confirm that the patient's face and eyes are visible.
- Run a short multi-point gaze calibration.
- Display clear tracking states: **Ready**, **Face not found**, and **Recalibration needed**.
- Keep camera processing on-device.

### 3.2 Gaze-Based Communication Board

- Present large, high-contrast request buttons.
- Highlight the button currently targeted by the patient's gaze.
- Select through configurable dwell followed by one deliberate blink for confirmation.
- Provide visible and audible confirmation after selection.
- Prevent repeated activation through a cooldown period.

### 3.3 Essential Requests

- Call Nurse
- Water
- Bathroom
- Help Me Move
- Medicine / Pain Relief
- I'm in Pain
- Food
- Change Position
- Blanket / Pillow
- Too Hot / Cold

### 3.4 Additional Requests

- Clean Me / Hygiene
- Bedpan / Waste
- Call Family
- Glasses / Belongings
- Phone / Charger
- Adjust Room
- I'm Ready to Rest

### 3.5 Urgent Requests

- Emergency Help
- Breathing Trouble
- Feeling Nauseous
- Bleeding
- Dizzy / Faint
- Feeling Unwell

Urgent actions must be visually distinct and require intentional confirmation to reduce accidental activation.

### 3.6 Request Output

- Read ordinary requests aloud using browser text-to-speech.
- Trigger a pager integration for **Call Nurse** and urgent requests.
- For the hackathon demo, the pager may be represented by a webhook, notification, buzzer, or second device.
- Show a timestamped confirmation such as **Nurse alerted at 3:54 PM**.
- If pager delivery fails, clearly tell the patient and provide an immediate retry action.

## 4. Primary User Flow

1. Patient or caregiver opens GazeBridge.
2. The app checks camera position and performs calibration.
3. The patient looks at a request button.
4. The button highlights after a short dwell.
5. The patient blinks once to confirm.
6. The app speaks the request or triggers the pager alert.
7. The app confirms the completed action and returns to the communication board.

## 5. Non-Functional Requirements

- **Performance:** Gaze feedback should appear within 150 ms. Pager requests should be dispatched within 2 seconds under normal network conditions.
- **Accessibility:** Use large targets, high contrast, simple language, recognizable icons, and adjustable dwell duration.
- **Reliability:** Freeze selection when tracking is lost and reject low-confidence input.
- **Safety:** Avoid accidental requests with dwell indication, blink confirmation, and activation cooldowns.
- **Security:** Process video locally and never record or upload webcam footage.
- **Privacy:** Store only the minimum request and delivery data needed for the active session.
- **Compatibility:** Support a modern desktop browser using HTTPS or localhost with webcam access.
- **Resilience:** Always provide recalibration and touch/mouse fallback controls for caregiver setup and demos.

## 6. Success Criteria

- A first-time user can complete calibration with caregiver assistance.
- A patient can select and hear an ordinary request without using their hands or voice.
- A patient can trigger a clearly confirmed nurse pager alert.
- The system does not activate a request from normal blinking alone during a short demonstration.
- The full patient journey can be demonstrated reliably within three minutes.

## 7. Out of Scope

- Nurse or doctor dashboard.
- Staff messaging and request-management queues.
- Clinical diagnosis or medical advice.
- Replacement of certified nurse-call or emergency infrastructure.
- Electronic health record integration.
- Patient accounts, long-term records, or analytics.
- Full gaze-controlled typing.
- Dedicated commercial eye-tracking hardware.

## 8. Future Enhancements

- Yes/No response mode with two very large targets.
- Pain severity and body-area selection.
- Multilingual labels and speech.
- Patient-specific request-board customization.
- Personalized blink sensitivity and dwell timing.
- Offline pager hardware integration.
- A simple request history visible on the patient device.

