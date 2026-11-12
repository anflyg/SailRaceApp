# TackWise Race

## Role

TackWise Race is the primary iPhone application used before, during and immediately after a sailing race. It provides race-relevant information with very high readability while recording telemetry for later analysis.

The existing application and current code are more evolved than the original concept specification. This document therefore captures stable product intent and must be refined against the actual app before detailed behaviour is treated as final.

## A1 Pure White visual design

Use a pure white (`#FFFFFF`) canvas across Setup, Course, Start, Sailing and Analysis. Use near-black primary text, neutral dark-gray secondary text and restrained neutral rules. Remove decorative page slabs, gradients, shadows and warm off-white surfaces. Retain semantic status colors and outlined, accessible control hit areas.

The five top-level destinations remain Setup, Course, Start, Sailing and Analysis. Present them as plain text tabs with a subtle blue underline on the selected tab. Preserve the navigation behavior and touch targets.

In Sailing, FART, RIKTNING and VMG remain the dominant values and retain their existing numeric font family, weight, form and responsive size. Remove separate metric tiles. Set each small, consistently styled label left-aligned below its value in a reserved row, so it cannot overlap the number. Keep the six wind-shift indicators and their established order, outlines, colors and calculations. The bottom wind scale spans the available content width and retains its original wind degree and ±30° range. Start, Sailing and Analysis offer the confirmed End race control while recording is active, regardless of countdown state. Analysis also shows recording status. Recording continues independently of the selected view.

## Course setup

New races use the A/B two-point start line and measured wind direction. Course retains the relevant schematic and wind measurement controls, but no longer offers K1/L1 mark buttons. K1/L1 are not used to prepare or execute new races.

Mark-dependent layline guidance and VMC are retired from active sailing. Setup retains Slagvinkel (including its existing local persistence and internal Alpha naming) for the wind instruments, but has no layline on/off control. Sailing always shows wind VMG, or the existing `--` placeholder without a wind reference; it offers no VMC switch. Normal races never run layline countdowns, play layline sounds or generate new layline-tack events, including when an older saved layline setting was enabled. Do not show the old K1/L1-dependent start-line advantage in Course; no replacement bias algorithm is introduced.

Existing recordings, saved marks, layline events, VMC sample fields, exports/imports, sync and analysis contracts remain compatible. Historical mark-based leg analysis is retained when saved marks exist. Races without marks are valid configurations; the analysis UI explains that GPS/wind-based leg identification is not yet available. The product direction is to identify upwind and downwind legs after the race from GPS and wind; this change does not implement that algorithm or a data migration.

## Start

The app provides a sailing countdown timer. The original concept supports 5, 4, 3, 2 and 1 minute presets, tap to start/pause and long press to reset. Current implementation details take precedence where already established.

Starting a countdown starts recording. Before the start gun, pausing, resetting or selecting a new countdown retains the same recording; resuming or restarting schedules a fresh start gun. After the gun, resuming the same countdown keeps the current recording, while starting a new countdown closes it and starts a new race. The End race confirmation must never pause the countdown or recording while open, including across the start gun and automatic view changes. Confirming End race in Start, Sailing or Analysis stops and resets the timer to the selected minutes, invalidates the countdown and saves the recording. Ending before the gun leaves the saved attempt without a start-gun time. Cancelling confirmation leaves timer and recording unchanged. Start shows the End race control whenever a recording is active, without a recording-status text.

Opening the app alone never starts a race. If an unfinished recording is restored, pause adding race GPS samples and invalidate the old planned start until the sailor explicitly chooses Continue recording or End and save. Continue retains the race and its previous samples and records only GPS fixes obtained after that choice; End and save uses the normal confirmation. This also applies after the start gun. GPS remains available for navigation while waiting for the choice.

Start-related capability may progressively include distance/time to line, line bias and related start guidance.

## Racing view

During racing the interface prioritizes large, high-contrast, sunlight-readable information with minimal interaction. Core values include:
- speed in knots,
- course/heading,
- VMG,
- wind-relative course and the existing wind-shift instruments.

## Wind-relative course and wind-shift cues

**Approved product behavior; implementation is not implied by this specification.**

