# Sensor Strategy (iPhone Mast Mount)

## Mounting Assumption

TackWise Race assumes the iPhone is mounted vertically on the mast:

- phone top edge points upward
- phone back side points toward bow
- phone screen points toward stern

The mast can rake aft, bend, and move with boat roll. This means simple compass
heading APIs or raw magnetometer vectors are not robust enough for wind capture.

## Strategy by Use Case

### While sailing (boat moving)

- Boat speed uses GPS speed.
- Tactical boat direction uses fresh true-north Core Motion back-vector heading (HDG), independent of GPS speed.
- Step 1 live GPS integration is implemented for the Segling view:
  - GPS speed is converted from meters per second to knots and shown as Fart when available.
  - Riktning and the tactical wind instruments use filtered HDG, including at rest and at 0.5 knots.
  - VMG Vind and VMG Bana calculations use filtered live GPS speed/course when both are available and reliable.
  - VMG Bana bearing-to-target uses the live GPS position when K1/L1 are set.
- Step 2 live GPS integration is implemented for the Bana view:
  - Course marks A/B/K1/L1 are saved from current live GPS latitude/longitude.
  - Each course mark stores GPS accuracy at set time and is marked good/poor.
  - If GPS position is unavailable, no fake coordinate is saved and the point remains unset.
- Start uses current GPS accuracy plus filtered speed/course over ground for TTL/BURN.
- GPS speed and course are smoothed over about 3 seconds. Course smoothing uses circular averaging.
- Segling keeps the 1.5 knot threshold for GPS-based VMG.
- TTL/BURN intentionally uses a lower 1.0 knot threshold so start-line timing can
  appear earlier during slow pre-start movement.

GPS course remains the over-ground direction for VMG, start-line timing, BURN and distance; HDG reflects boat orientation and may differ due to leeway or current.

### Wind direction capture (low speed / mark setup)

- Do not rely on GPS course.
- GPS course is not used for wind setting.
- Step 3 Core Motion wind capture is implemented for iOS through a small
  Capacitor-native `WindHeading` plugin.
- Use fused device orientation from iOS Core Motion.
- Compute heading from the phone back-facing vector projected to the horizontal plane.
- The back-facing vector maps to boat bow heading by mount design.
- The app collects for a fixed 4 seconds, with sequential bridge polling every
  25 ms targeting the existing 30 Hz Core Motion stream. Actual accepted counts
  depend on device timing. At least 12 unique valid samples must span at least
  2.5 seconds, with no gap over 0.75 seconds between accepted samples. All
  accepted samples contribute to mean and spread. Motion timestamps are checked against system uptime
  (at most 1 second old, never before measurement start or in the future).
- The shared Core Motion stream is prepared for Setup, Course and Sailing while the app is active, and across tabs during an active race. It is stopped when these views no longer need it or the app backgrounds, and resumed on return. A wind capture reuses the stream and does not restart sensor fusion. Roll and pitch share the same manager.
- Core Motion `xTrueNorthZVertical` is required for wind; magnetic or arbitrary frames cannot approve wind. True north requires available location services and a magnetometer. The mounted phone's back (-Z) points toward the bow. Its horizontal projection uses the existing row-based matrix calculation, with north X and west Y; heading is clockwise from north. Assuming the attitude matrix maps reference-frame vectors to device-frame vectors, the transpose maps device -Z to (-m31, -m32, -m33) in the reference frame. Deterministic tests cover this conditional mathematics; the actual Core Motion matrix convention and physical headings still require device verification before merge or release. A near-vertical back vector is invalid.
- Every capture uses fresh, unique motion samples from its own four-second period, circular mean and circular spread. A spread above 10° is unstable. `CLHeading.headingAccuracy` is not a direct error estimate of the fused back vector and is not an acceptance requirement. Low spread indicates stability, not absolute geographic accuracy.
- Successful captures persist `qualityModel: core-motion-v1` in local race metadata and local exports. Older unmarked wind measurements are not guaranteed compatible and require remeasurement for new wind VMG. Other race data and GPS tracks remain intact. The marker replaces process-local proof, including for covered captures with fewer than 30 samples. After the gun, the race wind snapshot remains locked.
- The same wind gate serves Course, Sailing, recording and wind-shift instruments. Fresh reliable GPS course and speed remain separate prerequisites for VMG. A failed remeasurement retains the previous wind and tells the sailor.
- Physical validation before release: mount the phone as described above; orient boat/phone toward wind, measure repeatedly at known geographic north, east, south and west and with representative roll/pitch, compare with an independently corrected true-north reference, test unstable motion, background/foreground and tab changes, then verify VMG on water. Record only non-identifying observations; do not log raw GPS or race data.

Reason: low-speed GPS course is noisy; mast rake, bend, and roll require tilt-aware fused attitude.

