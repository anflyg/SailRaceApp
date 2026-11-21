# TackWise Watch

> **Status:** Watch Start Timer v1.3 **product behavior approved by the owner on 2026-11-18**, with the five explicit safety/interaction decisions below. Technical design and ADR-009 remain under review; no Watch app has been implemented, tested, merged or released.
> **Scope:** First watchOS release; preserves existing iPhone Race behavior.
> **Related proposal:** [watch countdown synchronization ADR](../architecture/decisions/adr-009-watch-countdown-sync.md)
> **Build proposal:** [Watch native build and Xcode Cloud plan](../architecture/watch-build-and-release-plan.md)

## Product role and principles

TackWise Watch is a sailing-focused watch companion, not a smaller copy of the iPhone UI. Design for sunlight, motion, wet hands, strong contrast, large digits, minimal attention and conservative battery use. The previously approved initial release scope is **start countdown only**. A minimal, voluntary Sailing Workout with live heart rate is a separately approved **product direction for feasibility testing**, not an approved HealthKit implementation or production release. A watch may complete a local countdown without a phone connection; this does not mean that a phone recording has started.

The watch's proposed native implementation uses SwiftUI. Its on-watch countdown may run locally; the existing iPhone application remains the authority for local race recording and its start-gun event.

## Owner-approved product decisions (2026-11-18)

These five requirements are **approved product behavior**, not evidence that the synchronization architecture has been implemented or the native Watch constraints verified:

1. **iPhone authority on conflicts:** iPhone owns race recording and start-gun registration. When the devices have conflicting active countdowns, Watch continues its local countdown in **SOLO**, without mutating the iPhone race or silently overwriting the phone's state. Returning to a shared countdown requires an explicit user action.
2. **Timer stop does not end a race:** STOP_RESET affects countdown and scheduled gun only. A pre-gun iPhone recording is retained under existing Race rules. **End race** remains a separate confirmation-based iPhone action.
3. **Minute skip only while RUNNING:** disable SKIP_MINUTE while PAUSED; the user must resume first. Skip never changes the saved preset or schedules an immediate gun.
4. **Offline saved-preset conflict:** if only one device explicitly changed the 1–5 minute preset while disconnected, propagate that value. If **both** explicitly changed it offline and their values conflict, the **iPhone's preset wins**. Never overwrite an active countdown as a side effect of synchronizing this setting.
5. **Fail-safe restart recovery:** restore a running countdown after process/device restart **only if valid state and time continuity can be reconstructed safely**. Otherwise show a non-running/recovery state and keep the saved preset. Never fabricate a race, fire a retrospective start gun, or replay missed haptics.

The previously approved platform boundary is **one native SwiftUI Watch target inside `anflyg/SailRaceApp`**, using the existing Xcode project and Xcode Cloud as the native build environment. This choice does not approve new signing, entitlements, CI activation or distribution.

## v1 scope

- Select a preset of **1, 2, 3, 4 or 5 whole minutes**.
- Start, pause, resume, skip down to a whole minute, and stop/reset.
- Retain the most recently explicitly selected preset across app restarts and new races; default to **5:00** only on first use.
- Synchronize **commands and state changes**, not every displayed second, with TackWise Race on iPhone in both directions.
- Local vibration at **5, 4, 3, 2, 1** seconds (short) and **0** (distinctive stronger/longer effect if supported). The physical Watch Test prototype additionally uses a short beep at 5–1 (approximately 150 ms) and the **same pitch/timbre held longer** at 0 (approximately 650 ms); actual wrist-down delivery is not yet verified.
- Continue the watch countdown when connectivity is lost; never promise phone recording without confirmation.
- Return to a passive state after the gun or stop; the watch app does not need to remain active for the subsequent race.

Not in v1: watch GPS/recording, VMG, course, speed, start-line distance, cloud sync, autonomous watch account login, Watch Ultra-only hardware shortcuts or watch complications.

## Screen and interaction

Use a dark, high-contrast face with the **largest practical M:SS digits**. No persistent TackWise wordmark or decorative gauges. A small link-status indicator is optional; timing dominates the screen. The *number display itself has no tap action*.

### Approved single-digit minute display and maximal countdown size (owner decision, 2026-11-21)

- Show countdown time as **`M:SS`**, not `MM:SS`. The minute field is always **one digit** for the approved 1–5-minute presets, including `0` below one minute. Examples: `5:00`, `4:32`, `1:00`, `0:59`, `0:00`. Seconds always have two digits; never add a leading zero to minutes.
- **Maximize the countdown's readable font size and screen area**, particularly on the Apple Watch SE 2. Use responsive sizing that avoids clipping or truncation in READY, RUNNING, PAUSED and FINISHED while retaining the essential START/PAUSE/CONTINUE action and subordinate optional heart-rate display. Prefer stable, tabular digit alignment without unnecessary labels or chrome.
- This is a display/layout decision only. It does not change permitted presets, timer precision, cue timing, synchronization or race-start semantics.

