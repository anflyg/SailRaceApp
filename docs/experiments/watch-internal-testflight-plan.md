# Internal TestFlight preparation: Race + Watch

This is a preparation plan, not authorization to change Apple identities or signing, start a distribution build, upload, or distribute. Keep PR #82 draft and retain WatchTest until paired validation passes.

## Verified project and archive

At PR #82, the real iOS **App** target depends on and embeds the Watch target; `WatchTest` is a separate standalone phone scheme. An unsigned local Release archive of scheme **App** contained exactly `TackWise Race.app` and one Watch app. Its plist metadata was:

| | iPhone | Embedded Watch |
| --- | --- | --- |
| Bundle ID | `com.anflyg.sailraceapp` | `com.anflyg.sailraceapp.watchkitapp` |
| Companion ID | — | `com.anflyg.sailraceapp` |
| Version / build | `0.1.0` / `14` | `0.1.0` / `14` |
| Display name | TackWise Race | TackWise Watch |

The App and Watch targets now use shared project version/build settings; an Xcode command-line override of `CURRENT_PROJECT_VERSION=123` resolved to `123` for both targets. The local archive was unsigned and used existing generated web assets; it validates structure and native compilation, not signing, the current Capacitor web payload, App Store Connect acceptance or device operation. Xcode Cloud assigns its own build number; verify the final cloud archive/export on both bundles rather than assuming the local number or override test proves cloud behavior. [Apple: Xcode Cloud build numbers](https://developer.apple.com/documentation/xcode/setting-the-next-build-number-for-xcode-cloud-builds/).

The Watch target inherits automatic signing and the existing iPhone development team. The iPhone retains its existing Sign in with Apple entitlement; this change adds no Watch entitlement or capability. The Watch target and icon remain named as prototype assets in the Xcode project; the user-facing Watch name is TackWise Watch, but the icon still contains WatchTest branding and needs owner review for this internal build.

## Existing cloud configuration inspected

Read-only Xcode Cloud inspection on 2026-11-22 showed:

- **Aster Race → Tackwise - Race:** scheme `App`; automatic branch-change trigger on `main`; iOS Archive uses **App Store Connect**, not internal-only preparation. Its TestFlight internal post-action displayed no groups. Do not reuse or edit this production-oriented workflow for the requested manual-only candidate.
- **WatchTest → TackWise Watch Test – Internal:** manual branch trigger and internal-only iOS archive, but scheme `WatchTest` archives the separate prototype phone app. It is not a Race candidate.
- The checked-in `ios/App/ci_scripts/ci_post_clone.sh` installs dependencies, builds the web app and runs `cap sync ios`. The checked-in script and the previous cloud workflow do not establish that this PR's new companion can be signed or archived in Xcode Cloud.

## Required owner decisions and Apple prerequisites

1. Approve use of the proposed Watch bundle ID `com.anflyg.sailraceapp.watchkitapp`, and authorize the responsible Apple team administrator to verify/register it if absent and arrange Xcode Cloud automatic signing and provisioning for the embedded watchOS bundle. Verify the existing iPhone App Store Connect record, team, cloud-managed distribution signing permissions and existing Sign in with Apple entitlement/profile remain correct. Do not create or change these identities or profiles without that authorization. Apple notes that Watch bundle IDs may need registration before Cloud builds and that Xcode Cloud requires automatic signing ([Apple: first workflow](https://developer.apple.com/documentation/xcode/configuring-your-first-xcode-cloud-workflow/), [Apple: project setup](https://developer.apple.com/documentation/xcode/setting-up-your-project-to-use-xcode-cloud)). No new app capabilities are proposed.
2. Approve creation of a separate, manually started Race workflow and an internal-only TestFlight upload/distribution to specifically named internal testers. Confirm that their App Store Connect accounts have appropriate access and that the intended internal group exists; do not add people or start the workflow in advance. [Apple: internal testers](https://developer.apple.com/help/app-store-connect/test-a-beta-version/add-internal-testers/).
3. Approve the prototype Watch icon for internal testing or replace it in a separately scoped change. Confirm that installing a TestFlight build with the real iPhone bundle ID is acceptable on the chosen test devices and preserve existing local recordings.

## Shortest controlled path after approval

1. In the **Race** Xcode Cloud product, create a separate workflow for `anflyg/SailRaceApp`, scheme **App**. Choose a **Manual Start** condition limited to the `feat/watch-remote-solo` branch or PR #82; disable automatic branch, PR and schedule triggers. Use the established Xcode Cloud environment and existing post-clone script. [Apple: start conditions](https://developer.apple.com/documentation/xcode/configuring-start-conditions/).
2. Add an iOS Archive action with **TestFlight (Internal Testing Only)**. Add an internal TestFlight post-action only for the approved internal tester group, or manually assign the successfully uploaded internal-only build to that group in App Store Connect. Do not use the existing WatchTest product/scheme or the Race workflow's App Store Connect preparation setting. [Apple: distribution workflow](https://developer.apple.com/documentation/xcode/creating-a-workflow-that-builds-your-app-for-distribution/).
3. Before starting, verify the chosen branch and exact reviewed commit, team, App scheme, internal-only archive option, tester group and absence of automatic triggers. After explicit owner approval, start the workflow manually. Confirm the existing post-clone script succeeds, and inspect the resulting signed archive/export for the iPhone and embedded Watch bundle IDs, companion association, matching versions/build numbers and expected signatures/entitlements before assigning it to testers. Resolve any Apple account/profile error with the responsible administrator; do not change signing automatically as a workaround.
4. Install the internal build on the approved paired iPhone and Watch and record results against `watch-race-integration.md`: command execution/acknowledgment, timeout/reconnect and no replay, recording/gun continuity, Watch reset versus confirmed End race, recovery, gesture cancellation and accessibility. Apple recommends physical devices for WatchConnectivity testing ([Apple: WatchConnectivity](https://developer.apple.com/documentation/watchconnectivity/transferring-data-with-watch-connectivity)). Keep the PR draft and WatchTest target until paired validation passes.
