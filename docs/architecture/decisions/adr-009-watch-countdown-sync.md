# ADR-009: Watch REMOTE press interaction and command handling

- **Status:** REMOTE-only initial release direction and interaction rules are **OWNER-APPROVED (2026-11-22)**. Detailed native implementation remains subject to technical review. No implementation, signing or distribution is authorized by this ADR.
- **Scope:** One native Watch app in `anflyg/SailRaceApp`, initially limited to REMOTE control of the iPhone countdown. SOLO development is postponed indefinitely and hidden from users.
- **Supersedes:** Earlier two-mode v2 requirements for a user-visible REMOTE/SOLO selector, persisted mode choice, blue primary and separate red AVSLUTA buttons, and a user-accessible SOLO countdown. Earlier decisions remain in PR/repository history and are identified as historical below.
- **Product specification:** [TackWise Watch](../../product/tackwise-watch.md)
- **Build arrangement:** [Watch native build and Xcode Cloud plan](../watch-build-and-release-plan.md)
- **iPhone race semantics:** [TackWise Race](../../product/tackwise-race.md)

## Context

TackWise Race on iPhone owns its countdown, preset, countdown audio, start-gun event and race recording. Its existing `raceLogger`, gun token/revision and recovery behavior remain authoritative. Earlier Watch proposals mixed a local Watch timer with bidirectional state synchronization and automatic fallback/reconciliation. A later two-mode proposal separated REMOTE and SOLO, but still exposed mode selection and independent local countdown behavior.

The owner decision on 2026-11-22 narrows the initial Watch release to REMOTE only and defines one press-duration surface for all Watch countdown actions. SOLO is postponed indefinitely. Commands execute on release; acknowledgment from the iPhone is required before the Watch reflects success.

## Decision

### Release scope and visible interface

- Ship one native TackWise Watch app with one Watch target and one app identity under the previously approved repository/build arrangement.
- The initial release is REMOTE-only. Launch directly into REMOTE and do not show a mode selector or any user-facing SOLO entry point.
- Do not restore a saved SOLO preference as the active mode. The interface always opens REMOTE.
- Use one large interactive surface. Green and START/FORTSÄTT represent a ready or paused iPhone countdown; red and PAUSA represent a running countdown.
- AVSLUTA is a long-press action on the same surface, not a second button.
- Preserve accessibility and system navigation. Provide labeled, accessible state/action descriptions; color, progress and haptics are supplemental. Do not trap system gestures or navigation.

### Press-duration behavior

Measure the press from touch-down until release. Execute no command until release.

| Duration at release | Behavior |
| --- | --- |
| `< 2.0 s` | Execute the current START, PAUSA or FORTSÄTT action |
| `≥ 2.0 s` | Execute AVSLUTA |

During a press, show progress toward the 2.0-second AVSLUTA threshold and provide haptic feedback when the threshold is reached. A long press can never also execute START, PAUSA or FORTSÄTT. Cancellation, interruption, loss of availability or view disappearance before release cancels the interaction without sending a command.

### REMOTE authority and safety

- The iPhone owns the countdown, selected preset, countdown audio at 5–0, start gun and recording. The Watch displays no countdown digits and runs no local countdown or countdown-time synchronization.
- The minimal command set remains START, PAUSA, FORTSÄTT and AVSLUTA. Execute a command only after release, while REMOTE is available and when no command is already pending.
- Pending and disconnected states prevent new commands and clearly avoid presenting the requested state as confirmed. A result is successful only after an acknowledgment that confirms iPhone execution.
- Publish confirmed control-phase changes with event-driven WatchConnectivity messages and latest-state recovery rather than five-second polling. Do not transmit countdown seconds. Treat delivery as best-effort; background delivery is not assumed immediate.
- Protect updates with a monotonic revision within an authority epoch. Reject duplicate, stale and out-of-order updates; establish an unfamiliar epoch through a current recovery query. A state event alone does not acknowledge a pending command.
- Synchronize on activation, foreground return and reconnect. On timeout or uncertain delivery, query current iPhone state without replaying the command. Reconnect automatically when possible, remain in REMOTE and never replay a stale command.
- Normal sailing assumes the iPhone display is awake. This ADR makes no background-delivery guarantee.
- **AVSLUTA resets/cancels only the iPhone countdown. It must never end race recording.** End race remains the separate confirmed iPhone action.

### SOLO status

SOLO development is postponed indefinitely and is not part of the initial release. Hide all SOLO controls, countdown display, presets, sounds, haptics and background activity from users. Any retained implementation code must be unreachable from the released interface and cannot start due to a stored preference or connectivity transition. Reintroducing SOLO requires a new explicit owner decision and review.

## Preserved iPhone race boundary

No Watch action adds a race logger or changes existing iPhone rules. Preserve `raceLogger`, start-gun registration/token behavior, recovery/checkpoint behavior, pre-gun recording retention, post-gun transitions and separate confirmed End race semantics documented in `docs/product/tackwise-race.md`.

