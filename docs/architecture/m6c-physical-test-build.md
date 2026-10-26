# M6c — local physical-iPhone test build

**Provider-test verdict: NO-GO.** The specific environment/test plan and applicable
security/privacy gates have not been approved or configured. Safe local caller,
asset isolation, tests and unsigned compilation are prepared. No provider request,
provisioning, remote migration, flag enablement, deployment or merge was performed.
ADR-007 remains PROPOSED. No accepted ADR/Auth/storage design changes are made.

## Dedicated caller and distribution boundary

The separate `native-test/index.html` entry displays **SYNTHETIC NATIVE WORKER TEST —
NONPRODUCTION — NOT FOR DISTRIBUTION**. It has no normal app navigation, GPS access,
race picker, local recording lookup or cloud fallback. It calls PR #22's unchanged
[`createIsolatedNativeSync`](../../src/services/sync/isolatedNative.ts), preserving
the one native session/Keychain authority, private worker Library journal, scoped
origin/project checkpoints and native HTTP transport. Only its fixed fictional
race is available. The normal app entry and real-sync controls do not import it.

All actions are manual: prepare (no provider I/O), restore, Apple sign-in, upload,
retry the same checkpoint, stop and logout. Startup/reload/reconnect never restores
Auth or sends a request. Leaving/backgrounding the screen stops the handle; stale
results cannot overwrite its status. A submitted request can still commit. Retry
uses the existing immutable artifact/identity, never resets unknown issuance or
silently requests a replacement intent. An accepted response means upload
acceptance, not completed analysis. Errors show only whitelisted categories, never
raw messages, user UUIDs, tokens, URLs, coordinates or full responses. Failed
protected logout keeps a manual retry and blocks preparation/sign-in/upload until
logout succeeds. Existing M6b/M6a tests remain the transport/ownership evidence.

`build:native-test` uses a separate Vite root/output (`dist-native-test`) and
`native-test` mode. It embeds only the explicitly selected public test config;
invalid/secret Supabase key configuration fails the build. Missing configuration
can build a harmless NO-GO screen with every provider action disabled.
The normal `build` excludes this caller, marker and test-only text.

The Xcode **Guard native test assets** phase checks both the marker file and
HTML sentinel. With test assets present it requires **Debug**, **ACTION=build**,
**TACKWISE_NATIVE_TEST_BUILD=1**, and **SKIP_INSTALL=YES**. Release and archive
(`ACTION=install`) fail. This guards supported local build/archive paths; it is not
an anti-tampering mechanism against someone editing source/build settings.
Do not archive, export, distribute, TestFlight-upload or deploy these assets.
Normal assets pass the guard without any test setting.

## Safe local build — no approval or provider configuration needed

Use this branch in its separate worktree; keep other delivery branches unchanged:

```sh
npm ci
npm run cap:copy:native-test
```

This type-checks/builds the dedicated entry and explicitly copies it with
`TACKWISE_NATIVE_TEST_BUILD=1`. It does not launch an app or contact Auth/Worker.
Without `.env.native-test.local`, all provider actions show NO-GO/disabled.
Do not put credentials into command-line build settings or commit environment files.

For unsigned generic native compilation (existing locked local Swift cache):

```sh
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug \
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /private/tmp/tackwise-m6c-native-derived \
  -clonedSourcePackagesDirPath /private/tmp/tackwise-m2-security-spm \
  -disableAutomaticPackageResolution -skipPackageUpdates \
  -onlyUsePackageVersionsFromResolvedFile CODE_SIGNING_ALLOWED=NO \
  TACKWISE_NATIVE_TEST_BUILD=1 SKIP_INSTALL=YES build
```

A new machine needs the reviewed locked packages installed/cached first; these
example cache paths are local evidence paths, not infrastructure configuration.
No simulator runtime or physical installation result follows from compilation.

## Operator actions still required before any provider test

| Area | Exact missing human action/evidence |
| --- | --- |
| Approval | Record the exact isolated project/Worker origin/bucket/backend revision, permitted synthetic account/device, test steps, evidence handling and cleanup/recovery plan. Obtain applicable M1/D5/D6 and security/privacy approval. The config assertion below records operator acknowledgement; it cannot authorize an environment by itself. |
| Apple | Confirm the existing Bundle ID `com.anflyg.sailraceapp`, App ID and team; approve Sign in with Apple capability and matching development entitlement/profile/certificate for the test device. Do not change the working TestFlight identity or automatic provisioning without that approval. No entitlement/signing change is included here. |
| Supabase Auth | Approve the isolated project, Apple-only native audience, nonce verification and email-optional provider; verify repeated/Hide My Email sign-in maps to the canonical UUID and account lifecycle. Supply only its public origin and publishable/anon key. Never supply service-role/Apple private keys to the app. |
| Worker / SQL / R2 | Approve the exact isolated backend baseline and origin, required SQL state/migrations/open gates/entitlement, hosted JWT verification, HMAC configuration/rotation, private R2 account/bucket and dedicated server-only credentials. Verify PostgREST behavior and conditional-write/unknown-outcome recovery evidence. Only the approved operator may provision or enable isolated provider flags later; no such action happens in this PR. |
| M1 / D5 / D6 | Review the authorization/closed-gate and cross-owner evidence, fenced publication/deletion/uncertainty limits, legacy writer exclusion, and isolated provider/crash/recovery drill plan. Distinguish prerequisites from evidence this first test will collect; local tests do not settle R2 finality, retention, restore or GDPR decisions. Explicitly record any restricted test-only approval and outstanding release gates. |
| Device | Approve development signing and a specific test iPhone. This uses the existing app identity/Keychain: installation may replace that identity's existing app. Protect unrelated local recordings per the approved plan; do not casually repoint a signed-in installation or invent a new App ID/Keychain namespace. |

