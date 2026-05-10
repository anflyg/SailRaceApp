# Sensor Strategy (iPhone Mast Mount)

## Mounting Assumption

SailRaceApp assumes the iPhone is mounted vertically on the mast:

- phone top edge points upward
- phone back side points toward bow
- phone screen points toward stern

The mast can rake aft, bend, and move with boat heel. This means simple compass
heading APIs or raw magnetometer vectors are not robust enough for wind capture.

## Strategy by Use Case

### While sailing (boat moving)

- Boat speed uses GPS speed.
- Boat direction uses GPS course over ground when speed is high enough to be reliable.
- Step 1 live GPS integration is implemented for the Segling view:
  - GPS speed is converted from meters per second to knots and shown as Fart when available.
  - GPS course over ground is shown as Riktning only when speed is at least 1.5 knots.
  - VMG/VMC calculations use live GPS speed/course when both are available and reliable.
  - VMC bearing-to-target uses the live GPS position when K1/L1 are set.
- Step 2 live GPS integration is implemented for the Bana view:
  - Course marks A/B/K1/K2/L1/L2 are saved from current live GPS latitude/longitude.
  - If GPS position is unavailable, no fake coordinate is saved and the point remains unset.

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

Reason: low-speed GPS course is noisy; mast rake, bend, and heel require tilt-aware fused attitude.

Browser/dev fallback is separated from the iOS path:

- In a non-native browser build the wind measurement service returns a mock
  averaged heading so UI work can continue.
- On native iOS, if the Core Motion plugin or north reference is unavailable,
  the app reports failure and does not save a fake wind heading.

## Implementation Boundary

Current TypeScript code defines:

- sensor reading interfaces (`src/services/sensors/sensorTypes.ts`)
- live GPS hook (`src/hooks/useLiveGps.ts`), enabled while Bana or Segling is active
- wind heading hook (`src/hooks/useWindHeadingMeasurement.ts`)
- wind heading service boundary (`src/services/sensors/windHeadingService.ts`)
- heading math helpers (`src/domain/angles.ts`)
- mock service (`src/services/sensors/mockSensorService.ts`)
- iOS `WindHeadingPlugin` registered from `AppDelegate.swift`

Core Motion `CMDeviceMotion` itself does not require an extra Info.plist usage
description for this implementation. Location permission remains separate and is
used for GPS.