### Compass display and tack angle

Settings will offer the existing course display and a wind-relative course display. The latter uses the original wind-source heading (W) set in **Course** and the current filtered sailing course (C). It uses the full 0–360° scale:

`relativeCourse = normalizeDegrees(C - W + 180°)`

Here C is the existing filtered GPS course and W is the original wind-source direction set in Course; both must use compatible north references. For W=180°, C=135° displays 135°, C=180° displays 180°, C=225° displays 225°, and C=0° displays 0°. Do not apply half the tack angle to this large direction value. Preserve the existing size and layout of FART, RIKTNING and VMG.

The Swedish setting label is **Slagvinkel** instead of Alpha. It means the full angle between the expected close-hauled courses on port and starboard tack. The full angle is used to calculate the expected course after a tack. Half the angle is used when estimating wind direction from a close-hauled course, with the appropriate tack sign. Keep the existing internal Alpha setting name. Retain legacy layline calculations for historical compatibility; active races no longer use layline guidance.

With no wind direction recorded in Course, wind-relative compass mode and wind indicators are inactive; the ordinary compass remains available. The selected compass display mode is saved between app launches.

### Tack-relative lift and header cues

Always show six unlabeled rectangular indicators in the Sailing view: three header indicators on the left and three lift indicators on the right, separated by a vertical divider. Red always means header and green always means lift, on either tack. Thin neutral outlines remain visible when inactive; active indicators fill with their color and retain a contrasting outline. With missing or unreliable course or a missing or incompatible wind reference, and during a tack or reference establishment, all color fills are off. Each step represents 5°: [0°, 5°) shows none, [5°, 10°) one, [10°, 15°) two, and 15° or more three. Apply ±0.5° hysteresis around each threshold (5°, 10° and 15°) to prevent flicker.

The indicators show change relative to a reference locked for the current tack. Interpret the signed course change for the current tack so the colors retain the same meaning on port and starboard. Assume the sailor holds a comparable close-hauled angle; the first version does not model every steering correction.

Use the wind heading set in Course as the original wind reference. For the first upwind leg, use the same 30-second reference-establishment process as after subsequent tacks. After a detected tack, turn off all dots. Once the tack is complete, wait 30 seconds before setting a new tack reference: seconds 0–20 allow the course to settle; seconds 20–30 provide samples for a circular mean using the shared filtered course. At 30 seconds, lock that mean as the new tack reference and reactivate the dots from zero. Keep the reference fixed for that tack. A further tack before completion restarts the process.

### Wind-shift scale

Always show a compact horizontal scale at the bottom of the Sailing view. Keep its center fixed at the original Course wind heading and show that heading below the center; show `—°` when it is absent. The scale spans ±30° relative to that origin, with unlabeled marks at −20°, −10°, 0°, +10° and +20° and a longer center mark. With an approved Course wind measurement, show the green dot immediately at the center (0°), including before the start gun: initially it represents the measured original wind, not an independently verified live estimate. After an eligible, reliable course-based estimate exists, the dot shows the latest accepted wind direction relative to that original Course wind. Keep the dot visible at its last accepted position while estimation is paused (including a tack, beam/downwind sailing, loss of reliable GPS, or a view change); do not silently reset it to 0°. Clamp deviations beyond ±30° to the nearest edge. Without an approved wind measurement, show no green dot. Do not add explanatory dot labels or a history graph in the first version.

This is a course-based wind estimate, not a directly measured true-wind value. The live course and saved Course wind heading must share a north reference; withhold an estimate when that cannot be established. Reuse the existing filtered course and circular angle helpers; angle differences and averages must handle 359°/0° wrap-around. Do not add parallel course filtering.

The first version does not add new persisted telemetry or cloud processing. Any later decision to save estimated shifts must first review the privacy inventory, export/deletion behavior and logging.

### Start-gated, upwind-only wind estimation and cross-view continuity (approved 2026-11-12; not yet implemented)

A sailor may calibrate wind in Course and then maneuver freely along or parallel to the start line. An approved Course wind measurement immediately establishes the fixed scale origin and its green marker at 0°. The marker remains visible at 0° during prestart maneuvers, while all colored header/lift indicators stay inactive. Do not use any prestart GPS course samples to establish a tack reference.

