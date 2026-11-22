# ADR-009: Isolated Watch REMOTE and SOLO modes

- **Status:** Watch v2 product direction is **OWNER-APPROVED (2026-11-22)**. The revised technical implementation is **PROPOSED pending review**. No Watch app implementation, native validation, merge or release is approved by this ADR.
- **Scope:** One native TackWise Watch app in `anflyg/SailRaceApp`, with two strictly isolated operating modes and preserved iPhone race semantics.
- **Supersedes:** Conflicting product and technical requirements for connected countdown synchronization, automatic SOLO fallback, Rejoin/reconciliation and cross-device preset conflict resolution in the earlier Watch Start Timer v1/v1.3 design. Historical decisions remain traceable in repository and PR history.
- **Product specification:** [TackWise Watch](../../product/tackwise-watch.md)
- **Build arrangement:** [Watch native build and Xcode Cloud plan](../watch-build-and-release-plan.md)
- **iPhone race semantics:** [TackWise Race](../../product/tackwise-race.md)

## Context

TackWise Race on iPhone owns its countdown, preset, countdown audio, start-gun event and race recording. Its existing `raceLogger`, gun token/revision and recovery behavior must remain authoritative. Earlier Watch proposals mixed a local Watch timer with bidirectional state synchronization and automatic fallback/reconciliation. Those mechanisms made mode boundaries unclear and could make a Watch action appear successful without the iPhone executing it.

The owner approved a redesign on 2026-11-22: a single Watch app offers REMOTE, a control surface for the iPhone, and SOLO, an independent local timer. The modes have no shared timer or cross-mode state synchronization.

## Decision

### App identity and mode selection

- Ship one native TackWise Watch app with one Watch target and one app identity, retaining the previously approved repository/build arrangement.
- REMOTE is the default mode on first launch. Persist the user's last explicitly selected mode.
- A small secondary settings/menu entry opens a two-option selector labeled **“Fjärrkontroll”** and **“SOLO”**. Never present mode selection as part of the normal START flow.
- Connectivity changes never change the selected mode.
- Keep mode state, timer state and event handling strictly separated. Disable iPhone command exchange while SOLO is selected.
- Switching away from REMOTE must not alter any iPhone countdown or race. Switching away from a running SOLO countdown requires explicit confirmation to cancel that local countdown; cancelling the switch leaves SOLO running.

### REMOTE: iPhone control only

- The iPhone owns the countdown, preset, countdown audio at 5–0, start gun and recording.
- The Watch displays only iPhone connection state, one primary button labeled **START**, **PAUSA** or **FORTSÄTT** to reflect iPhone-confirmed state, and one red secondary button labeled exactly **AVSLUTA**.
- No countdown digits, preset controls, local Watch countdown, Watch countdown cues, or countdown-time synchronization exist in REMOTE.
- A REMOTE command is successful only after iPhone acknowledgment. Until then, show a pending or unavailable state without claiming success.
- On disconnection or absent acknowledgment, show unavailable. Reconnect automatically when possible, never enter SOLO automatically, and never replay stale commands after reconnection.
- Normal sailing assumes the iPhone display is awake. This ADR makes no background-delivery guarantee.
- **AVSLUTA** cancels/resets only the iPhone countdown. It must never end race recording. End race remains the separate, confirmed iPhone action.

### SOLO: independent local countdown

- SOLO is entered only by explicit user selection.
- Provide local 1–5 whole-minute presets and local START, PAUSA, FORTSÄTT and red AVSLUTA actions, with local countdown audio/haptics.
- AVSLUTA cancels/resets the SOLO countdown.
- SOLO does not communicate with the iPhone, record a race, synchronize its timer or preset, or alter any iPhone countdown or race.
- SOLO timer state and events remain isolated from REMOTE state. Persisting the selected mode and SOLO preset locally is allowed; no cross-mode timer state is shared.

## Preserved iPhone race boundary

No Watch mode adds a race logger or changes existing iPhone rules. Preserve `raceLogger`, start-gun registration/token behavior, recovery/checkpoint behavior, pre-gun recording retention, post-gun transitions and separate confirmed End race semantics documented in `docs/product/tackwise-race.md`.

Watch AVSLUTA is strictly a countdown action. A Watch command cannot claim an iPhone state transition before acknowledgment. Switching modes cannot silently alter or end a race. This design does not authorize cloud/API changes or new persistence of Watch or race telemetry.

## Proposed technical constraints for review

The following implementation details remain proposals and require technical review before coding:

