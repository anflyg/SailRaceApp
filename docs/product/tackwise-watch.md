# TackWise Watch

> **Status:** Watch Start Timer v1.3 **product proposal**, not an accepted architecture decision or implemented feature.
> **Scope:** First watchOS release; preserves existing iPhone Race behavior.
> **Related proposal:** [watch countdown synchronization ADR](../architecture/decisions/adr-009-watch-countdown-sync.md)
> **Build proposal:** [Watch native build and Xcode Cloud plan](../architecture/watch-build-and-release-plan.md)

## Product role and principles

TackWise Watch is a sailing-focused watch companion, not a smaller copy of the iPhone UI. Design for sunlight, motion, wet hands, strong contrast, large digits, minimal attention and conservative battery use. The initial release is a **start countdown only**. A watch may complete a local countdown without a phone connection; this does not mean that a phone recording has started.

The watch's proposed native implementation uses SwiftUI. Its on-watch countdown may run locally; the existing iPhone application remains the authority for local race recording and its start-gun event.

## v1 scope

- Select a preset of **1, 2, 3, 4 or 5 whole minutes**.
- Start, pause, resume, skip down to a whole minute, and stop/reset.
- Retain the most recently explicitly selected preset across app restarts and new races; default to **5:00** only on first use.
- Synchronize **commands and state changes**, not every displayed second, with TackWise Race on iPhone in both directions.
- Local vibration at **5, 4, 3, 2, 1** seconds (short) and **0** (distinctive stronger/longer effect if supported).
- Continue the watch countdown when connectivity is lost; never promise phone recording without confirmation.
- Return to a passive state after the gun or stop; the watch app does not need to remain active for the subsequent race.

Not in v1: watch GPS/recording, VMG, course, speed, start-line distance, cloud sync, autonomous watch account login, Watch Ultra-only hardware shortcuts or watch complications.

## Screen and interaction

Use a dark, high-contrast face with the **largest practical MM:SS digits**. No persistent TackWise wordmark or decorative gauges. A small link-status indicator is optional; timing dominates the screen. The *number display itself has no tap action*.

| State | Display | Input |
| --- | --- | --- |
| READY | Stored preset (e.g. 4:00), START | Digital Crown selects 1–5 minutes; tap START begins |
| RUNNING | Huge remaining MM:SS, PAUSE button | **Short press** PAUSE; **long press** (~0.7 s) opens actions |
| PAUSED | Frozen MM:SS, PAUSAD, CONTINUE | Short press CONTINUE; long press opens actions |
| FINISHED | Brief START!/00:00, then passive | New explicit start required; saved preset remains |

The long press opens **exactly two** actions: (1) **Skip to whole minute** and (2) **Stop and reset**. Opening or dismissing the action sheet must not itself pause a running timer. Dismiss without change after approximately five seconds of inactivity. Stop/reset requires an intentional second selection; never conflate long-press recognition with the short-tap pause action.

**Proposed edge-case choice, awaiting approval:** skip is available only in RUNNING, not PAUSED. The controls must be evaluated with wet fingers and water spray. A one-tap pause is intentionally fast but *cannot be guaranteed immune to water-induced taps*. Treat that as a usability test risk, not a solved platform guarantee. Do not repurpose the system Digital Crown or side button as an unsupported custom application button.

### Skip-to-minute rule

While RUNNING, replace the current remaining time with the nearest **strictly lower whole minute** if the result is at least 1:00; then keep running immediately. The command updates the scheduled gun time and invalidates the prior countdown generation's pending haptics and gun callback. It never modifies the saved preset.

Examples:

| Before | After |
| --- | --- |
| 4:34 | 4:00 |
| 3:13 | 3:00 |
| 3:00 | 2:00 |
| 2:56 | 2:00 |
| 2:00 | 1:00 |
| 1:23 | 1:00 |
| 1:00 or less | Disabled |

Compute the destination at the moment the user selects the action, not when the action sheet opens. If the available remaining time has decreased to 1:00 or less, reject the action safely. Never skip to zero. Multiple skips are allowed in one countdown.

### Persisted preset

Persist the last **explicit** whole-minute selection, locally on both devices. A skip, pause, resume or automatic finish must not rewrite it. A stop/reset returns to that preset; a subsequent new race also defaults to it. When connected, propagate a changed preset as an event. Conflicting offline preset changes require a deterministic rule (proposed in the ADR), without rewriting the running countdown.