Starting wind estimation and tack-reference acquisition requires **both** an approved Course wind measurement (the existing wind-quality/true-north gate) and the race countdown reaching its **0:00 start-gun event**. Starting the countdown, opening Sailing, or the later automatic tab switch do not satisfy the start-gun condition. If wind is approved only after the gun, the process begins then. On the first eligible upwind course, identify a stable tack using the existing 5-second candidate confirmation and then establish the reference using the existing 30-second procedure; an actual tack maneuver is **not** required on the first leg. The green marker stays at 0° until a reliable estimate is accepted, and colored indicators remain off until the tack reference is locked.

Wind estimation and active colored cues are permitted only on an identified, reliable upwind tack. The nominal **excluded half-plane is 90° through 270°, inclusive**, of the wind-FROM-relative course `normalizeDegrees(C - Wref)`, where 0° means sailing directly towards the wind and 180° means sailing directly downwind. Here C is the shared fresh/reliable filtered GPS course and Wref is the latest accepted wind estimate if available, otherwise the original approved Course wind heading, using compatible true-north references. **Do not confuse this gate with the existing large wind-relative compass formula** `normalizeDegrees(C - Woriginal + 180°)`, which has a different zero point. The entire excluded half-plane includes beam reaches as well as downwind sailing.

Within the excluded half-plane, do not update the wind estimate, acquire/lock a new tack reference, or fill red/green indicators. Keep the green scale marker at its last accepted position (initially 0°). Apply a small exit hysteresis around 90° and 270° so transitions back into the upwind half-plane do not chatter; entering the excluded zone must stop updates at the nominal boundary. Being outside the excluded half-plane is only a **necessary**, not sufficient, condition: all existing stable-tack, sample-quality, freshness and reference-establishment checks still apply. When returning from beam/downwind sailing to upwind, establish a new stable tack reference before resuming updates. During a tack or unreliable GPS, the marker also holds its last position and colored cues are off; use the existing safety/re-establishment rules when eligible again.

The instrument's transient runtime state and the start-gun eligibility gate must outlive individual tabs. Navigation among Setup, Course, Start, Sailing and Analysis must not clear the last accepted marker, forget a locked tack reference, or restart the 5+30-second process. The instrument can remain active after the gun regardless of which tab is visible. A **new approved Course wind measurement** deliberately resets the original wind and marker to 0° and invalidates the previous tack reference. Starting a new race resets its per-race activation/reference state as appropriate. Ending a race stops updates. Keep this state on-device only; this decision does **not** authorize new GPS/wind telemetry persistence, cloud processing, sensor streams or logs.

Acceptance examples: with approved wind FROM 180° and Slagvinkel 90°, a stable initial starboard close-hauled GPS course near 135° can establish the first reference after the gun without a tack; a later course near 145° may produce a +10° green shift once valid. A downwind course of 0° yields wind-relative 180° and freezes the last accepted marker with no filled cues. Remaining on 135° before the gun must not start reference acquisition. Switching tabs during reference acquisition must not restart its timer.

### Current implementation behavior

**Implementation snapshot (2026-11-12):** The details below describe the code as reviewed, **not** the approved start-gated/always-initialized/downwind-excluded/cross-view behavior above. Today the marker is withheld until an estimate exists, the instrument is scoped to the Sailing view, and the new start-gun/downwind eligibility rules are not fully enforced. This approved product decision is documentation only; implementation and testing remain pending.

The compass mode is stored with the existing local app settings. If the selected mode is wind-relative but the Course wind reference is absent or not marked `true-north`, the large direction value falls back to the ordinary filtered GPS course. The wind indicator outlines and scale remain visible, with no indicator fills or estimated-wind marker until a compatible reference is available. The ordinary compass remains available.

The instrument consumes `displayCourseDegrees` from the shared GPS filter, but only when the existing `courseReliable` flag is true and its presentation timestamp is no more than 5 seconds old. It adds no course filter or sensor stream.