1. Define the minimal REMOTE command/acknowledgment contract for START, PAUSA, FORTSÄTT and AVSLUTA, including timeout, unavailable presentation, duplicate handling and stale-command rejection. The implementation must not use queued/eventual delivery as proof that a time-sensitive command ran.
2. Determine the narrowest supported WatchConnectivity mechanism consistent with the awake-iPhone assumption. Do not add countdown snapshots, per-second transfer or state reconciliation.
3. Specify persistence and lifecycle behavior for selected mode and SOLO's local preset/countdown. A mode switch must not expose stale state from the other mode; no automatic mode fallback or rejoin is permitted.
4. Verify local SOLO countdown audio/haptics and state restoration limits on supported hardware. Do not introduce HealthKit or background capabilities as an assumed solution.
5. Retain one Watch target, one app identity and the approved repository/build arrangement. Signing, entitlements, CI activation and distribution remain separate approvals.

## Alternatives rejected

- **Continuous or event-based shared countdown synchronization:** rejected; REMOTE controls acknowledged iPhone state, while SOLO is independent.
- **Automatic SOLO fallback on disconnect:** rejected; disconnection shows unavailable in REMOTE and the mode never changes automatically.
- **Rejoin/reconciliation and conflict resolution:** rejected; modes do not reconcile timer or preset state.
- **Watch-controlled or parallel race logger:** rejected; iPhone recording, gun and recovery remain authoritative.
- **AVSLUTA as End race:** rejected; Watch AVSLUTA affects countdown only and End race remains a separate confirmed iPhone action.
- **Two separately distributed Watch apps:** rejected; use one native app with two isolated modes.
- **HealthKit workout as an assumed countdown/background mechanism:** rejected; historical feasibility evidence remains separate and grants no production approval.

## Acceptance criteria

1. First launch selects REMOTE; last explicit selection persists. The secondary menu opens exactly the “Fjärrkontroll” and “SOLO” choices, outside the normal START flow.
2. REMOTE UI contains only connection state, state-reflecting START/PAUSA/FORTSÄTT, and red AVSLUTA. It contains no digits, presets, local timer or Watch countdown cues.
3. REMOTE commands only claim success after iPhone acknowledgment. Disconnect/unavailable does not select SOLO; reconnection does not replay stale commands.
4. REMOTE AVSLUTA cancels/resets the iPhone countdown only and cannot end recording. Existing iPhone raceLogger, gun, recovery and confirmed End race behavior are preserved.
5. SOLO has local 1–5 minute selection, countdown, audio/haptics and START/PAUSA/FORTSÄTT/AVSLUTA; it performs no iPhone exchange or recording.
6. Mode switching never silently changes an iPhone timer/race. Leaving running SOLO requires explicit confirmation; declining leaves its timer intact. Connectivity never switches modes.
7. One Watch app/target/identity and the existing repository/build arrangement are retained.
8. REMOTE/SOLO state isolation, command acknowledgment and local SOLO behavior are validated on supported hardware before implementation is considered ready. No test result is implied by this proposal.

## Security, privacy and platform boundaries

REMOTE exchanges only the minimum command and confirmed control state needed to operate the iPhone timer. SOLO uses local timer/preset state. No GPS, race telemetry, health data, email, account identity or cloud credential is introduced by this decision. Do not log sensitive race or location payloads. Any future health/workout processing, additional data retention, permission, entitlement or cloud behavior requires separate review and approval.

Historical Watch platform feasibility and optional Sailing Workout evidence remain in `docs/architecture/watch-platform-feasibility.md`. The former v1.3 Workout behavior was approved only as a feasibility experiment. This ADR grants no new production HealthKit approval, processing, entitlement or release authority.

## Historical traceability

On 2026-11-18 the owner approved Watch v1.3 requirements including iPhone authority, timer stop distinct from End race, RUNNING-only minute skip, iPhone-wins offline preset conflicts and fail-safe restart recovery. On 2026-11-20/21 additional countdown UI, skip and optional Sailing Workout test clarifications were recorded. Those decisions remain historical evidence but are superseded wherever they require behavior incompatible with the 2026-11-22 two-mode design. The established iPhone raceLogger, gun, recovery and separate End race semantics remain preserved.

The 2026-11-22 product direction and one-app/two-mode navigation are OWNER-APPROVED. The technical command and lifecycle mechanisms above remain PROPOSED pending review. No implementation, signing, CI activation, TestFlight, production change, merge or release is approved here.
