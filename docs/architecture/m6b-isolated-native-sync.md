# M6b — isolated native synthetic upload preparation

**GO for local preparation/tests. NO-GO for provider testing now:** no isolated
origins, public Auth configuration, signing setup, environment approval or
physical-device evidence have been supplied. This PR makes no provider calls,
activates no controls/flags and changes no Auth architecture or accepted ADR.
ADR-007 remains PROPOSED.

## Explicit composition

[`createIsolatedNativeSync`](../../src/services/sync/isolatedNative.ts) reuses the
native `accountSession()` singleton / `NativeAccountSession`, `WorkerClient`,
`RaceSyncCoordinator`, `nativeWorkerTransport` and native private
`createSyncStore(..., 'worker')`. It is not imported by normal startup, Setup,
real-race controls or the independent demo. No automatic restoration, sign-in,
sync, reconnect timer or browser fallback is installed. Construction performs
configuration checks and an opaque hash, without Auth, filesystem or HTTP calls.

Only the fixed [synthetic race](../../src/services/sync/syntheticRace.ts) is cloned
inside the composition. The returned `sync(options?)` accepts retry/intent options,
never a race ID or recording. No GPS/user-race lookup is supplied. The existing
active-recording guard uses only `getActiveRaceId()` and does not change recording.

`account` is the existing native authority: its explicit restore/sign-in/logout
operations retain the existing Keychain, UUID, refresh and revocation semantics.
There is no second credential vault, mock identity, SDK instance policy or new
Auth configuration source. The requested public Auth values must exactly match
the current app's parsed `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY`; missing/invalid/mismatched values or unavailable
native Auth fail closed. Only iOS is admitted. No owner is taken from caller
configuration; the verified session's Supabase UUID remains authoritative.

Worker origin and expected approved origin must both be supplied and equal.
The existing native transport requires an exact HTTPS origin: no trailing slash,
path, credentials, query or fragment; redirects and browser fallback are disabled.
**Equality is a configuration guard, not proof of owner approval or that an origin
is nonproduction.** A reviewed test plan must identify the isolated environment;
there is no hostname heuristic, default origin, shipped allowlist or activation flag.

## Private state and interruption

The unchanged local fixture ID is replaced only within this composition by an
opaque hash of the exact Worker origin and Supabase project origin, tagged
`isolated-native-v1`. It is a local lookup ID, never the issued cloud UUID or a
field sent in raw telemetry. Different origin/project combinations get separate
checkpoint/artifact associations. Keys still use the existing `worker` namespace
and native Library journal; no mock receipt/artifact is adopted. Auth key rotation
within the same project does not silently abandon an existing cloud association.
Existing owner checks reject another account's checkpoint rather than transfer it.

Tokens remain in the existing Keychain/session authority and transient request
headers, not Filesystem, localStorage, IndexedDB or new diagnostics. Bridge logging
remains disabled. No personal GPS is available in this path. A project mismatch
in protected Auth state retains the existing fail-closed logout behavior; use a
reviewed dedicated test installation/profile rather than repoint an unrelated
signed-in installation. This task does not change Keychain namespace/restore policy.

`stop()` invalidates this test handle. Session admission checks before/after
awaited identity work and the client's post-response owner check prevent later
phases after stop, offline/background state, logout or account change. **A native
HTTP request already submitted cannot be recalled, and server-side work may
commit.** No cancellation/finality guarantee is added. Preserve the worker
checkpoint and immutable bytes, await outstanding local work, then explicitly
recreate the same composition and retry/reconcile; never switch to mock storage
or invent another cloud identity to recover a missing response. An unknown initial
intent issuance still needs the coordinator's existing explicit recovery policy.
`removeLocalArtifact()` is local-only and preserves association/receipt; it does
not delete cloud data or reset issuance uncertainty.

## Configuration still required — nothing configured here

| Input or prerequisite | Exact requirement |
| --- | --- |
| `purpose` | Literal `synthetic-nonproduction`; no other purpose accepted. |
| `workerOrigin` | Exact isolated HTTPS Worker origin chosen in the approved test plan. No value/default is committed. |
| `approvedWorkerOrigin` | Independently checked expected origin from that plan, exactly equal to the requested origin. |
| `auth.url` | Approved isolated Supabase HTTPS origin, exactly matching the app's `VITE_SUPABASE_URL`. |
| `auth.publishableKey` | Same project's public publishable/legacy anon key, exactly matching `VITE_SUPABASE_PUBLISHABLE_KEY`. Existing validation rejects secret/service-role keys. No private key/token belongs in config. |
| Native identity | Existing Bundle ID, approved Apple capability/entitlement/provisioning and Supabase native audience/nonce/email-optional setup per [authentication](authentication.md). No signing changes here. |
| Backend | Approved isolated revision/account/SQL gates/entitlement, issuance HMAC and private R2 configuration; applicable M1/D5/D6 evidence and separate approval for any isolated backend flag. No production flag changes. |
| Explicit caller | A separately reviewed test-only caller imports this module, supplies the approved values, invokes Auth explicitly, then `sync()`; stop the handle on exit. There is intentionally no shipped UI/button/URL parameter/global console hook. |

