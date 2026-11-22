# TackWise Watch v1 – platform feasibility register

> **Status (2026-11-18):** DOCUMENTATION AND SOURCE REVIEW COMPLETE; NATIVE / PAIRED-DEVICE VERIFICATION NOT STARTED.
>
> This is evidence for a limited technical feasibility gate, **not** an accepted entitlement/security decision, working proof of concept, passed native build, or release authorization.
>
> Related: [Watch v1.3 product decisions](../product/tackwise-watch.md), [ADR-009 – sync design under review](decisions/adr-009-watch-countdown-sync.md), [approved repository/Xcode Cloud direction](watch-build-and-release-plan.md).

## Executive finding

There is a documented native path for watch countdown/background execution, but **two blockers to a verified implementation remain**:

1. **Wrist-down haptics:** Apple's haptic API is inactive in background/inactive app states except with an **active workout**. `HKWorkoutSession.prepare()` permits background execution without starting workout data collection, but **does not document that haptics work in prepared-only state**. This must be tested with a real paired Apple Watch. A running workout may cause HealthKit data processing, and using a workout merely to unlock haptics needs an explicit purpose/privacy/App Review review.
2. **Watch START → phone recording:** WatchConnectivity can wake the native iPhone companion from a live Watch message, but this does **not** prove that the suspended or locked Capacitor WebView/JavaScript runtime can execute the existing `startRaceLogging` path. Native receipt and **acknowledged race command completion** are separate checkpoints.

**No Watch code or Xcode Cloud workflow was created; no device-level tests ran.**

## Apple primary-source evidence (checked 2026-11-18)

