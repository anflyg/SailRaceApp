# TackWise Watch – native repository, Xcode Cloud and release proposal

> **Status:** PROPOSED, documentation only. No new Watch target, CI workflow, credentials, app record, signing changes, build, TestFlight deployment or merge is authorized.
>
> See [Watch product v1.3](../product/tackwise-watch.md) and [proposed ADR-009](decisions/adr-009-watch-countdown-sync.md).

## Recommendation: one integrated repository for v1

**Keep watchOS app in `anflyg/SailRaceApp`** as a native SwiftUI Watch App target in the existing `ios/App/App.xcodeproj`. Do not create a separate `TackWiseWatch` repository for v1. The watch companion and the iPhone native bridge change together when countdown semantics and replay protections change, so one commit/branch/PR and one Xcode project simplify coordinated validation, signing, versioning and TestFlight release. The existing repository continues to own suite-level architecture/ADR documentation.

This is a **proposed** repo-boundary decision, not an approved change. A separate repository might become justified only for a decoupled, separately shipped watch product with independent release cadence and stable cross-repository integration contracts.

## Confirmed baseline in current GitHub main (2026-11-18)

- Existing `ios/App/App.xcodeproj`, iPhone bundle identifier **`com.anflyg.sailraceapp`**, and signing team ID in native project; do not expose/modify signing secrets.
- Existing `ios/App/ci_scripts/ci_post_clone.sh`: configures Node 22 if necessary, runs `npm ci`, `npm run build`, then `npx --no-install cap sync ios`. Keep this integration; inspect generated changes and ensure they do not overwrite native edits.
- Existing React/Capacitor iPhone app and KeepAwake integration in `useWakeLock(true)`; **verify native behavior** rather than introducing a second keep-awake solution.
- No Watch target or Watch app is present in the inspected Xcode project; no `.github/workflows` directory was returned.
- An Xcode Cloud preparation script in GitHub does **not** prove that Xcode Cloud itself has a configured or successful workflow. Inspect App Store Connect/Xcode Cloud before claiming operational readiness.

## Proposed native target layout

- Add a new **Watch App for existing iOS app** target using supported Xcode tooling, SwiftUI and a Watch-specific bundle identifier nested under the existing iPhone identity, subject to Apple's current bundle conventions and portal validation.
- Keep watch code, local timer state machine and WatchConnectivity UI adapter inside the native Watch target. Avoid a duplicate JavaScript timer implementation on watch.
- Add a minimal native iOS WatchConnectivity-to-Capacitor adapter. The canonical countdown/recording state transition stays in the iPhone application domain; do not duplicate raceLogger native-side.
- Have one deterministic testable timer/state transition model (e.g. shared schema/state fixtures with platform implementations where necessary), with explicit protocol versions and native↔JS tests. Avoid prematurely creating a cloud API or publishing contracts to `tackwise-contracts`; decide only if an actual shared-contract need is demonstrated.
- Avoid hardcoding initial Watch target filenames/paths before Xcode generates the target and signing identities.

## Xcode Cloud design

Use the **existing project and GitHub connection** where present. Do not introduce new cloud accounts/providers or parallel CI pipelines merely for Watch v1.

### Workflow A – Pull request validation

Trigger: pull requests, with branch filters chosen to limit unwanted compute use.

- Use a pinned, supported Xcode/toolchain version compatible with existing Capacitor setup and selected watchOS SDK.
- Run pre-clone setup through existing `ci_post_clone.sh`, adjusting only where an actual Watch target build requires it.
- Execute web/TypeScript tests as an explicit, bounded step plus relevant Swift/unit tests; build both iOS and watchOS targets.
- Use suitable available simulators for iOS and watchOS build/test coverage.
- **Do not archive for distribution, deploy to TestFlight, modify production, or auto-merge.**
- Report job result, toolchain, exact commit and test/build evidence; simulator builds cannot establish real hardware haptics.

### Workflow B – Manual TestFlight candidate

Trigger: **explicitly authorized manual/controlled release**, not automatic PR push.

- Build/archive the existing iPhone app with the companion Watch target correctly embedded/associated according to Xcode.
- Reuse current iPhone Bundle ID and Apple Developer team; approve any Watch App ID, capabilities, profiles and signing changes separately.
- Verify version/build-number coordination and that the archive actually contains intended iPhone + Watch components.
- Upload/distribute to **internal TestFlight only after owner approval**, then run paired iPhone/Watch acceptance testing before widening access.
- Keep App Store submission and public production distribution outside this plan.

### Cloud-cost discipline

Use PR validation selectively and minimize repeated clean builds; do not introduce redundant GitHub-hosted macOS Actions for the same native build. Check current Apple Developer Program Xcode Cloud quota and observed compute consumption; do not assume a cost-free unlimited pipeline.

## Provisioning and app identity – explicit gates

Before any Watch target or release automation change:

1. Confirm Apple Developer team, existing iOS bundle ID and associated App Store Connect app ownership.
2. Confirm whether watchOS is a companion target versus a standalone installable Watch app and verify Apple-supported installation/distribution behavior for the chosen deployment model.
3. Approve the Watch bundle ID, signing and entitlements. Existing Apple Sign-in identity, provisioning and iPhone users' local race recordings must not be disrupted.
4. Audit the actual need and policy eligibility for HealthKit workout sessions/background execution. Do not add workout/health permissions as an unchecked workaround for background haptics. Prepare required privacy/App Review disclosures and a choice to discard an unneeded workout without persistently collecting health data.
5. Keep signing/certificates and App Store Connect API keys out of GitHub. Use the existing trusted signing system, with minimum access.

## Physical-device verification before release

A native build and simulator test are necessary but insufficient. On a specific paired iPhone/Apple Watch set, verify:

- Watch first-run setup, permission prompts and active-session startup.
- Apple Watch dimmed/raised wrist updates and local haptics at 5,4,3,2,1 and 0, including when wrist is down.
- Short tap pause/continue, long press actions, wet touch and unexpected touches.
- Phone foreground/locked/background command application; distinguish reachable immediate commands from queued delivery.
- Phone recording start, gun time, time shift, existing race continuity, recovery and confirmed End race.
- Airplane mode/Bluetooth outages, reconnection and conflicting offline state.
- App/process restart, clock changes and stale command replay.
- Battery consumption and workout data storage behavior.

Document supported Watch hardware/OS minimum based on actual devices and successful testing; do not promise all Watch models can continuously show seconds while wrist-down.

## Implementation sequence (future Codex tasks)

1. **Feasibility gate:** native watchOS/HKWorkoutSession/WatchConnectivity proof with physical-device test plan; no entitlement or App ID changes without approval.
2. **Domain/bridge:** testable anchored countdown, persisted preset, bounded event protocol and safe iPhone recording integration.
3. **Watch UI:** SwiftUI target, large countdown, long-press actions, local haptics and fail-closed SOLO state.
4. **CI/release verification:** target build, Xcode Cloud PR check, explicit internal TestFlight candidate after approval, full paired hardware acceptance.

Use the same task worktree/branch/PR for follow-ups. Follow `AGENTS.md`: freshly fetch origin/main before any new implementation, inspect native edits before Capacitor sync, and never silently change signing, merge, deploy, or discard local work.

## Outstanding approval/evidence

- Owner approval of this **single-repository** recommendation and of ADR-009 behavior.
- Actual configured Xcode Cloud workflow and Apple Developer signing/capability inventory remain **unverified**.
- HealthKit session legitimacy and background haptics remain **unverified** until paired-device tests and policy/permission review.
- No new Watch repo or Xcode Cloud workflow is created by this documentation.