Watch AVSLUTA is strictly a countdown action. A Watch command cannot claim an iPhone state transition before acknowledgment. The press interaction cannot issue a command before release or combine the long and short actions. This decision does not authorize cloud/API changes or new persistence of Watch or race telemetry.

## Technical constraints and review

The command/acknowledgment and press gesture implementation must be reviewed for duplicate protection, stale command rejection, timeout handling, cancellation paths, accessibility and watchOS gesture behavior. Use a direct interaction model that does not treat queued/eventual delivery as proof that a time-sensitive command ran. Do not add countdown-time snapshots, per-second transfer, countdown-time reconciliation, background capabilities or HealthKit as a workaround.

Signing, entitlements, CI activation and distribution remain separate approvals. Test physical release timing, haptics, accessibility interaction, system navigation, pending/disconnected input blocking and REMOTE command results on supported hardware before release.

## Alternatives rejected

- **Shared countdown-time synchronization:** rejected; the iPhone owns the countdown. Event-driven updates carry confirmed control phases, not countdown seconds.
- **Automatic SOLO fallback on disconnect:** rejected; disconnected state stays in REMOTE and blocks commands.
- **User-visible SOLO and mode selector in the initial release:** postponed by the later 2026-11-22 owner decision; the earlier approved two-mode proposal remains historical.
- **A long press that also triggers the short action:** rejected; crossing 2.0 seconds disarms START/PAUSA/FORTSÄTT.
- **Command execution on touch-down or before release:** rejected; execute only after release and only when the duration maps to one action.
- **AVSLUTA as End race:** rejected; AVSLUTA resets only the countdown and End race remains a separate confirmed iPhone action.
- **HealthKit workout as an assumed countdown/background mechanism:** rejected; historical feasibility evidence remains separate and grants no production approval.

## Acceptance criteria

1. The initial release opens REMOTE directly. No user-facing SOLO mode or selector appears, including when a prior saved preference says SOLO.
2. The Watch presents one large interactive surface: green START/FORTSÄTT or red PAUSA, based on iPhone-confirmed state.
3. A normal tap or hold shorter than 2.0 seconds executes START, PAUSA or FORTSÄTT on release; a hold of at least 2.0 seconds executes AVSLUTA on release.
4. Long-press progress and the threshold haptic are clear. A long press never triggers a short action too.
5. Canceled/interrupted interactions and pending/disconnected states cannot issue accidental commands.
6. Confirmed-phase events are protected by epoch and revision; activation, foreground return and reconnection synchronize state. Success appears only after iPhone execution acknowledgment; timeout recovery queries state without replaying a command.
7. REMOTE has no countdown digits, presets, local countdown or Watch countdown cues; the iPhone remains authoritative.
8. AVSLUTA cancels only the iPhone countdown and never ends recording. Existing iPhone race behavior is preserved.
9. The one app/target/identity arrangement remains. Accessibility and system navigation remain usable throughout the press interaction.
10. No HealthKit permission, background capability, cloud/API behavior, signing change or production Race integration is added by this decision.

## Security, privacy and platform boundaries

REMOTE exchanges only the minimum command and confirmed control state needed to operate the iPhone countdown. This interaction decision introduces no GPS, race telemetry, health data, email, account identity, cloud credential, new permission or new retention. Do not log sensitive race or location payloads. Any future health/workout processing, data retention, permission, entitlement or cloud behavior requires separate review and approval.

Historical Watch platform feasibility and optional Sailing Workout evidence remain in `docs/architecture/watch-platform-feasibility.md`. Prior workout approval was limited to isolated feasibility testing and is not approval for production HealthKit processing.

## Historical decisions and traceability

PR #80 commit `964d15b` recorded a 0.4-second minimum and a dead zone above 1.2 seconds and below 2.0 seconds. The later owner-approved decision replaces those timing rules with normal taps and holds shorter than 2.0 seconds for the primary action. It also replaces five-second polling with event-driven confirmed-phase updates; countdown-time synchronization remains excluded.

On 2026-11-22, the earlier owner-approved v2 direction proposed one Watch app with two strictly isolated modes: REMOTE as default and an independent SOLO countdown. It specified persisting explicit mode selection, a secondary “Fjärrkontroll”/“SOLO” selector, a blue primary control and a separate red AVSLUTA button. That decision also defined SOLO presets, timer, audio, haptics and confirmation when leaving a running SOLO timer. The later owner-approved 2026-11-22 decision recorded in this ADR supersedes that direction for the initial release: SOLO is postponed/hidden, mode selection is removed, and all four actions share one press-duration surface. Preserve the two-mode choice in PR #80 and repository history; do not present it as the current release requirement.

The earlier two-mode decision had itself superseded the 2026-11-18 Watch v1.3 and 2026-11-20/21 proposals wherever those described a shared/local REMOTE countdown, Watch-side REMOTE presets and skip, automatic SOLO fallback, Rejoin/reconciliation, bidirectional timer/state synchronization or cross-device preset-conflict rules. Those earlier supersessions remain part of the historical record. The distinction between countdown reset and End race remains preserved.