After these approvals only, copy
[the blank public configuration template](../../.env.native-test.example) to ignored
`.env.native-test.local` and supply:

- `VITE_NATIVE_TEST_APPROVAL=approved-synthetic-only`, only after the specific plan/gates are recorded as approved.
- `VITE_NATIVE_TEST_WORKER_ORIGIN` and `VITE_NATIVE_TEST_APPROVED_WORKER_ORIGIN`: independently checked, identical exact approved HTTPS origins, no trailing slash/path/query/credentials.
- `VITE_SUPABASE_URL`: exact isolated HTTPS project origin.
- `VITE_SUPABASE_PUBLISHABLE_KEY`: that project's public publishable or legacy anon key.

Keep these values in the mode-specific ignored file, not a generic `.env.local`
that could configure the normal app. No example endpoint, key, default approval
or secret is committed. M6b checks exact public config agreement and native iOS;
a browser cannot perform this test. Environment values are bundled public config,
not authorization. Verify the final bundle and selected project before installation.

## First approved physical run

1. Rebuild/copy with `npm run cap:copy:native-test`. In the isolated worktree open
   the existing Xcode project and select **Debug** plus the approved physical
   iPhone/development profile. Set `TACKWISE_NATIVE_TEST_BUILD=1` and
   `SKIP_INSTALL=YES` as local build settings for this run. Do not archive/export;
   do not enable automatic provisioning or alter signing without approval.
2. Build/run only after the environment/device plan is approved. Check the
   NONPRODUCTION label. Tap **Prepare local test**; this must send no requests.
   Tap restore explicitly or Apple sign-in as appropriate. No other login exists.
3. Tap **Upload fixed synthetic race** once. Collect the minimized server/native
   evidence in the [M6b physical checklist](m6b-isolated-native-sync.md#physical-iphone-checklist-after-approval): exact gzip bytes/length/hash/no encoding,
   five endpoints, canonical owner, final receipt, and no token/payload logs.
4. Exercise stop/background, lost responses, offline/app kill, explicit restart/
   retry and account changes. Stop does not recall server work. Preserve the same
   checkpoint; use **Retry same checkpoint**, and escalate expired/unknown initial
   issuance to the approved procedure instead of clearing storage/new identity.
   Confirm Keychain/Library protection, file recovery/backup policy, no cross-owner
   reuse and unchanged offline recording. No personal GPS uploads are allowed.
5. Logout explicitly; retry a reported logout failure. Keep raw/result cleanup and
   unresolved provider evidence with the approved operator. Do not claim deletion
   or analysis completion from an upload receipt. After testing, stop the handle
   and follow the approved test-account/data cleanup plan.

To restore ordinary local assets before any normal build, clear the shell test
opt-in and run:

```sh
unset TACKWISE_NATIVE_TEST_BUILD
npm run cap:sync
```

Confirm `ios/App/App/public/native-test-only.json` is absent. Ordinary builds use
`dist`; the test build output stays separate and ignored. Do not distribute a
previously generated test `.app` merely because ordinary assets were restored.

## Local validation

- `npm ci`: passed; dependency versions/lockfile unchanged.
- Focused caller + M6b cases: **38 passed** across two files. Fourteen new cases
  cover missing approval/config, no construction/provider work, explicit actions,
  exact retry options, safe status/errors, stale stop/preparation/sync responses,
  failed logout retry, and Debug/Release/archive guard behavior.
- Full `npm test -- --maxWorkers=1`: **336 passed / 38 files**, no skips.
- Existing M6a compatibility: **5 passed**, unchanged against pinned read-only
  API/contracts. No new backend mock or provider test is introduced.
- Normal `npm run build`: passed, original asset hashes unchanged; inspection
  confirms no dedicated caller/marker/test text. Dedicated `build:native-test`
  and `cap:copy:native-test`: passed. A synthetic secret-key configuration is
  rejected before asset emission. No actual config values were supplied.
- Local phone browser check: unconfigured NO-GO screen, all seven actions
  disabled, no overflow/errors, and zero external requests, including reload.
  Existing `sync:validation`: passed unchanged demo/reload, local recording,
  disabled real controls, phone/tablet and zero external requests.
- Xcode 27.1 unsigned Debug generic simulator target with dedicated assets:
  **BUILD SUCCEEDED**, locked cached packages, no automatic package updates.
- Actual Xcode Release build with test assets: **rejected as expected** by the
  native guard (exit 65). Archive refusal (`ACTION=install`) is also unit tested;
  no archive/export is attempted. Ordinary release assets pass the guard tests.
- Project plist syntax, local Markdown links and `git diff --check`: passed.
  Local copied iOS assets were restored to the normal build after verification.

No simulator runtime or physical device/provider result is claimed. The existing
CoreSimulator version mismatch and upstream Filesystem/AppIntents warnings remain
nonfatal to generic compilation. Vite also warns that the reused source imports
need extension changes if a future major switches its config loader; the current
locked build succeeds, and no Auth/source refactor or warning suppression is made.
