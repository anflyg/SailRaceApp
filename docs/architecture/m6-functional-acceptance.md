# M6 functional acceptance — 2026-10-31

## Evidence boundary

Current merged baselines: SailRaceApp `8fa17c6`, API `28e0c59`, contracts
`52d4a15`, Analysis `122d514`. This is a controlled owner acceptance procedure,
not production readiness or deletion approval. ADR-007 remains PROPOSED.
The operator reports working Apple/Supabase login, an uploaded 14 October race
and a visible production summary. This task has not read that race or contacted
providers. Existing D5 evidence is indexed in the [verification register](../security/adr-007-verification-register.md).

The ordinary library already composes logger → RecordedRaceSync → native session
and WorkerClient → RaceSyncCoordinator. Upload creates a server race identity,
validates immutable gzip, uses registered conditional private S3 storage and
PostgreSQL acceptance. Accepted uploads feed maintenance/Queue and the existing
analysis-v1 publisher. The browser uses the same authenticated Worker for summary
and seven-field owner detail, then shared map/replay/charts. No replacement runtime
implementation was identified. Existing `detailAvailable:false` metadata is
intentional: separate explicit detail capability controls the button.

The compatibility harness formerly pinned API PR #49; the accompanying change
pins merged API/contract revisions while retaining clean-source and exact-revision
checks. This is synthetic client/handler/contract evidence, not provider evidence.

## Consolidated operator authorization and preflight

Record one bounded approval covering the intended owner account, the existing
race read, optionally one new short recording/upload/analysis, evidence retention,
recovery contact and permitted configuration/deployments. Physical iPhone actions
are performed by the operator. Do not infer authorization from existing true flags.
No production write, deployment, migration, Secret/flag change or rotation is
performed by this task. Obtain the documented temporary detail-alpha security
approval before accessing real GPS; retain the server allowlist and owner checks.
The broader product direction does not itself remove that current gate.

Before either run, verify the exact API, consumer, Pages and installed iPhone
revisions, same Supabase Auth UUID on iPhone/browser, entitlement and open gates,
existing migrations through 00029 and their runtime grants. Report drift rather
than automatically applying migrations. Verify private bucket identity and existing
server credentials without exposing values. Confirm exact CORS origin, private
no-store responses, NEL/reporting approval, absence of GPS logging and approved
retention/restore constraints. Reuse unchanged register evidence.

For detail require `ANALYSIS_READ_API_ENABLED=true`,
`ANALYSIS_DETAIL_READ_API_ENABLED=true`, and valid server-only
`ANALYSIS_DETAIL_ALPHA_OWNER_ID` equal to the verified owner. Frontend requires
`VITE_CLOUD_ANALYSIS_ENABLED=true` and `VITE_CLOUD_DETAIL_ENABLED=true` at build
and the existing Auth public configuration. These names document prerequisites;
they authorize no changes. Confirm actual Workers plan/CPU budget and isolate
memory margin against API `docs/evidence/m4b-detail-resource-profile.md` before
activation. Local profiling does not qualify deployed CPU or concurrency.

For new upload additionally require existing `RACE_UPLOADS_ENABLED=true`,
`ANALYSIS_PROCESSING_ENABLED=true` on API and consumer, producer `ANALYSIS_QUEUE`
and the intended consumer/DLQ. Do not enable cleanup or race/account deletion.
Install the normal signed app containing recorded-library sync and recording stop
controls; do not use the synthetic native-test bundle for this real-recording run.

## Run A — existing accepted race first

1. Sign in on the website with the approved owner. Select the 14 October race;
   require ready status and an existing published summary. Do not re-upload,
   requeue or recalculate. If details are absent, stop and record the sanitized
   error/status; do not fabricate data or change the stored result.
2. Explicitly open detail. Confirm the expected GPS track, replay play/pause,
   scrub/speed/end, speed chart and only available wind/VMG/start/leg values.
   Missing telemetry must remain missing. No course geometry is invented.
3. Close/reopen, switch race, log out and switch account: old detail must vanish.
   No automatic second account login is required; use only separately authorized
   synthetic cross-owner checks. Store pass/fail/categories and revisions only,
   never GPS screenshots, keys, UUIDs, tokens or response bodies in public evidence.

## Run B — one new physical recording

1. After explicit write approval, sign in on iPhone; record a short intentional
   race. Stop and confirm local completion. Start no new recording during sync.
2. In Analysis → Library explicitly press Synchronize once. Observe upload
   accepted and retained local recording. Acceptance is not analysis completion.
3. Inspect bounded safe operational outcomes: accepted race, one Queue envelope,
   consumer claim, published result and ready summary. Correlate actual IDs only
   in approved private evidence. Browser must display that same race, then repeat
   Run A's detail checks. A bounded wait without ready status is failure/diagnosis,
   not permission to re-analyze or create another identity.
4. Collect retry/interruption/ownership evidence locally first. Any real network
   interruption or repeat transfer needs inclusion in the approved scope; reuse
   the existing journal and explicit retry, never clear unknown outcomes or local
   recordings. Stop on identity mismatch, ambiguous issuance or provider failure.

## Completion, disablement and remaining gates

Record A and B separately: revisions, approval reference, device build, UTC time,
accepted/ready/detail outcome and sanitized failure category. A source/mock pass
cannot fill a live result. If detail must be disabled, the approved operator can
close the backend detail flag and rebuild Pages with frontend detail capability
off; delivered bytes cannot be recalled. Preserve local data/journals and escalate
uncertainty; do not use deletion as acceptance cleanup.

The broad Builds/R2 principal remains a register risk (TW-D5-012/013). Plan its
replacement by privately mapping actual consumers, deriving minimum deployment
and bucket scopes, separately approving replacement, validating deployment and
only then retiring old authority. No rotation is performed here. Legacy writers,
unknown-outcome settlement, finite retention and quarantined backup/restore remain
TW-D5-014/016/019–022 release/deletion work, not excuses to duplicate local UI code.

## Local validation in this change

- SailRaceApp: `sync:compatibility` **5 passed** against pinned merged API and
  contracts; `vitest run src/services/sync` **143 passed**, including recorded
  composition, coordinator, native-session isolation, retry and immutable material.
- API: **321 passed** in 8 existing detail/contract/boundary/read/queue/maintenance/
  content/fencing test files. No new provider, SQL or CPU-profile run is claimed.
- Analysis: full existing suite **131 passed**, including live flag OFF/ON,
  owner detail, session changes, map/replay and missing/error states.
- All three TypeScript builds passed; both client Vite builds passed.
  `git diff --check` passed. No runtime implementation changed.
- Locked SailRaceApp installation reports 16 dependency findings (15 moderate,
  1 high); API and Analysis installations report zero. This is dependency-manager
  output, not an exploitability assessment. Preserve existing dependency review
  requirements before distribution; no automatic dependency upgrade was made.

These are 600 local tests with synthetic/injected boundaries. They do not prove
live R2/Supabase consistency, deployed Queue processing, physical native behavior,
production resource fitness or safe deletion. The existing operator-reported
14 October summary is the live functional evidence available to this task.