### Approved minimalist countdown face (owner decision, 2026-11-20)

- In RUNNING, show only **large M:SS**, a **small heart icon and current heart rate (e.g. `124 bpm`) when HealthKit is authorized and a valid measurement is available**, and the existing **PAUSE** control. Keep the timer visually dominant and the heart rate secondary; avoid invented readings.
- **Do not display** the labels **“Startnedräkning”** or **“Seglingspass aktivt”** on the countdown face. No persistent workout-status text, permanent workout buttons, or additional decorative elements on this primary screen.
- **Owner-approved UI clarification (2026-11-21):** Never show **READY** or **RUNNING** as visible headings, labels, badges or captions on the countdown face. These are internal state names only; `M:SS` and the primary START/PAUSE control already communicate the mode. Keep the separately approved visible PAUSED indication (`PAUSAD`) if needed.
- Preserve the existing READY/PAUSED controls and accessible secondary actions. HealthKit consent, any workout indication required by watchOS, error states and a reliable workout-end action must remain understandable and accessible outside the uncluttered RUNNING face; do not conceal an ongoing workout.
- This is an **approved UI/product decision**, not evidence that the native product UI, HealthKit authorization or workout lifecycle is implemented. The separate Watch Test remains a feasibility prototype.

| State | Display | Input |
| --- | --- | --- |
| READY | Stored preset (e.g. 4:00), START | Digital Crown selects 1–5 minutes; tap START begins |
| RUNNING | Huge remaining M:SS, PAUSE button | **Short press** PAUSE; **long press** (~0.7 s) opens actions |
| PAUSED | Frozen M:SS, PAUSAD, CONTINUE | Short press CONTINUE; long press opens actions |
| FINISHED | Brief START!/0:00, then passive | New explicit start required; saved preset remains |

The long press opens **exactly two** actions: (1) **Skip to whole minute** and (2) **Stop and reset**. Opening or dismissing the action sheet must not itself pause a running timer. Dismiss without change after approximately five seconds of inactivity. Stop/reset requires an intentional second selection; never conflate long-press recognition with the short-tap pause action.

**Approved:** skip is available only in RUNNING, never PAUSED; the user resumes first if a skip is needed. The controls must be evaluated with wet fingers and water spray. A one-tap pause is intentionally fast but *cannot be guaranteed immune to water-induced taps*. Treat that as a usability test risk, not a solved platform guarantee. Do not repurpose the system Digital Crown or side button as an unsupported custom application button.

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

Persist the last **explicit** whole-minute selection, locally on both devices. A skip, pause, resume or automatic finish must not rewrite it. A stop/reset returns to that preset; a subsequent new race also defaults to it. When connected, propagate a changed preset as an event. If only one device explicitly changes the preset offline, its change propagates. If both devices explicitly change it offline and disagree, the iPhone's saved preset wins. Neither outcome changes a running countdown.

## Watch lifecycle, screen and haptics

When the watch app is explicitly opened to prepare for the start, establish the supported background execution mechanism before promising background haptics. An `HKWorkoutSession` of a suitable type is a **candidate requiring technical, App Review and privacy approval**, not permission to create a misleading workout or save unnecessary health data. Do not implement unrelated HealthKit data collection or automatically create a saved workout. If an appropriate approved background session is unavailable, report the limitation honestly.

### Proposed opt-in Sailing Workout experiment (owner product direction, 2026-11-20)

- Offer a **genuine, optional sailing fitness session** with elapsed workout duration and live heart rate; it must provide user value independent of countdown/background-execution needs. Never start HealthKit processing before an informed opt-in and the applicable authorization flow. A later countdown start can initiate an enabled workout automatically only after the user has knowingly opted into that behavior.
- Keep the main countdown screen minimalist as specified above. A sailing workout may continue after the start gun while the real activity continues, independently of the countdown and iPhone race recording. Provide an accessible, explicit way to end it and prevent unintended long-running sessions; **STOP_RESET** of the countdown is not **End race** and must not implicitly change the approved recording boundary.
- Prefer HealthKit's supported workout heart-rate and duration collection. Do **not** add a separate 30-second heart-rate log, store heart-rate summaries in TackWise races, send health data to the cloud, or enable additional Watch GPS tracking in this experiment. Review any data the platform saves automatically, including save/discard, authorization, deletion and disclosures. Health data must not be logged in diagnostics.
- Battery consumption is a feasibility gate: measure a comparable baseline and active-workout drain on the physical Watch SE 2, note active sensors and battery impact, and reject a materially excessive drain for sailing use. Minimize display redraws, polling, wireless transfers and other background work; do not imply that infrequent app-side storage reduces the Watch's workout sensor power.
- Wrist-down 5–0 audio and haptics remain **unverified**, as do HealthKit/App Review suitability and system permission behavior. Review entitlements, workout/background modes, privacy/GDPR and CRA **before implementation and release**, and do not infer approval from a successful TestFlight build.