Browser/dev fallback is separated from the iOS path:

- In a non-native browser build the wind measurement service returns a mock
  averaged heading so UI work can continue.
- On native iOS, if the Core Motion plugin or north reference is unavailable,
  the app reports failure and does not save a fake wind heading.

### Rullning/Stampning attitude

The iPhone is mounted in portrait with the back side toward the bow and the
screen toward the stern. The app does not use raw `CMAttitude.roll` and
`CMAttitude.pitch` directly for display. Instead it maps Core Motion's
gravity vector to the mounted boat axes:

- device right edge / +X = starboard
- device back side / -Z = bow
- R/rullning is positive when the starboard side rises
- S/stampning is positive when the bow rises

Yaw/heading is rotation around the vertical axis and is not used as an R/S
source. Because R/S is computed from the gravity vector's projection onto the
starboard and bow axes, yawing the phone around its vertical axis should not
materially change R/S after calibration.

Setup stores the current R/S as a runtime zero point. Segling then shows values
relative to that calibration. The calibration is not persisted across app
restart/reload.

## Implementation Boundary

Current TypeScript code defines:

- sensor reading interfaces (`src/services/sensors/sensorTypes.ts`)
- live GPS hook (`src/hooks/useLiveGps.ts`), enabled while Setup, Bana, Start or Segling is active
- wind heading hook (`src/hooks/useWindHeadingMeasurement.ts`)
- wind heading service boundary (`src/services/sensors/windHeadingService.ts`)
- heading math helpers (`src/domain/angles.ts`)
- mock service (`src/services/sensors/mockSensorService.ts`)
- iOS `WindHeadingPlugin` registered from `AppDelegate.swift`
- device attitude hook (`src/hooks/useDeviceAttitude.ts`) for runtime R/S calibration
- filtered GPS hook (`src/hooks/useFilteredGps.ts`) for calmer speed/course values
- start line geometry helpers (`src/domain/startLine.ts`) for TTL/BURN

Core Motion `CMDeviceMotion` itself does not require an extra Info.plist usage
description for this implementation. Location permission remains separate and is
used for GPS.

### Wind metadata during recording

Before the start gun, the current course and its matching wind measurement are saved with the active race; clearing the wind removes its measurement. Recovery restores the saved reference only after explicit continuation. After the gun the race reference remains fixed: recorded wind VMG requires a matching good true-north measurement and fresh reliable GPS. Screen and recorded VMG are separately validated. The `good` quality threshold is preliminary and does not guarantee angular accuracy; physical-device validation remains necessary.

### Continuous tactical HDG

The existing true-north Core Motion stream supplies the same back-vector projection used by wind capture. A three-second circular average reduces wave oscillation. Samples older than one second at the native bridge are rejected; the display and tactical engine expire after 1.5 seconds, without GPS fallback. Invalid, unavailable, backgrounded or non-true-north readings clear the current heading. The reader never starts, stops or reconfigures the stream or the four-second capture. HDG remains transient and is not recorded, uploaded or logged. Known-heading, roll/pitch, wave, tack, sensor interruption and simultaneous wind-capture tests on a physical mounted iPhone remain required before release.

### Physical iPhone HDG acceptance — 2026-11-15

**Context:** Manual smoke test on a physical iPhone, reported by the product owner as TackWise Race Xcode Cloud/TestFlight **Build 83**. The installed build's exact source commit was not independently verified from the exported race log, and continuous HDG samples are intentionally absent from that export. This record captures qualitative observations, not raw GPS tracks or race telemetry.

- **Heading without movement — accepted:** With the phone stationary, rotating it changed the large `RIKTNING` value. This supports speed-independent HDG operation, but does not by itself prove absolute true-north accuracy.
- **Steady-state heading — accepted:** The displayed direction remained stable when the phone was held still, without objectionable jitter.
- **Response time — accepted:** Following a change of orientation, the display settled in approximately **3 seconds**. The product owner accepted this balance of responsiveness and stability; **retain the existing 3-second circular averaging window** unless later sailing tests provide contrary evidence.
- **Manual handling/tilt — preliminarily accepted:** No unexpected instability was reported during the qualitative phone-handling test. This is not a calibrated mast heel/pitch or wave-motion test.

**Scope of approval:** The product owner approved the **basic HDG compass behavior** observed in Build 83. This is *not* approval of absolute geographic accuracy, the complete tactical wind-shift instruments, the native lifecycle, or a production release.

**Still required before release:** Compare HDG with an independent corrected true-north compass at known headings; verify the prescribed mast mounting with representative roll, pitch and waves; validate tack/reference establishment, lift/header cues and the ±30° wind-shift scale under sail; check sensor loss and background/foreground transitions; and test concurrent four-second wind capture. The separately pending real Xcode simulator Build and Run also remains open. Do not mark those checks as passed based on this smoke test.