## Watch lifecycle, screen and haptics

When the watch app is explicitly opened to prepare for the start, establish the supported background execution mechanism before promising background haptics. An `HKWorkoutSession` of a suitable type is a **candidate requiring technical, App Review and privacy approval**, not permission to create a misleading workout or save unnecessary health data. Do not implement unrelated HealthKit data collection or automatically create a saved workout. If an appropriate approved background session is unavailable, report the limitation honestly.

User-approved screen behavior: **dimming/screen-off is acceptable**; on raising the wrist, the watch must show the correct time again. Do not attempt to override watchOS display policies. During a supported active session the countdown should continue even if the display is dimmed.

Haptics are locally scheduled against the valid countdown generation. Provide short distinct feedback at 5, 4, 3, 2 and 1 second, and a stronger/longer feasible pattern at 0. Never replay missed seconds or stale-generation cues after pause, skip, reset or recovery. Verify physical-watch behavior while wrist-down; UI/simulator tests alone do not establish this requirement. At the gun briefly show START!, then end the background session and return to a passive state.

## Phone/watch cooperation

**Start from iPhone:** automatic watch participation is expected only when the watch app has already been opened and its active session prepared. The iPhone must still start normally when the watch is absent. Opening the watch later may join a valid in-progress state snapshot; it must not replay missed haptics.

**Start from Watch:** the watch can start a local countdown immediately. If iPhone accepts the event, the phone begins recording through its existing start flow and acknowledges its effective state. If unavailable, show **SOLO**; neither UI may imply that phone race recording exists.

**Connected operation:** either device can select the preset, start, pause, continue, skip or stop/reset; each action sends **one event** plus state acknowledgments/recovery snapshots. No per-second transmission.

**Disconnected operation:** both local timers may keep running; upon reconnection, do not silently force an older command onto the other side or retroactively create a race. A genuine conflict needs a safe status and explicit user action, not last-arrival-wins.

**Recording boundary:** the phone's existing race logger, recording recovery and gun token/revision rules remain authoritative. Pre-gun pause/reset/selection must not delete a recording; pre-gun skip reschedules the **same** planned gun on the same race. A new countdown after an existing gun must never silently close an active recording. Ending a race is a separate iPhone flow with confirmation.

## Failure and recoverability

- Local countdown uses an anchored deadline / monotonic elapsed time, **not an interval tick as the source of truth**. Render to seconds from local derived time.
- Persist the selected preset separately from active countdown state.
- Duplicate, reordered or stale messages are idempotently ignored or rejected with the current state revision.
- The watch must remain usable with radio disconnected, phone out of range, or internet unavailable.
- After app restart, reconstruct an active countdown only when its state and clock continuity can be trusted; otherwise fail closed to a clear stopped/recovery status with the preset restored. Do not invent GPS samples or start-gun history.
- For phone process restarts, preserve the existing checkpoint/manual recovery rules in `docs/product/tackwise-race.md`.
- A receiver that does not actively participate cannot be treated as having executed a command simply because a queued message exists.

## Acceptance criteria and release gates

1. All preset selections, save/relaunch, PAUSE/CONTINUE, long-press and STOP/RESET cases pass automated tests.
2. Strictly lower minute behavior matches every example above, including at exact minute boundaries and <=1:00.
3. A skip keeps RUNNING, changes only the current deadline and not the preset, and invalidates prior gun/haptic generation.
4. Bidirectional event sync contains **zero per-second messages**; duplicates, stale revisions, offline conflicts and reconnections are tested.
5. The iPhone recording path, existing gun semantics, recovery and End race confirmation are regression-tested.
6. Timing agrees within one displayed second on two connected active devices in normal conditions; out-of-range delay is not advertised as instantaneous.
7. Watch dim/raise, physical wrist-down haptics and wet-touch ergonomics are tested on a real watch.
8. No workout/Health data is unnecessarily saved; new entitlements and privacy impacts are reviewed before release.
9. An actual Xcode simulator **Build and Run** plus paired physical iPhone/Watch tests are required for native release readiness.
10. A passing PR/build is **not** authorization to merge, automatically deliver to TestFlight, or activate production.

## Future options

Future standalone watch features may include GPS speed, heading/course, race timer, VMG or race recording. Each would require new product, battery, privacy, entitlements and sync decisions. They are not implied by approval of v1.
