# TackWise Watch

> **Status:** The Watch v2 product direction below is **OWNER-APPROVED (2026-11-22)**. Native implementation and the revised technical design are **PROPOSED pending review**; no Watch app has been implemented, tested, merged or released by this decision.
> **Scope:** One native TackWise Watch app with two strictly isolated operating modes. This supersedes conflicting Watch Start Timer v1/v1.3 product requirements below while retaining their historical traceability.
> **Related proposal:** [ADR-009: isolated Watch modes](../architecture/decisions/adr-009-watch-countdown-sync.md)
> **Build proposal:** [Watch native build and Xcode Cloud plan](../architecture/watch-build-and-release-plan.md)

## Product role and mode navigation

TackWise Watch is a sailing-focused companion, not a smaller copy of the iPhone UI. Design for sunlight, motion, wet hands, strong contrast, minimal attention and conservative battery use.

Use **one native TackWise Watch app**, one Watch target, one app identity and the existing repository/build arrangement. The app contains two strictly isolated operating modes:

- **REMOTE** is the default on first launch and acts only as an iPhone remote control. It does not display a countdown or offer preset selection.
- **SOLO** is an independent local Watch countdown selected explicitly by the user. It does not communicate with the iPhone.

Persist the last explicitly selected mode. A small secondary settings/menu entry opens a clear two-option selector labeled **“Fjärrkontroll”** and **“SOLO”**. Mode selection is not part of the normal START flow. Connectivity changes never select or change modes automatically.

Keep mode state, timer state and event handling strictly separated. Disable iPhone command exchange while SOLO is selected. Switching away from REMOTE must not modify an iPhone countdown or race recording. Switching away from a running SOLO countdown requires explicit confirmation to cancel the local countdown. Switching modes never silently alters or ends an iPhone race.

## REMOTE (default)

REMOTE makes the Watch an iPhone remote control. The iPhone owns the countdown, selected preset, countdown audio at 5–0, start gun and recording. The Watch shows only the iPhone connection state and these controls:

- One primary button labeled **START**, **PAUSA** or **FORTSÄTT**, reflecting the iPhone-confirmed state.
- One red secondary button labeled exactly **AVSLUTA**.

REMOTE shows no countdown digits, preset controls, local countdown, or Watch countdown cues. It sends no countdown-time synchronization. Normal sailing assumes the iPhone display is awake; do not promise background delivery or operation while its display is asleep.

Commands require acknowledgment from the iPhone before the Watch claims success or reflects the resulting state. While a command is pending, indicate that it is pending without claiming the action completed. If the iPhone is disconnected or does not acknowledge, show an unavailable state. Reconnect automatically when possible, but never enter SOLO automatically. Do not replay stale commands after reconnection.

**AVSLUTA cancels/resets the iPhone countdown only. It must never end race recording.** Preserve the established iPhone race logger, gun, recovery and separate confirmed End race behavior in [TackWise Race](tackwise-race.md). End race remains an iPhone action.

## SOLO (explicit user selection)

SOLO is a fully independent Watch countdown, with local selection of **1, 2, 3, 4 or 5 whole minutes** and local **START**, **PAUSA**, **FORTSÄTT** and red **AVSLUTA** actions. It owns its countdown audio and haptics. AVSLUTA cancels/resets this local countdown.

SOLO performs no iPhone communication, race recording, or cross-mode state synchronization. Its countdown state and events remain local to SOLO and cannot create, modify, pause or end an iPhone countdown or race. The last explicit preset may persist locally across app restarts; it does not synchronize to the iPhone.

If the user selects a different mode while a SOLO countdown is running, ask for explicit confirmation before cancelling that local countdown. Cancelling the mode switch leaves SOLO running. No such confirmation or side effect is needed when switching away from a stopped or paused SOLO timer.

## Preserved iPhone race semantics

