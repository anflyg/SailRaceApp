# TackWise Watch

> **Status:** The initial Watch release direction and interaction rules in this document are **OWNER-APPROVED (2026-11-22)**. Native implementation and detailed technical design remain subject to review; this decision does not authorize signing or distribution.
> **Scope:** One native Watch app with a REMOTE-only initial release. SOLO is postponed indefinitely and hidden from users. Earlier two-mode decisions are preserved under historical traceability below and are superseded where they conflict with this release scope.
> **Related proposal:** [ADR-009: Watch REMOTE interaction and command handling](../architecture/decisions/adr-009-watch-countdown-sync.md)
> **Build proposal:** [Watch native build and Xcode Cloud plan](../architecture/watch-build-and-release-plan.md)

## Product role

TackWise Watch is a sailing-focused companion, not a smaller copy of the iPhone UI. Design for sunlight, motion, wet hands, strong contrast, minimal attention and conservative battery use. The iPhone remains authoritative for the test countdown and race recording.

The initial release offers REMOTE only. Do not show a mode selector, SOLO entry point, local countdown, preset selection, countdown cues or SOLO settings. Do not restore a previously selected or persisted SOLO mode into the interface. SOLO development is postponed indefinitely; its earlier product direction remains historical context only.

## REMOTE interaction surface

Use one large interactive surface for the primary countdown action. Its color and label reflect the last iPhone-confirmed state:

- **Green START** when the iPhone countdown is ready.
- **Green FORTSÄTT** when it is paused.
- **Red PAUSA** when it is running.

The surface supports a deliberate press measured from touch-down until release. No command executes before release:

| Press duration | Result on release |
| --- | --- |
| Less than 0.4 seconds | No action |
| 0.4 through 1.2 seconds, inclusive | Execute the current START, PAUSA or FORTSÄTT action |
| Greater than 1.2 and less than 2.0 seconds | No action |
| 2.0 seconds or longer | Execute AVSLUTA |

Show a progress indicator during the press toward the 2.0-second threshold, and provide haptic feedback when that threshold is reached. Crossing the long-press threshold must disarm the short action: releasing after 2.0 seconds can execute AVSLUTA only and must never also execute START, PAUSA or FORTSÄTT. Releasing in the dead zone performs no action. If the press is canceled, interrupted, or the interface becomes unavailable before release, execute no command.

Preserve accessibility and system navigation. The control must remain discoverable and operable with supported accessibility technologies, provide a clear non-color indication of the current action and state, respect system gestures/navigation, and avoid trapping the user in the press interaction. The progress and haptic cues supplement the labeled action and must not be the only indication.

## Command and safety behavior

The iPhone owns the countdown, selected preset, countdown audio at 5–0, start gun and race recording. The Watch displays no countdown digits and performs no local countdown or countdown-time synchronization. Normal sailing assumes the iPhone display is awake; do not promise background delivery or operation while its display is asleep.

Execute a command only after release and only when REMOTE is available and no command is pending. Show a pending or disconnected state that prevents additional or accidental commands. A command is successful only after an acknowledgment confirms iPhone execution; until then, do not show the resulting action as confirmed. On timeout or uncertain delivery, query current iPhone state without replaying the command. Reconnect automatically when possible, stay in REMOTE, and never replay a stale command.

**AVSLUTA resets/cancels only the iPhone countdown. It must never end race recording.** Preserve the existing iPhone race logger, gun, recovery and separate confirmed End race behavior in [TackWise Race](tackwise-race.md). End race remains an iPhone action.

## Preserved iPhone race semantics

Watch control does not create a second race logger. The existing iPhone `raceLogger` remains authoritative for iPhone recording, its start-gun event and recovery. Existing iPhone rules remain in force, including countdown/reset behavior, pre-gun recording retention, post-gun transitions, checkpoint/manual recovery and the separate confirmation-based End race action, as documented in [TackWise Race](tackwise-race.md).

No Watch event may assert that a command succeeded before iPhone acknowledgment. AVSLUTA is strictly a countdown action; it never ends recording. The interaction timing and colors do not change iPhone race behavior.

## Acceptance criteria

1. The initial release launches directly into REMOTE. No mode selector or user-facing SOLO entry point exists, including for users with an old saved SOLO preference.
2. One large control surface displays green START/FORTSÄTT or red PAUSA according to iPhone-confirmed state. AVSLUTA is the long-press action on this surface.
3. Press duration is measured until release. Less than 0.4 seconds has no effect; 0.4–1.2 seconds executes the short action on release; over 1.2 and under 2.0 seconds has no effect; at least 2.0 seconds executes AVSLUTA on release.
4. The long-press progress indicator and threshold haptic are presented. A long press never executes a short action as well.
5. Pending, disconnected, canceled and interrupted interactions cannot issue accidental commands. Commands execute only after release and confirmed success appears only after iPhone acknowledgment.
6. On timeout or uncertain delivery, query state without replaying a command. Reconnect stays in REMOTE and does not replay stale commands.
7. REMOTE shows no countdown digits, presets, local timer or Watch countdown cues. The iPhone remains the sole countdown and race-recording authority.
8. AVSLUTA resets only the iPhone countdown and cannot end recording. Existing iPhone `raceLogger`, gun, recovery and separate confirmed End race behavior remain intact.
9. Accessibility and system navigation remain available; color, progress and haptics do not replace a labeled, accessible control.
10. No HealthKit permission, background capability, cloud/API behavior, signing change or production Race integration is implied by this decision.

## Historical decisions and traceability

On 2026-11-22, an earlier owner-approved Watch v2 decision proposed one app with REMOTE and SOLO modes. That historical decision specified a secondary selector labeled “Fjärrkontroll” and “SOLO,” explicit persistence of the selected mode, a blue primary button, and a separate red AVSLUTA button. It also proposed an independent local 1–5 minute SOLO countdown with audio and haptics. **Those two-mode and separate-button behaviors are superseded for the initial release** by the later 2026-11-22 owner decision recorded above: REMOTE-only, SOLO postponed/hidden, one interactive surface, and press-duration commands. Preserve the earlier decision in PR #80 history; do not treat it as current release behavior.

The earlier two-mode decision superseded the 2026-11-18 Watch v1.3 and 2026-11-20/21 proposals wherever they specified a shared/local REMOTE countdown, Watch-side REMOTE presets and skip, automatic SOLO fallback, Rejoin/reconciliation, bidirectional timer synchronization or cross-device preset conflict resolution. Those supersessions remain historical. The current owner decision preserves iPhone authority and the distinction between countdown reset and End race.

### Optional Sailing Workout feasibility evidence (historical, separate)

Prior optional Sailing Workout product direction and physical-device feasibility evidence remain separate from Watch REMOTE. See [Watch platform feasibility](../architecture/watch-platform-feasibility.md) and [Watch build/release plan](../architecture/watch-build-and-release-plan.md). Historical workout approval was limited to isolated feasibility testing; it was not approval for production HealthKit processing. This decision grants no new production HealthKit approval and does not make a workout a prerequisite or workaround for REMOTE behavior.

## Future options

SOLO and other standalone Watch features such as GPS speed, heading/course, VMG or race recording require separate owner approval and product, battery, privacy, entitlement and architecture decisions. This document does not authorize their implementation.
