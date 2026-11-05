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

### Current implementation behavior

The compass mode is stored with the existing local app settings. If the selected mode is wind-relative but the Course wind reference is absent or not marked `true-north`, the large direction value falls back to the ordinary filtered GPS course and the wind instruments are hidden. The ordinary compass remains available.

The instrument consumes `displayCourseDegrees` from the shared GPS filter, but only when the existing `courseReliable` flag is true and its presentation timestamp is no more than 5 seconds old. It adds no course filter or sensor stream.

The initial tack candidate is the nearer of the two courses at W ± Slagvinkel/2. It must remain within 15° for 5 seconds. After a tack, the detector uses the latest accepted wind estimate to predict the opposite course, limited to a 25° adjustment from the current tack's wind reference, and also accepts the original Course-based prediction as a fallback. A transition starts after sufficient progress toward the opposite course, when the ±20° wind corridor supports that progress, or on arrival at a predicted opposite course. The corridor is supporting evidence, not a required sample. The opposite course must then remain within 15° for 5 seconds. Returning within 15° of the previous tack cancels the transition; a transition that does not complete within 45 seconds returns to the previous tack with indicators off.

After the first confirmed tack and each confirmed subsequent tack, the reference-establishment clock starts. Seconds 0–20 are settling time; samples from seconds 20–30 form a circular mean. At least five samples with circular RMS spread no greater than 10° are required, and the mean must remain within 15° of the expected tack course. Otherwise the detector returns to seeking a stable tack. The accepted mean is locked for that tack and indicators restart from zero.

For the locked tack reference, course changes of 5°, 10° and 15° add green lift or red header dots according to tack; entries occur at threshold +0.5° and exits at threshold −0.5°. All dots are off while transitioning, establishing a reference or lacking reliable course data. The wind estimate is derived from course and Slagvinkel/2, updated from reliable course while within 25° of the locked tack reference, and held during a detected transition. The scale marker shows the last accepted estimate, clamped to ±30° from the original Course wind direction.

Only measurements explicitly marked `true-north` enable these instruments. Magnetic, mock, missing and unknown frames fail closed; no declination conversion is attempted. Tack state and inferred wind are runtime display state and are not added to race recording, cloud payloads or logs.

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
