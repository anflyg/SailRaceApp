# ADR-009: Watch countdown sync and iPhone recording boundary (approved product requirements; technical design proposed)

- **Status:** MIXED: five **product requirements approved 2026-11-18**; protocol/bridge implementation and native feasibility remain **PROPOSED and unverified**. Not a released or fully accepted implementation ADR.
- **Scope:** Apple Watch Start Timer v1 with paired TackWise Race on iPhone
- **Owner decision:** approved five explicit rules for iPhone authority/SOLO conflicts, timer STOP versus End race, RUNNING-only minute skip, iPhone preference for conflicting explicit offline preset changes, and safe restart recovery. The remainder of the exact synchronization protocol is a proposed technical implementation needing review.
- **Separately approved decision (2026-11-18):** Watch v1 stays as a SwiftUI watchOS target in `anflyg/SailRaceApp`'s existing Xcode project and uses Xcode Cloud for builds; see the build plan. Neither product nor repo decisions approve HealthKit entitlements, technical implementation, CI activation, signing, merge or release.
- **Product proposal:** [TackWise Watch](../../product/tackwise-watch.md)
- **Build/release proposal:** [Watch build and Xcode Cloud](../watch-build-and-release-plan.md)

## Context

TackWise Race is offline-first. Its current Start view owns a local second-tick UI, but `raceLogger` owns a separate planned start time, countdown revision/token, and iPhone race recording. Starting countdown starts local recording; pre-gun pause/reset retains it; after the gun a new countdown can close a current race. A new iPhone process applies checkpoint/recovery rules, potentially finalizing an earlier active recording. Watch support must not bypass these established controls.

Watch v1 needs a local timer that keeps working when the connection drops, with two-way **event** sync (no second-by-second traffic). A watch-only timer cannot create or guarantee a phone recording.

## Owner-approved behavior and proposed technical realization

### Five accepted product constraints (2026-11-18)

1. **iPhone authoritative for race/gun and shared-state conflicts:** preserve iPhone race recording and start-gun authority. If independent watch/phone countdowns diverge, Watch remains locally RUNNING in **SOLO**, without mutating iPhone's countdown or race. An explicit user action is required to return to shared state.
2. **STOP_RESET is not End race:** timer stop invalidates countdown/planned gun but does **not** stop a pre-gun race recording. Preserve the separate confirmed iPhone End race flow and existing post-gun recording behavior.
3. **SKIP_MINUTE only while RUNNING:** while PAUSED the skip action is unavailable; first resume, then skip if more than 1:00 remains. A skip never changes persisted duration.
4. **Offline preset conflicts:** if exactly one device explicitly changed its stored preset offline, propagate it. If both independently changed and disagree, **iPhone's stored preset wins**, with no effect on active countdowns. Do not use wall-clock last-writer-wins.
5. **Conservative app restart recovery:** resume a countdown only when its state/revision and time continuity can be reconstructed safely. Otherwise fail closed to a stopped/recovery state; never backfill race data, retrospectively mark a gun, or replay missed cues.

The sections below describe the **proposed technical protocol** for implementing these approved behavior constraints. They are not all themselves accepted architecture decisions.

### Source of truth and ownership

- **iPhone** exclusively owns the race recording lifecycle, local race ID, scheduled start gun and validity token/revision. Never let a watch message call recording persistence through a separate competing implementation.
- A **watch-local countdown** may run independently. Being locally RUNNING does not assert phone recording authority.
- Keep preset configuration separate from the active countdown. Store the last explicitly selected 1–5 minute preset on each device; a skip does not change the preset.
- Add a small native iOS/Capacitor bridge to the established countdown domain/service rather than having a second JS-only timer plus parallel native race logger.

### Command/state envelope (conceptual; finalize exact schema after native feasibility)

- Protocol version, opaque countdown-session UUID, unique command UUID, origin device, command kind, expected revision, bounded parameters.
- Acknowledgment/state snapshot includes accepted revision, READY/RUNNING/PAUSED/FINISHED, preset, effective current remaining/deadline, recording acceptance status and relevant clock-correlation data.
- Commands: SET_DURATION, START, PAUSE, RESUME, SKIP_MINUTE, STOP_RESET. Gun/completion is a *derived event* and should never be replayed as a stand-alone command authorizing recording.
- The authoritative revision advances for each accepted connected transition. Reject malformed, duplicate, old-generation, invalid-transition and stale-expected-revision commands; respond with the actual state.
- Only **one** side may authorize a connected shared transition at a time (iPhone when reachable). Watch may optimistically show its local action, but must indicate **pending** until accepted; on rejection it must not silently claim shared sync.
- Preserve the iPhone logger's gun token/revision protection. A replaced deadline invalidates all prior pending gun callbacks and haptics; a gun must be idempotent per accepted generation.

### Timekeeping