Watch control does not create a second race logger. The existing iPhone raceLogger remains authoritative for iPhone recording, its start-gun event and recovery. Existing iPhone rules remain in force, including countdown/reset behavior, pre-gun recording retention, post-gun transitions, checkpoint/manual recovery and the separate confirmation-based End race action, as documented in [TackWise Race](tackwise-race.md).

AVSLUTA on the Watch affects the countdown only in its current mode; it is never an End race command. Switching modes cannot silently change or end an iPhone race. No Watch event may assert that recording started or ended unless the iPhone has acknowledged the relevant REMOTE command; SOLO never asserts an iPhone race state.

## Acceptance criteria

1. First launch opens REMOTE. The selected mode persists across relaunch, and a secondary settings/menu entry opens the two-option selector with the exact labels “Fjärrkontroll” and “SOLO”. Mode selection is absent from the normal START flow.
2. REMOTE displays only iPhone connection state, the state-appropriate START/PAUSA/FORTSÄTT primary action, and red AVSLUTA. It never displays countdown digits, presets, a local timer or Watch countdown cues.
3. The iPhone remains the sole owner of REMOTE countdown, preset, 5–0 countdown audio, start gun and race recording. REMOTE has no countdown-time synchronization.
4. REMOTE state changes only after iPhone acknowledgment. Unacknowledged commands remain pending or become unavailable; disconnection never causes a SOLO transition. Reconnection does not replay stale commands.
5. REMOTE AVSLUTA cancels/resets only the iPhone countdown and cannot end recording. Existing iPhone raceLogger, gun, recovery and separate confirmed End race behavior remain intact.
6. SOLO supports local 1–5 minute selection, local countdown, audio/haptics, START/PAUSA/FORTSÄTT and red AVSLUTA. It performs no iPhone communication or recording and cannot synchronize state across modes.
7. Switching from REMOTE does not alter an iPhone countdown or race. Switching away from a running SOLO countdown requires an explicit cancellation confirmation; cancelling that confirmation leaves SOLO running. Connectivity changes never switch modes.
8. One Watch target, one app identity and the previously approved repository/build arrangement are retained.
9. Native implementation remains subject to technical review, including WatchConnectivity acknowledgment behavior, watchOS lifecycle/audio/haptic feasibility, and mode-isolation verification. No background delivery guarantee is implied.
10. Historical Watch feasibility and the optional Sailing Workout experiment remain separate. This redesign grants no new production HealthKit approval, Health data processing, entitlement or release authorization.

## Historical decisions and traceability

The 2026-11-18 Watch v1.3 requirements and 2026-11-20/21 countdown-face, skip-minute, restart-recovery and Workout test clarifications are retained in the prior PR/review history, but are **superseded wherever they conflict with this owner-approved v2 design**. In particular, v2 removes the shared or locally continuing REMOTE countdown, Watch-side REMOTE presets and skip, automatic SOLO fallback, Rejoin/reconciliation, bidirectional timer/state synchronization, and cross-device preset-conflict rules. The historical decision that Watch timer stop is distinct from iPhone End race is preserved and strengthened by the exact AVSLUTA behavior above.

The approved 2026-11-22 navigation clarification retains one Watch app/target and the previously approved repository/build arrangement. It does not authorize implementation, signing/capability changes, CI activation, TestFlight or production release.

### Optional Sailing Workout feasibility evidence (historical, separate)

The prior optional Sailing Workout product direction and its physical-device feasibility evidence remain separate from REMOTE/SOLO countdown behavior. See [Watch platform feasibility](../architecture/watch-platform-feasibility.md) and [Watch build/release plan](../architecture/watch-build-and-release-plan.md). Historical workout approval was limited to isolated feasibility testing; it was not approval for production HealthKit processing. The v2 redesign grants no new production HealthKit approval and does not make a workout a prerequisite or workaround for REMOTE or SOLO behavior.

## Future options

Future standalone Watch features such as GPS speed, heading/course, VMG or race recording require separate product, battery, privacy, entitlement and architecture decisions. They are not implied by this approval.
