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

Reason: when the boat is moving, GPS course is stable and directly reflects over-ground motion.

### Wind direction capture (low speed / mark setup)

- Do not rely on GPS course.
- Use fused device orientation from iOS Core Motion (future native implementation).
- Compute heading from the phone back-facing vector projected to the horizontal plane.
- The back-facing vector maps to boat bow heading by mount design.
- Sample multiple readings during a short window (about 1-3 seconds) and average.

Reason: low-speed GPS course is noisy; mast rake, bend, and heel require tilt-aware fused attitude.

## Implementation Boundary

Current TypeScript code defines:

- sensor reading interfaces (`src/services/sensors/sensorTypes.ts`)
- heading math helpers (`src/domain/angles.ts`)
- mock service (`src/services/sensors/mockSensorService.ts`)

Native iOS/Core Motion integration is intentionally deferred for a later task.