- Time remaining is calculated from a **deadline/timestamp anchor and monotonic elapsed time**, not by subtracting one on each UI tick.
- Paused state stores remaining duration; resuming/skipping creates a new anchor and revision.
- Because monotonic clocks differ across devices, the protocol must establish an offset/delay estimate or use a bounded timestamp exchange and measure effective skew. Do not merely exchange raw monotonic times or assume clocks match.
- **Approved:** skip-minute is a **strict floor** to the next lower whole minute of *displayed* time, **only while RUNNING, never PAUSED**, only when the target is >=60 s. At 3:00 -> 2:00; at 2:56 -> 2:00; at <=1:00 -> reject. Source of truth evaluates the action at acceptance; stale menu values cannot cause a gun.
- Target acceptance: <=1 displayed second discrepancy for actively connected devices under normal conditions. Not a network guarantee offline.

### Connectivity, reconciliation, and recovery

- Use WatchConnectivity immediate messaging only when the counterpart can participate; separately maintain latest state via the system-provided deferred context mechanism. No per-second messages or cloud.
- An unanswered watch command does not prove the phone applied it. Watch continues its local timer and marks it as SOLO/PENDING as appropriate.
- **Approved:** if both sides continue offline and diverge, do **not** use arrival-time last-writer-wins to mutate the active race. Preserve phone recording and the iPhone countdown; the watch stays in **SOLO** with its local timer until explicit user action reconciles it.
- **Approved:** if only one side explicitly changed its selected preset offline, propagate it on reconnection; if both independently changed the preset and their values conflict, the **iPhone preset wins**, without changing any active countdown. Do not infer freshness solely from an untrusted device-wall-clock timestamp.
- A watch that opens late may join a valid phone state snapshot. Missed vibration cues are not replayed. A watch not opened/prepared cannot be promised reliable activation of a workout/background session by a phone start.
- New-process iPhone recovery must preserve the documented checkpoint/manual intervention behavior; do not synthesize race history or retroactively start recording on reconnection.
- **Approved:** Watch relaunch restores the preset and resumes an active timer only when trusted local state/revision and time/session continuity permit; otherwise fail closed to an explicit non-running/recovery state. No retrospective gun or missed alerts.

### Phone recording semantics and STOP

- Start from iPhone always follows the current phone path, whether or not watch is available.
- Accepted watch START triggers the existing iPhone recording-start path once; no recording claim before acknowledgement.
- **Approved:** before gun, PAUSE, SKIP, STOP_RESET and preset changes retain the active recording as established. SKIP reschedules the **same** race's planned gun and invalidates older gun tokens. SKIP is unavailable while PAUSED.
- STOP_RESET affects only the countdown, not the separately confirmed **End race** flow.
- **Preserve existing iPhone Race behavior:** after gun, resuming the same countdown retains the recording; starting a **new countdown** closes the current recording and starts a new race as documented in `docs/product/tackwise-race.md`. A new requirement for mandatory confirmation before this transition would be a separate, not-yet-approved change; do not silently alter it in Watch v1.
- At 0, phone registers a valid gun at most once and continues recording; watch gives haptics, displays START! and returns to passive mode. Never infer that a watch-only 0 means phone gun occurred.

## Alternatives rejected (proposal)

- Second-by-second remote ticks: high traffic, fragile, unnecessary.
- Cloud-authoritative start timer: conflicts with offline-first and increases latency and infrastructure complexity.
- Blind last-writer-wins event replay on reconnect: could overwrite a newer countdown or create a false gun.
- Independent watch-controlled race logger: conflicts with iPhone recording and recovery authority.

## Security/privacy/CRA review gates

The watch transmits only opaque session/control metadata; no location samples, auth tokens, user email, private R2 keys or cloud access. Validate command schema, bounded value domains, idempotency and versioning. Watch workout-background execution (if adopted) requires separate review of HealthKit entitlements, App Review legitimacy, privacy manifests, permissions, actual health/workout data processing and saved workout handling. No cloud data/contract change is approved. Record changes in appropriate existing security/privacy documentation before release.

## Acceptance and evidence required

- Unit/fake-clock tests: transitions, strict minute-floor, duplicate/out-of-order commands, race token invalidation, delayed or lost acks, independent offline edits, reconnection and recovery.
- Regression tests: current phone race logging, start gun, previous-process recovery, End race confirmation.
- Native Xcode simulator Build and Run; paired real iPhone + Watch test for locked/background phone, wrist-down haptics, screen dim/raise, permissions, touch/rain behavior.
- Document clock skew, observed sync delay, missing HealthKit capabilities and exact platform/model constraints. CI success is not equivalent to physical-hardware evidence or permission to ship.

## Approval state

The product owner **approved five product constraints** plus the single-repository SwiftUI Watch target/Xcode Cloud approach on 2026-11-18. Detailed protocol mechanisms (including precise clock-offset estimation, message envelope, pending ACK UI and reconciliation implementation) are still **PROPOSED** pending technical review. Native feasibility, HealthKit legitimacy, signing and entitlement/privacy reviews remain unverified. No CI activation, TestFlight release or merge is authorized by this draft.
