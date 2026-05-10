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
- Use fused device orientation from iOS Core Motion (future native implementation).
- Compute heading from the phone back-facing vector projected to the horizontal plane.
- The back-facing vector maps to boat bow heading by mount design.
- Sample multiple readings during a short window (about 1-3 seconds) and average.

Reason: low-speed GPS course is noisy; mast rake, bend, and heel require tilt-aware fused attitude.

## Implementation Boundary

Current TypeScript code defines:

- sensor reading interfaces (`src/services/sensors/sensorTypes.ts`)
- live GPS hook (`src/hooks/useLiveGps.ts`), enabled while Bana or Segling is active
- heading math helpers (`src/domain/angles.ts`)
- mock service (`src/services/sensors/mockSensorService.ts`)

Native iOS/Core Motion integration is intentionally deferred for a later task.
