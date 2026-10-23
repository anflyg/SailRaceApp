# M2 iPhone cloud sync — mock-backed implementation

This PR implements the post-race client slice with injected session/Worker
boundaries. **Real sync stays disabled.** There is no default Worker URL, real
session provider, credential, R2 client or privileged Supabase call. Local races,
recording, export and analysis remain available without account/network.

Sources read: SailRaceApp PR #14/ADR-003 at
`9f73b49933c5c648fd8b49406ebb18bdfa74879b`, PR #15 roadmap at
`1f718453e015be84aabd3979427ba1c4b03adea5`, API PR #40/#41, and the
[pinned raw/upload contracts](../../src/services/sync/contracts/README.md).
ADR-007 remains PROPOSED; these PRs/decisions are not modified or accepted here.

## Client sequence and data

`RaceSyncCoordinator.sync()` is an explicit user action. It rejects active or
unfinished races and validates completed recording metadata before issuance.
If another recording is active or starts while identity work is awaiting a
response, sync defers before artifact preparation or subsequent upload steps;
resuming later keeps the same issued ID. An already submitted request can still
finish and is reconciled through the same idempotent protocol.
It obtains a 24-hour intent, persists it, retries cloud creation with that same
still-valid token, then uses only the returned UUIDv4 in the raw object. The
local ID is unchanged and never sent as the cloud identity. Missing race start,
end, samples or derivable duration/distance is not filled with invented values.

The mapper retains exactly raw-v1 fields; local names/day IDs, favourites,
wind-measurement diagnostics, summaries, elapsed/VMG fields and unrelated sensor
fields are excluded. AJV 2020 validates the pinned schemas; additional calendar,
ordering/interval, finite coordinate/range, 50,000-sample/10,000-event, 20 MiB
expanded and 5 MiB compressed checks apply. Existing summary calculation supplies
whole-second duration and sailed distance from recorded data. It adds no analysis
algorithm. `fflate` produces real gzip (fixed MTIME); Web Crypto hashes those exact
bytes. The immutable artifact/metadata is persisted before prepare. Retry reads
and verifies the saved bytes; local edits never silently regenerate them.

The typed `WorkerClient` implements the five approved endpoints. It accepts
201/200 idempotent creation and prepare, 204 empty content success and the exact
accepted-finalize DTO. It rejects mismatched race IDs, foreign content URLs,
malformed/oversized responses and unknown fields. Finalize confirmation is
required even when prepare reports accepted; content success alone never marks
sync accepted. No analysis-ready/completed claim is made.

## Durable state and failures

Persisted UI state follows ADR-003: `recorded_local`, `queued`, transient
`syncing`, `blocked_entitlement`, `invalid`, `accepted`. Internal `step` checkpoints
identify the next operation without adding uploading/prepared UI states. State
contains local/owner/cloud association, private intent/expiry until mapped,
artifact reference/version/digest/size/metadata, bounded attempts/backoff, safe
error category and accepted receipt. It contains no bearer/refresh token or
provider error body. A changed owner cannot read/resume the old association.

- Save issuance-pending before requesting an intent. Lost issuance with no token
  requires explicit action; it cannot automatically issue a replacement.
- Lost create response retries the same unexpired intent. Expiry never renews
  automatically. A new intent requires its explicit button and no known cloud ID.
- Restart after any checkpoint preserves the issued ID and saved artifact.
  Ambiguous content retries reconcile through prepare; finalize retries itself.
- Temporary transport/429/5xx failure allows at most three automatic attempts,
  persisted backoff/jitter and Retry-After. Long waits return to queued state;
  explicit retry cannot skip a persisted future backoff. Offline/reconnect needs
  an explicit resume; no timer/startup/recording hook initiates sync.
- 401 permits one refresh through the injected session adapter; missing or
  changed-owner sessions stop. Entitlement and permanent conflict/schema failures
  do not loop. Corrupt/missing committed identity or referenced artifact fails
  closed, retaining the local recording.
- A shared per-race in-process guard coalesces duplicate actions and excludes
  artifact removal during sync. It assumes the app's single WebView; it is not a
  cross-process lease. Server idempotency handles requests surviving interruption.

