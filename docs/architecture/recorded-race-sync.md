# User-initiated sync of recorded iPhone races

The ordinary iPhone app now connects **Analysis → Library → Synchronize** to
completed recordings in the existing local race store. This implements the
post-race product flow and ADR-003; it does not introduce another upload protocol,
storage format, identity scheme, analysis algorithm or infrastructure service.

## Implemented connection

`AppShell` mounts `RecordedRaceAnalysis` only for the analysis view. Outside manual
and simulation modes, iOS lazily loads `createRecordedRaceSync`. It requires the
existing native `accountSession()` and valid public Auth configuration for
`https://ikwnwdfvqybselccohxf.supabase.co`. No new build flag or credential is added.
Web, Android, missing/private configuration and foreign projects cannot compose
this path. The separate synthetic callers retain their existing boundaries.

The composition injects `getRace(localId)`, `getActiveRaceId()`, the existing
`nativeWorkerTransport` at `https://api.tackwise.se`, `WorkerClient`, and
worker-mode `nativePrivateFiles`/`createSyncStore` into `RaceSyncCoordinator`.
The synthetic and recorded callers share the native runtime adapters, without
sharing local race IDs or substituting synthetic data for recordings.

Opening the library reads saved status only. Only a button action calls `sync`.
There is no upload on recording completion, mounting, login, reconnect, restart
or a background timer. The native session remains the sole Keychain/token
authority; the sync layer obtains the canonical Supabase UUID and current bearer
through `current(refresh?)`. UI account changes discard stale status/results.

All existing immutable gzip/hash, private Library journals, server-issued cloud
UUID, owner association, single-refresh, bounded retry/backoff and finalize-receipt
checks remain in force. Neither success nor failure mutates the source recording.
The button and coordinator reject unfinished/active recordings; admission is
rechecked after awaited credential work and immediately before native dispatch.
An already submitted request may finish, but subsequent phases defer when a new
recording starts or the app goes offline/backgrounded.

The exact existing disabled API envelope (404, only `error: not_found`) produces
`uploads_disabled`. If intent issuance was definitively rejected at this gate,
its pending marker is cleared, permitting a later explicit retry. Lost/ambiguous
issuance still remains `issuance_uncertain`; no replacement intent is automatic.
Known cloud IDs and expired upload reservations are never silently replaced.

## Security, privacy and release boundary

The button explains that GPS/race data goes to the user's private TackWise account,
may consume a free race, and leaves local data intact. Acceptance is labelled as
upload acceptance, not completed analysis. Existing raw-v1 minimization excludes
local display names, email, credentials and unrelated diagnostics. No raw GPS,
token, identity or provider response is added to logs. Existing local deletion
continues to explain that it does not delete cloud data and uses the coordinator's
artifact-removal guard.

No server flag, schema, Auth setting, retention rule, backup rule or accepted ADR
is changed. The earlier M2/M6 synthetic-only statements describe those earlier
callers; this document records the newly implemented ordinary-library connection.
It does not establish physical iPhone HTTP/filesystem behavior or settle the
existing personal-data release prerequisites in [privacy design](../privacy/privacy-design.md)
and [retention policy](../privacy/retention-policy.md): demonstrated cloud deletion,
backup/restore handling and native file protection still require release evidence.
Do not infer that synthetic tests approve a wider GPS-data rollout.

## Installation and acceptance

1. Build this revision in the normal App scheme, with the same two existing public
   Auth build variables used by the working iPhone login. Build/sync through the
   existing Xcode Cloud hook or `npm run build` then `npx cap sync ios`. Distribute
   a new signed TestFlight build; an installed older build does not gain the UI.
2. Confirm the existing API environment and account admit real-race testing and
   have upload/entitlement access. The implementation changes no production gate.
   A missing-token POST to `/v1/race-creation-intents` returned the expected 401
   on 2026-10-29; this confirms route admission only, not an authenticated upload.
3. On the iPhone, sign in under Setup. Finish a local recording and stop all
   recording. In Analysis → Library tap Synchronize on that race. Expect upload
   accepted, with the local recording still available. Analysis readiness is a
   separate backend outcome, visible later in TackWise Analysis for the same UUID.
4. Interrupt connectivity during a transfer, reopen and explicitly retry. Verify
   the same accepted race appears once, local data remains exportable, recording
   blocks upload, and logout/account switching cannot resume another owner's
   association. Keep evidence free of GPS payloads, bearers and Apple identifiers.

## Automated evidence

- Unit suite: 384 passed in 40 files, including 16 new native-composition cases
  using actual logger/local-storage/coordinator/session components with injected
  fictional provider boundaries.
- Pinned API/contracts compatibility suite: 5 passed; snapshots are unchanged.
- Extended `sync:validation`: library button, native injected transfer, disabled
  gate, lost response/retry, retained local recordings, recording/sign-out guards,
  independent demo, receipt after reload, phone/tablet layout, zero external calls.
- TypeScript/Vite build, Capacitor iOS sync and existing `analysis:validation` pass.
- Xcode generic iOS Simulator build passes with signing disabled and the locked
  Swift packages. The initial stale package cache was replaced by a fresh cache
  resolving the same locked revisions; no dependency or native source changed.

These are local tests, not a claimed real GPS upload or signed-device acceptance.
