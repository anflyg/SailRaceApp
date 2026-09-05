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

## Race recording

Race telemetry is recorded locally and must not depend on cloud availability. Recorded data may include timestamp, position, accuracy, speed, course over ground, heading, sensor-derived values, course configuration and race events.

Raw recordings remain local until synchronization succeeds.

## After race

The iPhone app should provide a lightweight summary and sync status. Detailed analysis belongs primarily in TackWise Analysis.

Possible summary values include elapsed time, sailed distance, average/max speed, manoeuvre counts and basic VMG statistics.

## Non-functional requirements

- Offline-first for race-critical functionality.
- High contrast and sunlight readability.
- Screen behaviour suitable for active sailing use.
- Minimal interaction while sailing.
- GPS/race data treated as personal data.