## Private persistent storage

Native storage reuses Capacitor Filesystem **Library**, not Cache or shared
Documents. Small JSON checkpoints and the separate immutable gzip artifact envelope
(base64 bytes plus its metadata) are private persistent files. An opaque hash of
the unchanged local ID provides lookup; mock/worker namespaces cannot mix receipts.
No sync payload or token is put in localStorage. The browser-only synthetic demo
uses transactional IndexedDB instead.

A native checkpoint writes a temporary file and renames it to a new monotonic
filename before discarding old versions. Reads choose only the latest committed
checkpoint, ignore temp files and never silently reset corrupt identity. Explicit
artifact removal also removes interrupted temp versions, preserves the accepted
association/receipt and sends no cloud DELETE. When a coordinator is injected,
local race removal explains that cloud data is not deleted; it removes the local
artifact first and refuses removal while sync is in progress. Real activation
still needs device-level persistence/file-protection/backup/restore verification;
injected filesystem tests are not evidence of iOS power-loss guarantees.

## UI and synthetic demonstration

The library shows modest localized per-race controls/status. Real controls remain
disabled because no real coordinator/session is wired in App. The separate
synthetic demonstration uses fixed fictional data and a persistent local fake
server. It reads no local races, GPS or real account. Its success label explicitly
says **no cloud upload**. Opening it lazily loads validation/compression; recording
startup does not initialize the sync engine. No background sync is installed.

## Native HTTP and remaining integration gates

The existing Capacitor 8.3.3 iOS implementation was inspected: `dataType: 'file'`
base64-decodes into `Data` and assigns `URLRequest.httpBody`; request headers
include the exact compressed Content-Length and application/gzip, with no
Content-Encoding. Redirects are disabled; HTTPS origin is explicitly injected.
The exported native adapter refuses web fallback. Source/injected-adapter checks
show the intended binary path; **actual iPhone → isolated Worker header/byte/hash
verification is still pending**, not a claimed provider/physical-device result.

Before real/nonproduction integration:

1. Finish the separate approved Apple/Supabase session integration. Inject only
   canonical owner UUID/current user access token and refresh capability, using
   reviewed native secure token storage. This PR implements no authentication.
2. Complete applicable M1/D5/D6 backend gates and approve an isolated Worker/test
   account. Inject its exact HTTPS origin/native transport and worker-namespaced
   private store; no production configuration or flag is supplied here.
3. Verify physical iPhone Content-Length/no-encoding/exact gzip SHA, restart,
   offline/account change and real prepare/content/finalize behavior. Measure CPU,
   memory and recording responsiveness; verify file protection and backup/restore
   policy and local/cloud removal/export semantics before personal-data rollout.
4. Resolve the **pre-existing** dependency advisories before native/network release.
   Runtime audit reports 4 entries: Capacitor iOS 8.3.3 (critical), tar 7.5.15
   (critical), xmldom 0.9.10 and brace-expansion 5.0.6 (high; tooling dependencies).
   All four versions are unchanged from main; AJV adds no reported advisory.
   [GHSA-rvm3-566m-v7fv](https://github.com/advisories/GHSA-rvm3-566m-v7fv)
   affects the native app-origin HTTP proxy even when CapacitorHttp is disabled.
   The advisory identifies patched 8.x releases including 8.4.3/8.5.1. A reviewed
   native SDK update/rebuild and physical regression are required; this mock
   client PR does not silently update the existing TestFlight native runtime.

## Validation

`npm test -- --maxWorkers=1`, `npm run build`, `npm run sync:validation`,
`npm run analysis:validation`, `npm run logged-race:analysis` and
`npm run simulation:test` use synthetic fixtures. New tests cover full HTTP flow,
checkpoint restarts/lost responses, expiry, account isolation/refresh, offline,
backoff, exact gzip/hash, validation limits, native serialization/crashes,
concurrency and local-only artifact removal. The Playwright sync check confirms
phone/tablet layout, accepted mock receipt after reload, unchanged synthetic local
recording and zero external requests. Existing analysis scripts now assert the
actual start panel and fail the process when their report fails.