User-approved screen behavior: **dimming/screen-off is acceptable**; on raising the wrist, the watch must show the correct time again. Do not attempt to override watchOS display policies. During a supported active session the countdown should continue even if the display is dimmed.

Haptics are locally scheduled against the valid countdown generation. Provide short distinct feedback at 5, 4, 3, 2 and 1 second, and a stronger/longer feasible pattern at 0. Never replay missed seconds or stale-generation cues after pause, skip, reset or recovery. Verify physical-watch behavior while wrist-down; UI/simulator tests alone do not establish this requirement. At the gun briefly show START! and return the **countdown** to a passive state. End any **countdown-only** background execution then; a separately opted-in genuine Sailing Workout, if later approved, may continue until explicitly ended.

## Phone/watch cooperation

**Start from iPhone:** automatic watch participation is expected only when the watch app has already been opened and its active session prepared. The iPhone must still start normally when the watch is absent. Opening the watch later may join a valid in-progress state snapshot; it must not replay missed haptics.

**Start from Watch:** the watch can start a local countdown immediately. If iPhone accepts the event, the phone begins recording through its existing start flow and acknowledges its effective state. If unavailable, show **SOLO**; neither UI may imply that phone race recording exists.

**Connected operation:** either device can select the preset, start, pause, continue, skip or stop/reset; each action sends **one event** plus state acknowledgments/recovery snapshots. No per-second transmission.

**Disconnected operation and owner-approved conflict rule:** both local timers may keep running. If they diverge, preserve iPhone's active countdown, recording and gun authority; Watch continues in **SOLO** without changing iPhone. Require an explicit user decision to return to shared state. Never replay an old command, create a retrospective race or use last-arrival-wins.

**Recording boundary (approved to preserve existing Race behavior):** iPhone's existing race logger, recovery and gun token/revision rules remain authoritative. Pre-gun pause/reset/selection retain the recording; pre-gun skip reschedules the **same** planned gun on the same race. After the gun, resuming the same countdown retains the current recording; starting a **new countdown** follows the existing Race rule that closes the prior race and starts a new one. Altering this established post-gun rule needs a separate decision. STOP_RESET is not End race; **End race** is a separate confirmation-based iPhone flow.

## Failure and recoverability

- Local countdown uses an anchored deadline / monotonic elapsed time, **not an interval tick as the source of truth**. Render to seconds from local derived time.
- Persist the selected preset separately from active countdown state.
- Duplicate, reordered or stale messages are idempotently ignored or rejected with the current state revision.
- The watch must remain usable with radio disconnected, phone out of range, or internet unavailable.
- **Approved fail-safe recovery:** after app restart, reconstruct an active countdown only when its persisted state, revision and time continuity can be trusted; otherwise fail closed to a clear non-running/recovery status with the preset restored. Never replay missed haptics, invent GPS samples or start-gun history, or register an expired gun retroactively.
- For phone process restarts, preserve the existing checkpoint/manual recovery rules in `docs/product/tackwise-race.md`.
- A receiver that does not actively participate cannot be treated as having executed a command simply because a queued message exists.

## Acceptance criteria and release gates

1. All preset selections, save/relaunch, PAUSE/CONTINUE, long-press and STOP/RESET cases pass automated tests; offline conflicting explicit preset selections resolve to the iPhone value without changing an active timer.
2. Strictly lower minute behavior matches every example above, including at exact minute boundaries and <=1:00; skip is unavailable during PAUSED.
3. A skip keeps RUNNING, changes only the current deadline and not the preset, and invalidates prior gun/haptic generation.
4. Bidirectional event sync contains **zero per-second messages**; duplicates, stale revisions, offline conflicts, iPhone-authoritative divergence/SOLO and reconnections are tested.
5. Timer STOP_RESET does **not** end an active race; the existing iPhone recording path, post-gun new-countdown behavior, gun semantics, recovery and confirmed End race are regression-tested.
6. Timing agrees within one displayed second on two connected active devices in normal conditions; out-of-range delay is not advertised as instantaneous.
7. Watch dim/raise, physical wrist-down haptics and wet-touch ergonomics are tested on a real watch.
8. No workout/Health data is unnecessarily saved; new entitlements and privacy impacts are reviewed before release. The optional Sailing Workout requires separate authorization, data-lifecycle review, physical wrist-down cue verification and comparative Watch SE 2 battery evidence before product approval.
9. An actual Xcode simulator **Build and Run** plus paired physical iPhone/Watch tests are required for native release readiness.
10. A passing PR/build is **not** authorization to merge, automatically deliver to TestFlight, or activate production.
11. Restart recovery resumes only from verifiable state/time continuity; expired alerts, retroactive start guns and reconstructed race history are forbidden.

## Future options

Future standalone watch features may include GPS speed, heading/course, race timer, VMG or race recording. Each would require new product, battery, privacy, entitlements and sync decisions. They are not implied by approval of v1.
