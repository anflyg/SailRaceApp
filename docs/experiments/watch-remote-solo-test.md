# Watch REMOTE test prototype

This isolated test depends on the owner-approved product direction in [PR #80](https://github.com/anflyg/SailRaceApp/pull/80), commit `4f4e952`; its technical design remains proposed. The WatchTest scheme contains an independent test phone and a single Watch target. It does not use the production Race UI or race logger.

REMOTE uses reachable-only WatchConnectivity messages. A query returns a fresh generation and the phone's control phase; issuing a query invalidates commands from older generations. Each command carries a UUID and generation. The phone processes requests serially on the main queue, retains command IDs, generations, actions and results for the lifetime of the phone process to reject conflicting reuse and suppress duplicate execution, applies accepted actions before replying, and rejects invalid transitions. The Watch waits for an identified reply. A three-second timeout or send error makes the outcome uncertain and triggers a query, never a command replay. Periodic state queries refresh the control phase, including after countdown completion. No countdown value crosses the connection. The direct-message transport makes no background delivery guarantee.

Owner decision 2026-11-22: the initial Watch release is REMOTE-only; SOLO development is paused indefinitely. The Watch always starts in REMOTE and replaces a previously saved SOLO mode. The selector, SOLO screen and startup audio preparation are disabled. The standalone countdown and cue implementation is retained for possible future use. No workout, background entitlement or HealthKit access is used.

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