The runtime adapter parameter is for trusted local injection tests. The default
uses Capacitor HTTP, native Library and the same native account singleton. Do not
ship an injected mock session/transport or relabel a mock receipt as worker state.
A future approved caller must present the returned label
`SYNTHETIC NATIVE WORKER TEST — NONPRODUCTION`, preserve error/uncertainty categories,
and avoid token/config/payload logging. This PR does not add that caller or activate
a test build. Supplying values alone does not make the normal app upload anything.

## Physical iPhone checklist after approval

1. Check the exact test origins/project, native capability/signing, audience,
   nonce verification and email-optional Apple provider. Use only an approved
   isolated account and fixed synthetic telemetry. Inspect the built configuration
   for public-only values and disabled bridge logging.
2. Demonstrate sign-in/cancel/repeat/Hide My Email, canonical Supabase UUID,
   expiry/refresh/revocation and Keychain lock/restart/reinstall/restore behavior.
   Existing local races must stay available through logout/offline operations.
3. Invoke the explicit synthetic test. Capture minimized isolated server evidence
   of the five endpoints, owner, exact gzip Content-Length/no Content-Encoding,
   SHA-256 of the received/stored bytes, same UUID and finalize receipt. Validate
   the native body path and redirect rejection; do not log bearers or telemetry.
4. Interrupt after prepare, during content and after finalize dispatch; simulate
   lost responses, airplane mode/background/app kill and explicit restart/retry.
   Verify the same worker artifact/UUID survives, with no automatic reconnect or
   replacement intent after unknown issuance. Stop a handle and confirm no later
   phase is admitted; do not assume submitted server work was cancelled.
5. Logout/switch accounts during delayed responses. Confirm no later phase or
   cross-owner receipt reuse, and no credential transfer between projects.
   Check native Library storage protection, atomic checkpoint recovery and the
   approved backup/restore policy; inspect logs/browser/files for token leakage.
6. Measure CPU/memory and recording responsiveness; real recording/demo controls
   must stay unchanged and cloud-independent. Review backend conditional-write,
   recovery and cleanup evidence independently. No personal-data rollout or
   retention/restore approval follows from a synthetic test.

[M6a endpoint verdicts and remaining provider gaps](m6a-upload-compatibility.md)
and [M2 native prerequisites](m2-iphone-cloud-sync.md) remain applicable. The
known disabled-gate error envelope and mock post-acceptance PUT difference are
not changed by this composition.

## Validation evidence

- `npm ci`: passed; dependencies/lockfile unchanged.
- Focused native composition + existing account/client/storage tests: **55 passed**
  across four files. New cases cover invalid/missing/mismatched configuration,
  iOS/native-session admission, no construction I/O, exact native gzip headers/hash,
  worker Library journals, owner changes, stop during submitted content, lost
  native responses, explicit handle/storage recovery, offline/recording deferral,
  origin/project separation and storage failure before dispatch. Tests inject
  native adapters and fixed fictional data; they make no provider requests.
- Full `npm test -- --maxWorkers=1`: **322 passed / 37 files**, no skips.
- Existing M6a `npm run sync:compatibility` with pinned read-only API/contracts:
  **5 passed**, unchanged. No second backend or new infrastructure added.
- `npm run build`: TypeScript/Vite passed; normal asset hashes unchanged from M6a,
  confirming the test entry point is not bundled into normal startup.
- `npm run sync:validation`: passed independent demo, receipt after reload,
  unchanged synthetic local recording, disabled real controls, phone/tablet and
  zero external requests.
- Local Capacitor `cap sync ios`: passed; tracked native files/lock unchanged.
- Xcode 27.1 unsigned generic iOS Simulator target: **BUILD SUCCEEDED**, using
  the existing package cache with automatic resolution/updates disabled:

```sh
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug \
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /private/tmp/tackwise-m6b-native-derived \
  -clonedSourcePackagesDirPath /private/tmp/tackwise-m2-security-spm \
  -disableAutomaticPackageResolution -skipPackageUpdates \
  -onlyUsePackageVersionsFromResolvedFile CODE_SIGNING_ALLOWED=NO build
```

Nonfatal build diagnostics retain the existing local CoreSimulator version
mismatch (1171.7.0 versus 1174.9.2), an upstream Filesystem unused-value warning
and skipped AppIntents metadata extraction. The generic target builds; no
simulator runtime result follows from it.

No signing, installation, simulator runtime or physical iPhone test is claimed.
Local Markdown links and `git diff --check` pass. No provider configuration,
activation, deployment, migration, credentials or production endpoint is included.
