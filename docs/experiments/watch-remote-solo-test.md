# Watch REMOTE test prototype

This isolated test depends on the owner-approved product direction in [PR #80](https://github.com/anflyg/SailRaceApp/pull/80), commit `4f4e952`; its technical design remains proposed. The WatchTest scheme contains an independent test phone and a single Watch target. It does not use the production Race UI or race logger.

REMOTE uses reachable-only WatchConnectivity messages. A query returns a fresh generation and the phone's control phase; issuing a query invalidates commands from older generations. Each command carries a UUID and generation. The phone processes requests serially on the main queue, retains command IDs, generations, actions and results for the lifetime of the phone process to reject conflicting reuse and suppress duplicate execution, applies accepted actions before replying, and rejects invalid transitions. The Watch waits for an identified reply. A three-second timeout or send error makes the outcome uncertain and triggers a query, never a command replay. Periodic state queries refresh the control phase, including after countdown completion. No countdown value crosses the connection. The direct-message transport makes no background delivery guarantee.

Owner decision 2026-11-22: the initial Watch release is REMOTE-only; SOLO development is paused indefinitely. The Watch always starts in REMOTE and replaces a previously saved SOLO mode. The selector, SOLO screen and startup audio preparation are disabled. The standalone countdown and cue implementation is retained for possible future use. No workout, background entitlement or HealthKit access is used.

## Physical running-hold diagnosis follow-up

Physical testing of commit `6d80bf6` reported that ready-state long press reached full progress, produced a haptic and reset, while running-state progress appeared full without haptic or reset. Normal taps worked; occasional flashing has no established cause. Deferring polling did not resolve the reported failure.

The classifier uses the same elapsed time for progress and threshold, and release independently classifies elapsed time. The current tests do not exercise SwiftUI gesture delivery, view state or the physical haptic. A full-looking progress indicator does not establish that the threshold callback ran. The cause remains unconfirmed; no gesture fix is claimed.

Focused Swift classifier/transport tests and WatchTest Debug and Release generic iOS Simulator builds (including Watch) pass for this diagnostic revision. These do not verify physical gesture delivery.

A Debug-only Watch log under subsystem `se.tackwise.watchtest`, category `RemotePress`, records press begin and phase, one near-threshold elapsed time, threshold/haptic request, release result and cancellation reason. It contains no identifiers, transport payloads or location data. On the paired physical Watch, run the WatchTest Debug build with Xcode's device console, filter for that subsystem/category, and capture a successful ready hold followed by a failed running hold, including release. Compare near-threshold, threshold, release and cancellation events. A threshold event proves only that the haptic was requested, not that it was felt. Keep this PR draft until those observations identify the failure and a targeted fix is verified.

## Running-state long-press follow-up on 2026-11-22

Physical testing reported that a hold reset the ready control, while the red running PAUSA control did not reset; normal taps worked. Periodic five-second queries temporarily mark the Watch unavailable and canceled an active hold. This is a plausible timing-dependent cause, not a confirmed device diagnosis. Periodic polling now waits until the press ends; actual reachability loss, phase changes, scene interruption and drag-out still cancel. The phone already accepts reset from every phase and acknowledgment remains authoritative.

- PASS: Focused fake-transport tests exercise a poll during a hold, release-only reset from running and paused, phone acceptance and confirmed-state update after acknowledgment. These do not exercise watchOS gesture delivery or actual radio behavior.
- PASS: WatchTest Debug and Release generic iOS Simulator builds, including the embedded Watch target (unsigned).
- Physical verification still required on this revision: long holds in ready, running and paused, including across a five-second poll boundary; no START/PAUSA before or after long release; normal taps, drag-out and interruptions; progress/haptic and phone acknowledgment; disconnect/reconnect and VoiceOver.

## Tap interaction follow-up

The owner requested normal taps for the primary action and a two-second hold for AVSLUTA, superseding the 0.4-second minimum and dead zone in PR #80 commit `964d15b`. PR #80 still needs a corresponding product documentation update. The action remains release-only; dragging outside cancels the gesture even if the touch returns inside.

- PASS: Focused Swift tests cover normal taps, durations below and at two seconds, long press, canceled gestures, drag outside and return, threshold feedback suppression after cancellation, and existing REMOTE acknowledgment/transport behavior.
- PASS: WatchTest Debug and Release generic iOS builds include the Watch target.
- NOT VERIFIED on physical hardware: normal tap responsiveness; two-second progress and haptic; release-only dispatch; drag-out cancellation including return inside; VoiceOver and system gestures; and phone acknowledgment/connection behavior with the updated gesture.
- Earlier physical testing confirmed START and PAUSA with the previous 0.4-second minimum; it does not validate this change.

## Earlier single-surface REMOTE verification on 2026-11-22

The owner-approved interaction in [PR #80](https://github.com/anflyg/SailRaceApp/pull/80), commit `964d15b`, is the product dependency. The prototype uses one surface with release-based actions and retained confirmed-state transport.

- PASS: Focused Swift tests cover durations just below and at 0.4, 1.2 and 2.0 seconds, the dead zone, cancellation, repeated release, one command per press, pending command suppression, confirmed label changes, stale ACK/reconnect handling and saved SOLO migration. They exercise the press classifier and fake transport, not actual watchOS touch delivery or haptics.
- PASS: WatchTest Debug and Release generic iOS builds, including the watchOS target. Paired simulator Debug build succeeded.
- PARTIAL: On the iOS 27.0/watchOS 27.2 pair, 0.7-second Watch presses produced START then PAUSA; the Watch changed from green START to red PAUSA and green FORTSÄTT, and the phone showed a paused countdown. The phone subsequently became unavailable; FORTSÄTT, long-press AVSLUTA, dead-zone input, progress display, and VoiceOver were not verified in this simulator run. This run preceded the common-run-loop timer adjustment.
- NOT VERIFIED: physical Watch gesture timing, threshold haptic, progress during tracking, VoiceOver actions and system navigation, interrupted presses, and real transport disconnect/reconnect. The haptic is a threshold indication, not confirmation of phone execution.

### Physical-device verification required

- With the phone awake, exercise every boundary and dead zone, cancel/interruption and unavailable/pending states; verify no command before release and no short action after a long press.
- Verify progress and threshold haptic while holding; confirm START/PAUSA/FORTSÄTT/AVSLUTA update only after phone execution and AVSLUTA resets only the test countdown.
- Verify VoiceOver primary and named AVSLUTA actions, accessible state announcements and system gestures; check that a saved SOLO preference opens REMOTE without local countdown activity.
- Interrupt and restore connectivity around commands, checking confirmed refresh and no stale replay. Verify the Watch remains REMOTE.

## REMOTE-only verification on 2026-11-22

- PASS: Focused WatchModel tests verify fresh startup and migration from a saved SOLO preference select REMOTE, and direct attempts to select a SOLO preset or start SOLO leave the local timer inactive. Existing REMOTE timeout, delayed acknowledgment, reconnect and stale-generation tests pass.
- PASS: WatchTest Debug and Release generic iOS builds, including the embedded Watch target.
- NOT VERIFIED: interactive simulator and physical-device checks of this REMOTE-only revision.

## Earlier two-mode prototype verification on 2026-11-22

The following describes the earlier prototype; SOLO is no longer user accessible.

- PASS: Swift authority tests cover duplicate START and RESET, conflicting action or generation for a reused ID, malformed extra command fields, invalid transitions and stale generations. The request gate tests invalidate a pending token, accept a newer token and reject old callbacks and callbacks in SOLO.
- PASS: Deterministic tests drive the actual WatchModel request handlers using an injected fake transport, callback dispatcher and manually fired timeout. They cover a START that executes but times out, query-only recovery, delayed ACK after newer confirmation, reconnect while a command is in flight, stale phone generation, no START replay, pending command and query while switching modes, and no new phone messages from SOLO actions or callbacks. The fake scheduler does not measure the real three-second wall-clock delay or exercise Apple's transport.
- PASS: SOLO countdown tests cover preset, pause, resume, reset and cue mapping.
- PASS: WatchTest Debug and Release simulator builds.
- PASS: On the dedicated iOS 27.0 / watchOS 27.2 pair, Watch START, PAUSA, FORTSÄTT and AVSLUTA produced the expected phone state. A phone-side START refreshed the Watch. These full interactive checks ran before the duplicate-reset guard change and the test seam; after each, a Watch START smoke check again started the phone countdown.
- PASS: Switching from REMOTE to SOLO left the phone countdown running; starting SOLO also left it running. Declining the running SOLO cancellation returned to a still-running local countdown. SOLO reset and return to REMOTE were exercised. This does not verify every SOLO action or the absence of all transport traffic.
- NOT VERIFIED on a paired simulator or physical hardware: radio disconnect and reconnect with an in-flight command, delayed WatchConnectivity delivery, and stale replay under real transport conditions. Deterministic tests cover simulated events, not radio behavior.

## Validation still required on physical devices

- Exercise START, PAUSA, FORTSÄTT and AVSLUTA with the iPhone awake; disconnect before and during each command, reconnect and verify no duplicate start or stale command executes.
- Confirm state refresh after phone-side actions and expiry, and that AVSLUTA affects only the test countdown.
- Confirm fresh installs and upgrades with a saved SOLO preference open REMOTE with no mode selector, countdown cues or local countdown on the Watch.
- Assess the UI in sunlight and with wet hands. This prototype does not establish production reliability or release authorization.

## WatchTest icon archive validation on 2026-11-22

- PASS: WatchTest Debug and Release generic iOS builds using Xcode 27.2, including the embedded watchOS target.
- PASS: Unsigned generic iOS Release archive at `/tmp/WatchTest.xcarchive` (local validation only; not exported or distributed).
- PASS: Archive inspection found an iPhone `CFBundleIcons.CFBundlePrimaryIcon.CFBundleIconName` of `AppIcon`, `CFBundleIconFiles` naming `AppIcon60x60`, and the generated `AppIcon60x60@2x.png` (120×120) plus `Assets.car`.
- PASS: Embedded Watch archive bundle has `CFBundleIcons.CFBundlePrimaryIcon.CFBundleIconName` set to `AppIcon` and a compiled `Assets.car`.
- PASS: Both source images are 1024×1024 and visibly labeled for the WatchTest prototype; production Race asset catalog remains unchanged.
- Archive was unsigned with `CODE_SIGNING_ALLOWED=NO`; this validates generated bundle resources and metadata, not App Store Connect processing or signing.