For a wind FROM 180° and a Slagvinkel of 90°, starboard is 135° and port is 225°. Expected course is W − Slagvinkel/2 on starboard and W + Slagvinkel/2 on port; wind estimated from course is C + Slagvinkel/2 on starboard and C − Slagvinkel/2 on port. Thus a starboard course change 135°→145° is a lift (green), while a port change 225°→235° is a header (red).

The initial tack candidate is the nearer of the two expected courses. It must remain within 15° for 5 seconds. During a tack, the detector uses the latest accepted wind estimate to predict the opposite course, adjusted by no more than 35° from the current tack's wind reference, and also accepts the original Course-based prediction as a fallback. Continuous wind estimation updates while circular course deviation from the locked tack reference is at most 35°. At exactly 35° it remains in the current tack; a transition may be suspected only above 35° and when course progress is consistent with the opposite tack. The ±20° wind corridor is supporting evidence only and cannot bypass this limit. A large deviation alone never confirms a tack: the opposite course must remain within 15° for 5 seconds. Returning within 15° of the previous tack cancels the transition; a transition that does not complete within 45 seconds returns to the previous tack with indicators off.

After the first confirmed tack and each confirmed subsequent tack, the reference-establishment clock starts. Seconds 0–20 are settling time; samples from seconds 20–30 form a circular mean. At least five samples with circular RMS spread no greater than 10° are required, and the mean must remain within 15° of the expected tack course. Otherwise the detector returns to seeking a stable tack. The accepted mean is locked for that tack and indicators restart from zero.

For the locked tack reference, course changes of 5°, 10° and 15° add green lift or red header indicators according to tack; entries occur at threshold +0.5° and exits at threshold −0.5°. The six indicators appear in one compact row between speed and direction; the wind scale is a separate narrow strip at the bottom. Indicator fills are off while transitioning, establishing a reference or lacking reliable course data; neutral outlines remain visible. The wind estimate is derived from course and Slagvinkel/2, updated from reliable course while within 35° of the locked tack reference, and held through a confirmed tack until the new 30-second reference is established using the circular course mean from seconds 20–30. The scale marker shows the last accepted estimate, clamped to ±30° from the original Course wind direction.

Only measurements explicitly marked `true-north` enable these instruments. Magnetic, mock, missing and unknown frames fail closed; no declination conversion is attempted. Tack state and inferred wind are runtime display state and are not added to race recording, cloud payloads or logs.

Wind VMG, wind-relative course and wind-shift instruments require a matching finite wind heading and measurement metadata with `true-north` and `good` quality. `good` is a preliminary acceptance threshold, not a guarantee of physical angular accuracy. GPS-based values additionally require a reliable, valid course and speed and a GPS timestamp no more than five seconds old. Without a usable wind reference, use the ordinary compass, show neutral indicators and an unset wind scale, and omit wind VMG. New race samples can therefore lack wind VMG; existing recordings and exports remain unchanged.

Course shows whether the current wind measurement is **approved or not approved for VMG**, using the same `isUsableWindReference` validation as the live and recorded VMG paths. A rejected measurement shows its reason and available heading, spread, reported accuracy and quality, plus a direct remeasurement action. Explain that sample spread describes stability while heading accuracy is sensor-reported uncertainty: stable samples can still have poor reported accuracy. An approved wind reference confirms only the wind-quality gate; fresh, reliable GPS course and speed are checked separately for each VMG value. Show the same assessment from restored race metadata after the sailor resumes a saved race. This is an eligibility status, not a guarantee of absolute angle precision.

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

### Ban- och vindmetadata för en inspelning

Under förstarten uppdateras det aktiva racets sparade startlinje och vindmätning när användaren ändrar eller rensar Bana, även när nedräkningen är pausad. Omsynkronisering behåller race och prover. Efter startskottet låses racets referens; aktuell vind som skiljer sig från den sparade referensen ger ingen vind-VMG i nya prover. Efter appomstart återställs den sparade banan först när användaren väljer Fortsätt, och inga prover registreras före valet. VMG-vyn visar en kort orsak när vind eller GPS inte kan användas. En godkänd mätning garanterar inte vinkelprecision.
