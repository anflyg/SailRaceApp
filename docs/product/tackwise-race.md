# TackWise Race

## Role

TackWise Race is the primary iPhone application used before, during and immediately after a sailing race. It provides race-relevant information with very high readability while recording telemetry for later analysis.

The existing application and current code are more evolved than the original concept specification. This document therefore captures stable product intent and must be refined against the actual app before detailed behaviour is treated as final.

## Course setup

The app supports race-course preparation, including as applicable:
- two-point start line,
- windward marks/gates,
- leeward marks/gates,
- wind direction,
- course-relative reference direction/coordinate system.

## Start

The app provides a sailing countdown timer. The original concept supports 5, 4, 3, 2 and 1 minute presets, tap to start/pause and long press to reset. Current implementation details take precedence where already established.

Start-related capability may progressively include distance/time to line, line bias and related start guidance.

## Racing view

During racing the interface prioritizes large, high-contrast, sunlight-readable information with minimal interaction. Core values include:
- speed in knots,
- course/heading,
- VMG,
- course-relative direction where a course reference exists,
- relevant mark/layline information as developed.

## Wind-relative course and wind-shift cues

**Approved product behavior; implementation is not implied by this specification.**

### Compass display and tack angle

Settings will offer the existing course display and a wind-relative course display. The latter uses the original wind-source heading (W) set in **Course** and the current filtered sailing course (C). It uses the full 0–360° scale:

`relativeCourse = normalizeDegrees(C - W + 180°)`

Here C is the existing filtered GPS course and W is the original wind-source direction set in Course; both must use compatible north references. For W=180°, C=135° displays 135°, C=180° displays 180°, C=225° displays 225°, and C=0° displays 0°. Do not apply half the tack angle to this large direction value. Preserve the existing size and layout of FART, RIKTNING and VMG.

The Swedish setting label is **Slagvinkel** instead of Alpha. It means the full angle between the expected close-hauled courses on port and starboard tack. The full angle is used to calculate the expected course after a tack. Half the angle is used when estimating wind direction from a close-hauled course, with the appropriate tack sign. Keep the existing internal Alpha setting name; do not change existing layline calculations as part of this product decision.

With no wind direction recorded in Course, wind-relative compass mode and wind indicators are inactive; the ordinary compass remains available. The selected compass display mode is saved between app launches.

### Tack-relative lift and header cues

Show three unlabeled dots for lift and three for header in the Sailing view. Green always means lift and red always means header, on either tack. Each step represents 5°: [0°, 5°) shows none, [5°, 10°) one dot, [10°, 15°) two, and 15° or more three. Apply ±0.5° hysteresis around each threshold (5°, 10° and 15°) to prevent flicker.

The dots indicate change relative to a reference locked for the current tack. Interpret the signed course change for the current tack so the colors retain the same meaning on port and starboard. Assume the sailor holds a comparable close-hauled angle; the first version does not model every steering correction.

Use the wind heading set in Course as the original wind reference. For the first upwind leg, use the same 30-second reference-establishment process as after subsequent tacks. After a detected tack, turn off all dots. Once the tack is complete, wait 30 seconds before setting a new tack reference: seconds 0–20 allow the course to settle; seconds 20–30 provide samples for a circular mean using the shared filtered course. At 30 seconds, lock that mean as the new tack reference and reactivate the dots from zero. Keep the reference fixed for that tack. A further tack before completion restarts the process.

### Wind-shift scale

Add a compact horizontal scale to the Sailing view. Keep its center fixed at the original Course wind heading; show that heading in degrees at the center. The scale spans ±30° relative to that origin. A green dot marks the latest reliable estimated wind direction relative to that origin. Clamp the dot to the nearest scale edge for deviations beyond ±30°. Hold the last valid dot through a tack until a newer estimate is available. Do not add explanatory dot labels or a history graph in the first version.

This is a course-based wind estimate, not a directly measured true-wind value. The live course and saved Course wind heading must share a north reference; withhold an estimate when that cannot be established. Reuse the existing filtered course and circular angle helpers; angle differences and averages must handle 359°/0° wrap-around. Do not add parallel course filtering.

The first version does not add new persisted telemetry or cloud processing. Any later decision to save estimated shifts must first review the privacy inventory, export/deletion behavior and logging.

### Decisions still needed before implementation

- Tack detection and port/starboard classification criteria.
- How to handle the existing true-north versus magnetic-north wind-measurement fallback when it does not match the live course reference.

## Race recording

Race telemetry is recorded locally and must not depend on cloud availability. Recorded data may include timestamp, position, accuracy, speed, course over ground, heading, sensor-derived values, course configuration and race events.

Raw recordings remain local until synchronization succeeds.

The first cloud flow follows [ADR-003](../architecture/decisions/adr-003-first-race-upload-and-sync.md): completed races remain locally available while authenticated prepare/upload/finalize runs opportunistically. Interrupted sync returns to a persistent queue; entitlement rejection blocks only cloud acceptance; permanent validation failure never deletes the local recording.

## After race

The iPhone app should provide a lightweight summary and sync status. Detailed analysis belongs primarily in TackWise Analysis.

Possible summary values include elapsed time, sailed distance, average/max speed, manoeuvre counts and basic VMG statistics.

## Non-functional requirements

- Offline-first for race-critical functionality.
- High contrast and sunlight readability.
- Screen behaviour suitable for active sailing use.
- Minimal interaction while sailing.
- GPS/race data treated as personal data.
