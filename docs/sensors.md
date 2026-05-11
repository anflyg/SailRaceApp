# Sensor Strategy (iPhone Mast Mount)

## Mounting Assumption

SailRaceApp assumes the iPhone is mounted vertically on the mast:

- phone top edge points upward
- phone back side points toward bow
- phone screen points toward stern

The mast can rake aft, bend, and move with boat roll. This means simple compass
heading APIs or raw magnetometer vectors are not robust enough for wind capture.

## Strategy by Use Case

### While sailing (boat moving)

- Boat speed uses GPS speed.
- Boat direction uses GPS course over ground when speed is high enough to be reliable.
- Step 1 live GPS integration is implemented for the Segling view:
  - GPS speed is converted from meters per second to knots and shown as Fart when available.
  - GPS course over ground is shown as Riktning only when speed is at least 1.5 knots.
  - VMG Vind and VMG Bana calculations use filtered live GPS speed/course when both are available and reliable.
  - VMG Bana bearing-to-target uses the live GPS position when K1/L1 are set.
- Step 2 live GPS integration is implemented for the Bana view:
  - Course marks A/B/K1/L1 are saved from current live GPS latitude/longitude.
  - Each course mark stores GPS accuracy at set time and is marked good/poor.
  - If GPS position is unavailable, no fake coordinate is saved and the point remains unset.
- Start uses current GPS accuracy plus filtered speed/course over ground for TTL/BURN.
- GPS speed and course are smoothed over about 3 seconds. Course smoothing uses circular averaging.
- Segling keeps a 1.5 knot threshold for reliable COG because it drives displayed
  direction and VMG values continuously.
- TTL/BURN intentionally uses a lower 1.0 knot threshold so start-line timing can
  appear earlier during slow pre-start movement.

Reason: when the boat is moving, GPS course is stable and directly reflects over-ground motion.

### Wind direction capture (low speed / mark setup)

- Do not rely on GPS course.
- GPS course is not used for wind setting.
- Step 3 Core Motion wind capture is implemented for iOS through a small
  Capacitor-native `WindHeading` plugin.
- Use fused device orientation from iOS Core Motion.
- Compute heading from the phone back-facing vector projected to the horizontal plane.
- The back-facing vector maps to boat bow heading by mount design.
- The app samples for 2 seconds at about 10 Hz and requires at least 5 valid
  samples.
- Samples are averaged with circular averaging so headings around 0/359 degrees
  are handled correctly.
- The native plugin prefers Core Motion `xTrueNorthZVertical`.
- If true north is unavailable it falls back to `xMagneticNorthZVertical`.
- Magnetic fallback is documented but not declination-corrected yet.

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