| ID | Supported by Apple documentation | Limitation / gate |
| --- | --- | --- |
| P1 | `HKWorkoutSessionState.prepared` allows continued watch background execution after wrist lowering, **without yet generating workout data**. [Apple: prepared state](https://developer.apple.com/documentation/healthkit/hkworkoutsessionstate/prepared); [prepare()](https://developer.apple.com/documentation/healthkit/hkworkoutsession/prepare%28%29) | **No documented guarantee of background haptics in prepared-only state**. |
| P2 | An **active** workout session can continue running in watch background and alert using audio/haptics. Apple describes workout processing background mode and, in its workout guide, Audio background mode when delivering workout audio/haptics. [Apple: running workout sessions](https://developer.apple.com/documentation/healthkit/running-workout-sessions) | Capability and background mode changes need separate approval, not silent insertion in an isolated countdown app. |
| P3 | `WKInterfaceDevice.play(_:) ` has no effect in ordinary `background` or `inactive` states, except apps with an active workout session. Calls interrupt existing feedback and impose a delay when too close together. [Apple: play haptic](https://developer.apple.com/documentation/watchkit/wkinterfacedevice/play%28_%3A%29) | Six cues at 1 Hz, especially the distinguishable zero cue, must be tried on a physical Watch. A custom arbitrary-strength/length vibration is not guaranteed by `WKHapticType`. |
| P4 | Always On can show the app while frontmost or in a background session, but dims and throttles updates. A background session can update time roughly once a second; inactive frontmost views are normally throttled further. On models without Always On the screen can go off. [Apple: Always On](https://developer.apple.com/documentation/watchos-apps/designing-your-app-for-the-always-on-state); [timeline cadence](https://developer.apple.com/documentation/watchos-apps/updating-watchos-apps-with-timelines) | **Owner accepts screen dim/off**, provided raising wrist shows the correct derived time. Verify supported device/OS and actual behavior; don't require continuous full brightness. |
| P5 | A live `WCSession.sendMessage` **from Watch** can wake the iOS companion in the background. iPhone-originated `sendMessage` **does not wake Watch**. Immediate delivery depends on session activation and reachability. [Apple: sendMessage](https://developer.apple.com/documentation/watchconnectivity/wcsession/sendmessage%28_%3Areplyhandler%3Aerrorhandler%3A%29); [isReachable](https://developer.apple.com/documentation/watchconnectivity/wcsession/isreachable) | Does **not** establish success of background Capacitor JS processing, race logging or a phone command initiated while Watch unopened. |
| P6 | `updateApplicationContext` provides latest replaceable snapshot; `transferUserInfo` queues eventual background transfers; neither guarantees timely START/PAUSE execution. Apple asks developers to test WatchConnectivity on physical paired hardware. [Apple: data transfers](https://developer.apple.com/documentation/watchconnectivity/transferring-data-with-watch-connectivity) | **Do not replay delayed queued START/STOP as new real-time commands.** Use context for state recovery, not retrospective recording. |
| P7 | Watch background modes must correspond to the application's purpose and a session must begin in foreground. [Apple: enabling background sessions](https://developer.apple.com/documentation/watchkit/enabling-background-sessions) | Watch app is required to be opened/prepared before reliable phone-initiated shared start, consistent with approved v1.3 behavior. |
| P8 | `WKExtendedRuntimeSession` serves specific self-care, mindfulness, physical-therapy or smart-alarm purposes; Apple instructs selection by intended use. [Apple: extended runtime](https://developer.apple.com/documentation/watchkit/using-extended-runtime-sessions) | **Not an approved workaround** for sailing countdown/background haptics. Similarly no fake background audio/location sessions. |
| P9 | Apple App Review 2.5.1 requires HealthKit to be used for health/fitness purposes; 5.1.3 protects sensitive health data and forbids inaccurate HealthKit writes. Apple workout docs describe automatically saved activity metrics for workout activity. [Apple: review guidelines](https://developer.apple.com/app-store/review/guidelines/); [workouts](https://developer.apple.com/documentation/healthkit/running-workout-sessions) | A **start countdown alone** has an unclear basis for a persistent HealthKit workout session. Require review of actual sampled data, disclosure, authorization UX and end/discard behavior before adding capabilities. Do not state "no Health data stored" without measurement. |

These facts support the **architecture direction**, not an assurance that all watchOS requirements are feasible as stated. No Apple documentation alone establishes a passed device test or App Review acceptance.

## Checked SailRaceApp source and integration points

Checked against current `main` as of 2026-11-18:

- `src/hooks/useCountdown.ts`: current iPhone UI countdown decrements state using `window.setInterval(1000)`. Rendering ticks are **not** a safe shared clock during suspends; a future monotonic/deadline model is needed.
- `src/features/timer/StartTimerView.tsx`: existing tap toggles start/pause; display long press resets; current view registers gun on crossing zero and navigates after ~10 seconds. Watch-specific UI must not silently change phone behavior.
- `src/app/AppShell.tsx`: `handleCountdownStart` calls `startRaceLogging`, `handleStartGun` calls `markStartGun`; `onCountdownResume` uses `updatePlannedStart`, `onCountdownPause` uses `pausePlannedStart`. This flow runs from the React application, not a native WatchConnectivity bridge.
- `src/services/raceLogger.ts`: already maintains a planned time and start-gun revision token. Preserve token semantics; new watch deadlines must invalidate prior tokens on SKIP/PAUSE/STOP.
- `src/app/AppShell.tsx` calls `useWakeLock(true)`; `src/services/sensors/wakeLockService.ts` uses Capacitor KeepAwake. This is a **foreground screen-awake request**, not proof of unrestricted iOS background processing.
- `ios/App/App.xcodeproj` currently contains the iPhone target but no Watch app target; `ios/App/ci_scripts/ci_post_clone.sh` prepares node modules and Capacitor assets in Xcode Cloud. Actual Cloud workflows, signing, App ID and Watch entitlements remain **unverified**.
- Preserve `docs/product/tackwise-race.md` recording start, pre-gun retention, post-gun transitions, confirmed End race and new-process checkpoint/manual recovery. No new race logger is authorized in native Swift.
- Keep `docs/privacy/privacy-design.md` and `docs/security/cra-risk-assessment.md` as pre-implementation privacy/CRA control baselines.

## Minimal, priority-ordered hardware experiment plan

Use the **existing** `anflyg/SailRaceApp` repo and Xcode project only after the owner approves the minimum Watch target/signing/entitlement setup for a proof of concept. Do not activate production CI, TestFlight or capabilities in this documentation step.

| Test | Experiment | Pass/fail evidence |
| --- | --- | --- |
| H1 | On a real Watch, open a minimal countdown, call `HKWorkoutSession.prepare()`; lower and raise wrist, capture session state and display continuity | Background lifecycle and correct time on wrist-raise; classify prepared-only haptic **untested** until H2 |
| H2 | With permitted capability and prepared-only session, attempt distinct local cues at 5→0 with wrist down | Document each cue heard/felt, timestamps, missed callbacks, app/session state. **May fail** if active workout required |
| H3 | If appropriate and separately authorized, repeat with an **active Sailing workout session**, then inspect Health storage and cleanup | Confirm wrist-down 5→0 cues, absence/presence of generated health data, permission behavior, CPU/battery and complete end of session |
| H4 | Minimal Watch `sendMessage` with reply → iPhone native `WCSessionDelegate` while phone foreground, locked, then app backgrounded | Record physical callback delivery and latency separately; **do not call it race recording** |
| H5 | With a safe experimental bridge, compare native message receipt with a callback actually executed by the current Capacitor JS runtime under the same three phone states | A race action is only **accepted** when actual JS path has executed/recorded it. If JS unavailable, Watch remains SOLO with no false ACK |
| H6 | Send iPhone → Watch while watch app open, dimmed, then unopened; test eventual snapshot | No invented wake-up promise; late joining gets correct time and no replayed cues |
| H7 | Briefly drop connectivity, send duplicates/delays, vary preset/minute hop and restart app | Approved SOLO/iPhone-authority and fail-safe recovery are preserved; no retrospective gun or duplicate recording |
| H8 | Wet touch, side/crown interactions, 1-minute countdown, screen-dim/raise and permission denial | Document accidental pause susceptibility and actual supported device models/OS versions |

**Current result: H1–H8 = NOT RUN.** Do not infer a pass from simulator builds or web documentation. Apple explicitly recommends physical paired hardware for WatchConnectivity. Measure both actual Watch/iPhone versions and iPhone locked/background status.

### Stop/go gate

- **GO for native v1 work** only when a defensible background execution/health-permission path and reliable H2/H3 haptic result are established; background JS/recording behavior H4/H5 is understood or an explicit SOLO-only limitation is agreed.
- **STOP and escalate** if 5→0 haptics cannot operate while wrist down, HealthKit is not appropriate for start countdown, or a received native command cannot be safely acknowledged as a phone recording. Revisit product constraints rather than making unsupported entitlements or fabricated ACKs.
- Retain the existing approved v1.3 behavior for iPhone authority, SOLO, RUNNING-only skip, persisted preset and fail-safe restart; only technical mechanisms remain proposals pending feasibility.

## Next bounded implementation task (not executed)

**Candidate Codex model:** GPT-6.1 Terra, **Medium**. Reason: small native feasibility exercise across watchOS lifecycle and iPhone bridge, without the cost of implementing the full watch app. Only use when owner has credits and approved test provisioning.

```text
Repo: anflyg/SailRaceApp
Task: Watch v1 focused native feasibility spike, not the complete app.

Follow AGENTS.md and use current origin/main. Read:
docs/product/tackwise-watch.md,
docs/architecture/watch-platform-feasibility.md,
docs/architecture/watch-build-and-release-plan.md,
docs/architecture/decisions/adr-009-watch-countdown-sync.md,
and the relevant existing native iOS/React timer integration only.

Implement the smallest isolated watchOS SwiftUI experiment necessary to test
H1-H5 (prepared vs active workout background haptics, wrist down, WatchConnectivity
native receipt vs iPhone Capacitor JS execution). Do not refactor the timer or
change raceLogger, authentication, production config or cloud data.

Present planned HealthKit capabilities, signing/App ID and privacy implications
for approval BEFORE introducing them. No new repo, competing PR, automatic
TestFlight, production activation or merge.

Record exact native build, simulator and paired-device evidence; mark unavailable
hardware tests NOT RUN. Report concise changed files, tests, blockers and next
safe action. Do not claim native/haptic success from docs or simulator alone.
```
